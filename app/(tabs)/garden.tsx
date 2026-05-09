// Garden screen — lifecycle tracker + AI planting suggestions.
// Harvesting a cut-and-come-again plant resets it to 'growing'.
// Harvesting any plant creates a garden-location inventory item.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import {
  updateGardenPlantStatus,
  recordHarvest,
  upsertInventoryItem,
  deleteGardenPlant,
  updateGardenPlant as updateGardenPlantDB,
  loadGardenSuggestions,
  saveGardenSuggestions,
  dismissGardenSuggestion,
  markSuggestionAddedToGarden,
} from '../../lib/data';
import { generateGardenSuggestions } from '../../lib/claude';
import type { GardenPlant, PlantStatus, HarvestStorage } from '../../types';
import AddPlantModal from '../../components/garden/AddPlantModal';
import HarvestModal from '../../components/garden/HarvestModal';
import PlantDetailModal from '../../components/garden/PlantDetailModal';
import SuggestionCard from '../../components/garden/SuggestionCard';

const STATUS_LABELS: Record<string, string> = {
  planted:   'Planted',
  growing:   'Growing',
  ready:     'Ready to Harvest',
  harvested: 'Harvested',
  finished:  'Finished',
};

const STATUS_COLORS: Record<string, string> = {
  planted:   '#6B7280',
  growing:   '#D97706',
  ready:     '#3B7A57',
  harvested: '#9CA3AF',
  finished:  '#D1D5DB',
};

function extractIngredientFrequency(meals: ReturnType<typeof useAppStore.getState>['plannedMeals']) {
  const counts = new Map<string, number>();
  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      if (ing.is_pantry_staple) continue;
      counts.set(ing.name, (counts.get(ing.name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, meal_count]) => ({ name, meal_count }));
}

export default function GardenScreen() {
  const insets = useSafeAreaInsets();
  const {
    gardenPlants,
    updateGardenPlant,
    addGardenPlantToStore,
    removeGardenPlant,
    upsertInventoryItem: upsertStore,
    inventoryItems,
    plannedMeals,
    gardenSuggestions,
    setGardenSuggestions,
    dismissSuggestion,
    userId,
  } = useAppStore();

  const [harvestTarget, setHarvestTarget]           = useState<GardenPlant | null>(null);
  const [detailTarget, setDetailTarget]             = useState<GardenPlant | null>(null);
  const [addPlantVisible, setAddPlantVisible]       = useState(false);
  const [addPlantInitialName, setAddPlantInitialName] = useState<string | undefined>();
  const [sourceSuggestionId, setSourceSuggestionId] = useState<string | undefined>();
  const [editTarget, setEditTarget]                 = useState<GardenPlant | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError]     = useState<string | null>(null);
  const [loadingMsgIndex, setLoadingMsgIndex]       = useState(0);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const LOADING_MESSAGES = [
    'Looking at what you already grow…',
    'Checking Canterbury\'s seasonal window…',
    'Matching to your cooking patterns…',
    'Finding what\'s worth growing at home…',
    'Almost there…',
  ];
  const [showPastHarvests, setShowPastHarvests]     = useState(false);

  const activePlants = gardenPlants.filter(
    (p) => p.status !== 'finished' && p.status !== 'harvested'
  );
  const pastPlants = gardenPlants.filter(
    (p) => p.status === 'harvested' || p.status === 'finished'
  );

  // ── Suggestions ─────────────────────────────────────────────────────────────

  const refreshSuggestions = useCallback(async () => {
    if (!userId || suggestionsLoading) return;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setLoadingMsgIndex(0);
    loadingIntervalRef.current = setInterval(() => {
      setLoadingMsgIndex((prev) => Math.min(prev + 1, LOADING_MESSAGES.length - 1));
    }, 3500);
    try {
      const now = new Date();
      const input = {
        current_month: now.getMonth() + 1,
        current_year: now.getFullYear(),
        location: 'Canterbury, New Zealand',
        plants_in_ground: gardenPlants
          .filter((p) => p.status === 'planted' || p.status === 'growing')
          .map((p) => ({ plant_name: p.plant_name, status: p.status })),
        cooked_meal_ingredients: extractIngredientFrequency(plannedMeals),
        inventory: inventoryItems.map((i) => ({ name: i.name, location: i.location })),
      };
      console.log('[garden-suggestions] calling with:', JSON.stringify(input));
      const suggestions = await generateGardenSuggestions(input);
      console.log('[garden-suggestions] got', suggestions.length, 'suggestions');
      const saved = await saveGardenSuggestions(
        userId,
        suggestions.map((s) => ({
          plant_name: s.plant_name,
          why_now: s.why_now,
          why_worth_growing: s.why_worth_growing,
          why_suits_cooking: s.why_suits_cooking,
          soil_notes: s.soil_notes ?? null,
          sun_notes: s.sun_notes ?? null,
          month_generated: now.getMonth() + 1,
        }))
      );
      setGardenSuggestions(saved);
    } catch (e: any) {
      const msg = e.message ?? 'Could not load garden suggestions.';
      console.error('[garden-suggestions] error:', msg);
      setSuggestionsError(msg);
    } finally {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = null;
      }
      setSuggestionsLoading(false);
    }
  }, [userId, gardenPlants, plannedMeals, inventoryItems, suggestionsLoading]);

  // Auto-refresh if no suggestions or suggestions are from a different month
  useEffect(() => {
    if (!userId) return;
    const currentMonth = new Date().getMonth() + 1;
    const activeSuggestions = gardenSuggestions.filter((s) => !s.dismissed);
    const hasCurrentMonth = activeSuggestions.some((s) => s.month_generated === currentMonth);

    if (activeSuggestions.length === 0 || !hasCurrentMonth) {
      // Try loading from DB first
      loadGardenSuggestions(userId)
        .then((saved) => {
          const savedActive = saved.filter((s) => s.month_generated === currentMonth);
          if (savedActive.length > 0) {
            setGardenSuggestions(saved);
          } else {
            refreshSuggestions();
          }
        })
        .catch(() => refreshSuggestions());
    }
  }, [userId]);

  const handleAddToGarden = (suggestionId: string, plantName: string) => {
    setSourceSuggestionId(suggestionId);
    setAddPlantInitialName(plantName);
    setAddPlantVisible(true);
  };

  const handleDismissSuggestion = async (id: string) => {
    dismissSuggestion(id);
    try {
      await dismissGardenSuggestion(id);
    } catch {
      // Optimistic update already applied — silent failure is acceptable
    }
  };

  // ── Plant actions ─────────────────────────────────────────────────────────────

  const handleMarkReady = async (plant: GardenPlant) => {
    try {
      await updateGardenPlantStatus(plant.id, 'ready');
      updateGardenPlant(plant.id, { status: 'ready' });
    } catch {
      Alert.alert('Error', 'Could not update plant status.');
    }
  };

  const handleHarvestDone = async (
    plant: GardenPlant,
    quantity: number,
    unit: string,
    storage: HarvestStorage,
    notes: string | null
  ) => {
    try {
      await recordHarvest({
        garden_plant_id: plant.id,
        user_id: userId!,
        harvest_date: new Date().toISOString().split('T')[0],
        quantity,
        unit,
        storage,
        notes,
      });

      // Cut-and-come-again: return to growing; otherwise mark harvested
      const newStatus: PlantStatus = plant.is_cut_and_come_again ? 'growing' : 'harvested';
      await updateGardenPlantStatus(plant.id, newStatus);
      updateGardenPlant(plant.id, { status: newStatus });

      const inventoryItem = await upsertInventoryItem({
        user_id: userId!,
        name: plant.plant_name.toLowerCase().trim(),
        category: 'herbs_spices',
        location: 'garden',
        quantity,
        unit,
        min_quantity: 0,
        notes: null,
        added_date: new Date().toISOString().split('T')[0],
        depleted: false,
      });
      upsertStore(inventoryItem);

      setHarvestTarget(null);
      setDetailTarget(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not record harvest.');
    }
  };

  const handleAddPlantSave = async (plant: GardenPlant) => {
    addGardenPlantToStore(plant);

    if (sourceSuggestionId) {
      try {
        await markSuggestionAddedToGarden(sourceSuggestionId);
      } catch { /* silent */ }
      dismissSuggestion(sourceSuggestionId);
      try {
        await dismissGardenSuggestion(sourceSuggestionId);
      } catch { /* silent */ }
    }

    setAddPlantVisible(false);
    setAddPlantInitialName(undefined);
    setSourceSuggestionId(undefined);
  };

  const handleDeletePlant = async (id: string) => {
    try {
      await deleteGardenPlant(id);
      removeGardenPlant(id);
      setDetailTarget(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not delete plant.');
    }
  };

  const handleEditPlant = (plant: GardenPlant) => {
    setDetailTarget(null);
    setEditTarget(plant);
    setAddPlantVisible(true);
  };

  const handleEditSave = async (updatedPlant: GardenPlant) => {
    updateGardenPlant(updatedPlant.id, updatedPlant);
    setAddPlantVisible(false);
    setEditTarget(null);
  };

  const handleStatusChange = async (id: string, status: PlantStatus) => {
    try {
      await updateGardenPlantStatus(id, status);
      updateGardenPlant(id, { status });
      // Refresh detail target if it's the same plant
      if (detailTarget?.id === id) {
        setDetailTarget((prev) => prev ? { ...prev, status } : prev);
      }
    } catch {
      Alert.alert('Error', 'Could not update plant status.');
    }
  };

  const activeSuggestions = gardenSuggestions.filter((s) => !s.dismissed);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.heading}>Garden</Text>

      {/* ── What to Plant Now ─────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>What to Plant Now</Text>
          <TouchableOpacity onPress={refreshSuggestions} disabled={suggestionsLoading}>
            <Text style={styles.refreshLink}>{suggestionsLoading ? 'Loading…' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>

        {suggestionsLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#3B7A57" />
            <Text style={styles.loadingText}>{LOADING_MESSAGES[loadingMsgIndex]}</Text>
          </View>
        ) : suggestionsError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Could not load suggestions</Text>
            <Text style={styles.errorDetail} selectable>{suggestionsError}</Text>
          </View>
        ) : activeSuggestions.length === 0 ? (
          <Text style={styles.emptyText}>
            No suggestions right now — tap Refresh to generate new ones.
          </Text>
        ) : (
          activeSuggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onAddToGarden={() => handleAddToGarden(s.id, s.plant_name)}
              onDismiss={() => handleDismissSuggestion(s.id)}
            />
          ))
        )}
      </View>

      {/* ── In the Ground ────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>In the Ground</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setAddPlantInitialName(undefined);
              setSourceSuggestionId(undefined);
              setAddPlantVisible(true);
            }}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {activePlants.length === 0 ? (
          <Text style={styles.emptyText}>
            Nothing recorded yet — add plants when you put seedlings in.
          </Text>
        ) : (
          activePlants.map((plant) => (
            <TouchableOpacity
              key={plant.id}
              style={styles.plantRow}
              onPress={() => setDetailTarget(plant)}
              activeOpacity={0.7}
            >
              <View style={styles.plantInfo}>
                <Text style={styles.plantName}>{plant.plant_name}</Text>
                {plant.variety && (
                  <Text style={styles.plantVariety}>{plant.variety}</Text>
                )}
                {plant.expected_ready_date && (
                  <Text style={styles.plantDate}>
                    Ready: {new Date(plant.expected_ready_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                  </Text>
                )}
              </View>

              <View style={styles.plantActions}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[plant.status] + '20' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[plant.status] }]}>
                    {STATUS_LABELS[plant.status]}
                  </Text>
                </View>

                {plant.status === 'growing' && (
                  <TouchableOpacity
                    style={styles.quickButton}
                    onPress={(e) => { e.stopPropagation?.(); handleMarkReady(plant); }}
                  >
                    <Text style={styles.quickButtonText}>Mark Ready</Text>
                  </TouchableOpacity>
                )}

                {plant.status === 'ready' && (
                  <TouchableOpacity
                    style={[styles.quickButton, styles.harvestQuickButton]}
                    onPress={(e) => { e.stopPropagation?.(); setHarvestTarget(plant); }}
                  >
                    <Text style={[styles.quickButtonText, styles.harvestQuickButtonText]}>Harvest</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* ── Past Harvests ─────────────────────────────────────────────────── */}
      {pastPlants.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowPastHarvests((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionLabel}>Past Harvests</Text>
            <Text style={styles.collapseToggle}>{showPastHarvests ? 'Hide' : `Show (${pastPlants.length})`}</Text>
          </TouchableOpacity>

          {showPastHarvests && pastPlants.map((plant) => (
            <TouchableOpacity
              key={plant.id}
              style={[styles.plantRow, styles.plantRowMuted]}
              onPress={() => setDetailTarget(plant)}
              activeOpacity={0.7}
            >
              <Text style={styles.plantNameMuted}>{plant.plant_name}</Text>
              <Text style={styles.statusTextMuted}>{STATUS_LABELS[plant.status]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {harvestTarget && (
        <HarvestModal
          plant={harvestTarget}
          onConfirm={(qty, unit, storage, notes) =>
            handleHarvestDone(harvestTarget, qty, unit, storage, notes)
          }
          onClose={() => setHarvestTarget(null)}
        />
      )}

      <AddPlantModal
        visible={addPlantVisible}
        initialName={editTarget ? undefined : addPlantInitialName}
        editPlant={editTarget}
        userId={userId ?? ''}
        onSave={editTarget ? handleEditSave : handleAddPlantSave}
        onClose={() => {
          setAddPlantVisible(false);
          setAddPlantInitialName(undefined);
          setSourceSuggestionId(undefined);
          setEditTarget(null);
        }}
      />

      <PlantDetailModal
        plant={detailTarget}
        onClose={() => setDetailTarget(null)}
        onStatusChange={handleStatusChange}
        onHarvest={(plant) => {
          setDetailTarget(null);
          setHarvestTarget(plant);
        }}
        onEdit={handleEditPlant}
        onDelete={handleDeletePlant}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 20, paddingBottom: 40 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 24 },

  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  refreshLink: { fontSize: 13, color: '#3B7A57', fontWeight: '600' },
  collapseToggle: { fontSize: 13, color: '#3B7A57', fontWeight: '600' },

  addButton: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: '#3B7A57', borderRadius: 8,
  },
  addButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadingText: { fontSize: 14, color: '#6B7280' },
  emptyText: { fontSize: 14, color: '#9CA3AF', lineHeight: 20 },
  errorBox: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, gap: 4,
  },
  errorTitle: { fontSize: 14, fontWeight: '600', color: '#DC2626' },
  errorDetail: { fontSize: 12, color: '#991B1B', lineHeight: 18 },

  plantRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 8,
  },
  plantRowMuted: { opacity: 0.6 },
  plantInfo: { flex: 1 },
  plantName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  plantVariety: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  plantDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  plantNameMuted: { fontSize: 15, color: '#9CA3AF', flex: 1 },
  plantActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextMuted: { fontSize: 12, color: '#9CA3AF' },

  quickButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F3F4F6' },
  quickButtonText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  harvestQuickButton: { backgroundColor: '#3B7A57' },
  harvestQuickButtonText: { color: '#fff' },
});
