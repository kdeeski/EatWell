import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadGardenHarvestsForPlant } from '../../lib/data';
import type { GardenPlant, GardenHarvest, PlantStatus } from '../../types';

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
  planted:   '#6B7280',
  growing:   '#D97706',
  ready:     '#3B7A57',
  harvested: '#9CA3AF',
  finished:  '#D1D5DB',
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
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{plant.plant_name}</Text>
          <TouchableOpacity onPress={() => onEdit(plant)}>
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 40 }]}>
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
          <Text style={styles.sectionLabel}>Harvest History</Text>
          {loadingHarvests ? (
            <ActivityIndicator color="#3B7A57" style={{ marginVertical: 16 }} />
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

          {/* Delete */}
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete Plant</Text>
          </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  closeText: { fontSize: 16, color: '#6B7280', width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', flex: 1, textAlign: 'center' },
  editText: { fontSize: 16, color: '#3B7A57', fontWeight: '600', width: 60, textAlign: 'right' },

  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },

  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 13, fontWeight: '600' },
  cutBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: '#FEF3C7' },
  cutBadgeText: { fontSize: 13, fontWeight: '600', color: '#D97706' },

  metaRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  metaLabel: { width: 130, fontSize: 13, color: '#6B7280', fontWeight: '500' },
  metaValue: { flex: 1, fontSize: 13, color: '#111827' },

  actionSection: { marginTop: 20, marginBottom: 8, gap: 8 },
  actionButton: {
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  actionButtonText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  harvestButton: { backgroundColor: '#3B7A57' },
  harvestButtonText: { color: '#fff' },

  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 24, marginBottom: 8,
  },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  harvestRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  harvestInfo: { gap: 2 },
  harvestDate: { fontSize: 14, fontWeight: '600', color: '#111827' },
  harvestQty: { fontSize: 13, color: '#6B7280' },
  harvestNotes: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },

  deleteButton: {
    marginTop: 32,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteButtonText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
});
