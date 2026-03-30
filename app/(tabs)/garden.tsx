// Garden screen — lifecycle tracker. Marking a plant as harvested creates a
// garden-location inventory item so it shows up in the Pantry tab.

import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { getPlantsInSeasonNow, getWindfallFruitsInSeason } from '../../constants/gardenCalendar';
import { updateGardenPlantStatus, recordHarvest, upsertInventoryItem } from '../../lib/data';
import type { GardenPlant } from '../../types';

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

export default function GardenScreen() {
  const { gardenPlants, updateGardenPlant, upsertInventoryItem: upsertStore, userId } = useAppStore();
  const [harvestTarget, setHarvestTarget] = useState<GardenPlant | null>(null);

  const activePlants = gardenPlants.filter(
    (p) => p.status !== 'finished' && p.status !== 'harvested'
  );

  const inSeasonNow    = getPlantsInSeasonNow();
  const windfallFruits = getWindfallFruitsInSeason();

  const handleMarkReady = async (plant: GardenPlant) => {
    try {
      const updated = await updateGardenPlantStatus(plant.id, 'ready');
      updateGardenPlant(plant.id, { status: 'ready' });
    } catch {
      Alert.alert('Error', 'Could not update plant status.');
    }
  };

  const handleHarvestDone = async (plant: GardenPlant, quantity: number, unit: string) => {
    try {
      // 1. Record the harvest event
      await recordHarvest({
        garden_plant_id: plant.id,
        user_id: userId!,
        harvest_date: new Date().toISOString().split('T')[0],
        quantity,
        unit,
        storage: 'fresh',
        notes: null,
      });

      // 2. Mark plant as harvested
      await updateGardenPlantStatus(plant.id, 'harvested');
      updateGardenPlant(plant.id, { status: 'harvested' });

      // 3. Create / top-up inventory item with location: garden
      const inventoryItem = await upsertInventoryItem({
        user_id: userId!,
        name: plant.plant_name.toLowerCase().trim(),
        category: 'herbs_spices', // sensible default — user can edit in Pantry tab
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
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not record harvest.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Garden</Text>

      {/* Seasonal planting prompt */}
      {inSeasonNow.length > 0 && (
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>In Season to Plant Now</Text>
          <Text style={styles.promptBody}>
            It's the right time for: {inSeasonNow.map((p) => p.plant).join(', ')}.
          </Text>
        </View>
      )}

      {windfallFruits.length > 0 && (
        <View style={[styles.promptCard, styles.windfallCard]}>
          <Text style={styles.promptTitle}>Seasonal Fruit</Text>
          <Text style={styles.promptBody}>
            {windfallFruits.map((f) => f.plant).join(' and ')} season is here —
            worth factoring into this week's meals?
          </Text>
        </View>
      )}

      {/* Active plants */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>In the Ground</Text>
        {activePlants.length === 0 ? (
          <Text style={styles.emptyText}>Nothing recorded yet — add plants when you put seedlings in.</Text>
        ) : (
          activePlants.map((plant) => (
            <View key={plant.id} style={styles.plantRow}>
              <View style={styles.plantInfo}>
                <Text style={styles.plantName}>{plant.plant_name}</Text>
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
                  <TouchableOpacity style={styles.actionButton} onPress={() => handleMarkReady(plant)}>
                    <Text style={styles.actionButtonText}>Mark Ready</Text>
                  </TouchableOpacity>
                )}

                {plant.status === 'ready' && (
                  <TouchableOpacity style={[styles.actionButton, styles.harvestButton]} onPress={() => setHarvestTarget(plant)}>
                    <Text style={[styles.actionButtonText, styles.harvestButtonText]}>Harvest →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      {/* Past harvests */}
      {gardenPlants.some((p) => p.status === 'harvested' || p.status === 'finished') && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Past Harvests</Text>
          {gardenPlants
            .filter((p) => p.status === 'harvested' || p.status === 'finished')
            .map((plant) => (
              <View key={plant.id} style={[styles.plantRow, styles.plantRowMuted]}>
                <Text style={styles.plantNameMuted}>{plant.plant_name}</Text>
                <Text style={styles.statusTextMuted}>{STATUS_LABELS[plant.status]}</Text>
              </View>
            ))}
        </View>
      )}

      {/* Harvest modal */}
      {harvestTarget && (
        <HarvestModal
          plant={harvestTarget}
          onConfirm={(qty, unit) => handleHarvestDone(harvestTarget, qty, unit)}
          onClose={() => setHarvestTarget(null)}
        />
      )}
    </ScrollView>
  );
}

// ─── Harvest modal ────────────────────────────────────────────────────────────

function HarvestModal({ plant, onConfirm, onClose }: {
  plant: GardenPlant;
  onConfirm: (quantity: number, unit: string) => void;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit]         = useState('bunch');

  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Harvest {plant.plant_name}</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.formBody}>
            <Text style={styles.fieldLabel}>How much did you harvest?</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                autoFocus
              />
              <View style={{ width: 12 }} />
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={unit}
                onChangeText={setUnit}
                placeholder="bunch, piece, g…"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.harvestNote}>
              This will add {plant.plant_name} to your Pantry under Garden 🌿 so it shows on your inventory.
            </Text>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => onConfirm(parseFloat(quantity) || 1, unit.trim() || 'bunch')}
            >
              <Text style={styles.confirmButtonText}>Confirm Harvest</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 20, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 24 },

  promptCard: { backgroundColor: '#D1FAE5', borderRadius: 16, padding: 16, marginBottom: 16 },
  windfallCard: { backgroundColor: '#FEF3C7' },
  promptTitle: { fontSize: 14, fontWeight: '700', color: '#065F46', marginBottom: 4 },
  promptBody: { fontSize: 14, color: '#064E3B', lineHeight: 20 },

  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF', lineHeight: 20 },

  plantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 8 },
  plantRowMuted: { opacity: 0.6 },
  plantInfo: { flex: 1 },
  plantName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  plantNameMuted: { fontSize: 15, color: '#9CA3AF', flex: 1 },
  plantDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  plantActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextMuted: { fontSize: 12, color: '#9CA3AF' },

  actionButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F3F4F6' },
  actionButtonText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  harvestButton: { backgroundColor: '#3B7A57' },
  harvestButtonText: { color: '#fff' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalCancel: { fontSize: 16, color: '#6B7280', width: 60 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  formBody: { padding: 20, gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  textInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827' },
  row: { flexDirection: 'row' },
  harvestNote: { fontSize: 13, color: '#6B7280', lineHeight: 20, marginTop: 12, fontStyle: 'italic' },
  confirmButton: { backgroundColor: '#3B7A57', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
