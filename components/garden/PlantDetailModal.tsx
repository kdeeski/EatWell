import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadGardenHarvestsForPlant } from '../../lib/data';
import type { GardenPlant, GardenHarvest, PlantStatus } from '../../types';
import { colors } from '../../constants/theme';

interface Props {
  plant: GardenPlant | null;
  onClose: () => void;
  onStatusChange: (id: string, status: PlantStatus) => void;
  onHarvest: (plant: GardenPlant) => void;
  onEdit: (plant: GardenPlant) => void;
  onDelete: (id: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  planted:   'Planted',
  growing:   'Growing',
  ready:     'Ready to Harvest',
  harvested: 'Harvested',
  finished:  'Finished',
};

const STATUS_COLORS: Record<string, string> = {
  planted:   colors.garden.planted,
  growing:   colors.garden.growing,
  ready:     colors.garden.ready,
  harvested: colors.garden.harvested,
  finished:  colors.garden.finished,
};

const STORAGE_LABELS: Record<string, string> = {
  fresh:     'Fresh',
  frozen:    'Frozen',
  preserved: 'Preserved',
};

export default function PlantDetailModal({ plant, onClose, onStatusChange, onHarvest, onEdit, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const [harvests, setHarvests] = useState<GardenHarvest[]>([]);
  const [loadingHarvests, setLoadingHarvests] = useState(false);

  useEffect(() => {
    if (!plant) return;
    setLoadingHarvests(true);
    loadGardenHarvestsForPlant(plant.id)
      .then(setHarvests)
      .catch(() => setHarvests([]))
      .finally(() => setLoadingHarvests(false));
  }, [plant?.id]);

  if (!plant) return null;

  const handleDelete = () => {
    Alert.alert(
      `Delete ${plant.plant_name}?`,
      'This will also remove all recorded harvests for this plant.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(plant.id) },
      ]
    );
  };

  return (
    <Modal
      visible={!!plant}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.headerClose}>×</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>{plant.plant_name}</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentCard}>
            {/* Status badge */}
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[plant.status] + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[plant.status] }]}>
                  {STATUS_LABELS[plant.status]}
                </Text>
              </View>
              {plant.is_cut_and_come_again && (
                <View style={styles.cutBadge}>
                  <Text style={styles.cutBadgeText}>Cut-and-come-again</Text>
                </View>
              )}
            </View>

            {/* Meta info */}
            {plant.variety && <MetaRow label="Variety" value={plant.variety} />}
            {plant.location_note && <MetaRow label="Location" value={plant.location_note} />}
            <MetaRow
              label="Planted"
              value={new Date(plant.planted_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
            />
            {plant.expected_ready_date && (
              <MetaRow
                label="Expected ready"
                value={new Date(plant.expected_ready_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}
              />
            )}
            {plant.quantity_planted != null && (
              <MetaRow label="Quantity planted" value={String(plant.quantity_planted)} />
            )}
            {plant.notes && <MetaRow label="Notes" value={plant.notes} />}

            {/* Action buttons */}
            <View style={styles.actionSection}>
              {(plant.status === 'planted' || plant.status === 'growing') && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => onStatusChange(plant.id, 'ready')}
                >
                  <Text style={styles.actionButtonText}>Mark Ready to Harvest</Text>
                </TouchableOpacity>
              )}
              {plant.status === 'ready' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.harvestButton]}
                  onPress={() => onHarvest(plant)}
                >
                  <Text style={[styles.actionButtonText, styles.harvestButtonText]}>Harvest</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Harvest history */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Harvest History</Text>
              {loadingHarvests ? (
                <ActivityIndicator color={colors.brand.primary} style={{ marginVertical: 16 }} />
              ) : harvests.length === 0 ? (
                <Text style={styles.emptyText}>No harvests recorded yet.</Text>
              ) : (
                harvests.map((h) => (
                  <View key={h.id} style={styles.harvestRow}>
                    <View style={styles.harvestInfo}>
                      <Text style={styles.harvestDate}>
                        {new Date(h.harvest_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                      {h.quantity != null && (
                        <Text style={styles.harvestQty}>
                          {h.quantity} {h.unit ?? ''} — {STORAGE_LABELS[h.storage] ?? h.storage}
                        </Text>
                      )}
                      {h.notes && <Text style={styles.harvestNotes}>{h.notes}</Text>}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Edit / Delete */}
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={() => onEdit(plant)}>
              <Text style={styles.actionLink}>Edit plant</Text>
            </TouchableOpacity>
            <Text style={styles.actionDivider}>·</Text>
            <TouchableOpacity onPress={handleDelete}>
              <Text style={styles.actionLinkDestructive}>Delete plant</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerClose: { fontSize: 28, color: colors.text.muted, fontWeight: '300', lineHeight: 28 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text.primary },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  contentCard: {
    backgroundColor: colors.background.surface,
    borderRadius: 16,
    padding: 20,
    gap: 20,
  },

  statusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 13, fontWeight: '600' },
  cutBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.state.warningSoft },
  cutBadgeText: { fontSize: 13, fontWeight: '600', color: colors.state.warning },

  metaRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border.hairline },
  metaLabel: { width: 130, fontSize: 13, color: colors.text.muted, fontWeight: '500' },
  metaValue: { flex: 1, fontSize: 13, color: colors.text.primary },

  actionSection: { gap: 8 },
  actionButton: {
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: colors.background.elevated,
  },
  actionButtonText: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },
  harvestButton: { backgroundColor: colors.brand.primary },
  harvestButtonText: { color: colors.text.inverse },

  section: { gap: 12 },
  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: colors.text.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  emptyText: { fontSize: 14, color: colors.text.placeholder },

  harvestRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.hairline,
  },
  harvestInfo: { gap: 2 },
  harvestDate: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  harvestQty: { fontSize: 13, color: colors.text.muted },
  harvestNotes: { fontSize: 13, color: colors.text.placeholder, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  actionLink: { fontSize: 13, color: colors.text.placeholder, fontWeight: '500' },
  actionLinkDestructive: { fontSize: 13, color: colors.state.dangerBright, fontWeight: '500' },
  actionDivider: { fontSize: 13, color: colors.border.default },
});
