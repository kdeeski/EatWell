// Garden screen — active plants, what's ready to harvest, and seasonal prompts.

import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { getPlantsInSeasonNow, getWindfallFruitsInSeason } from '../../constants/gardenCalendar';

const STATUS_LABELS: Record<string, string> = {
  planted: 'Planted',
  growing: 'Growing',
  ready: 'Ready to harvest',
  harvested: 'Harvested',
  finished: 'Finished',
};

const STATUS_COLORS: Record<string, string> = {
  planted: '#6B7280',
  growing: '#D97706',
  ready: '#3B7A57',
  harvested: '#9CA3AF',
  finished: '#D1D5DB',
};

export default function GardenScreen() {
  const { gardenPlants } = useAppStore();

  const activePlants = gardenPlants.filter(
    (p) => p.status !== 'finished' && p.status !== 'harvested'
  );

  const inSeasonNow = getPlantsInSeasonNow();
  const windfallFruits = getWindfallFruitsInSeason();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Garden</Text>

      {/* Seasonal planting prompt */}
      {inSeasonNow.length > 0 && (
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>In season to plant now</Text>
          <Text style={styles.promptBody}>
            It's the right time for: {inSeasonNow.map((p) => p.plant).join(', ')}.
            Are you planning to put any seedlings in this month?
          </Text>
        </View>
      )}

      {/* Windfall fruits */}
      {windfallFruits.length > 0 && (
        <View style={[styles.promptCard, styles.windfallCard]}>
          <Text style={styles.promptTitle}>Seasonal fruit</Text>
          <Text style={styles.promptBody}>
            {windfallFruits.map((f) => f.plant).join(' and ')} season is here —
            worth factoring into this week's meals?
          </Text>
        </View>
      )}

      {/* Active plants */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>In the ground</Text>
        {activePlants.length === 0 ? (
          <Text style={styles.emptyText}>
            Nothing recorded yet — add plants when you put seedlings in.
          </Text>
        ) : (
          activePlants.map((plant) => (
            <View key={plant.id} style={styles.plantRow}>
              <View style={styles.plantInfo}>
                <Text style={styles.plantName}>{plant.plant_name}</Text>
                {plant.expected_ready_date && (
                  <Text style={styles.plantDate}>
                    Expected ready: {new Date(plant.expected_ready_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                  </Text>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[plant.status] + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[plant.status] }]}>
                  {STATUS_LABELS[plant.status]}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Past harvests link */}
      {gardenPlants.some((p) => p.status === 'harvested' || p.status === 'finished') && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Past harvests</Text>
          {gardenPlants
            .filter((p) => p.status === 'harvested' || p.status === 'finished')
            .map((plant) => (
              <View key={plant.id} style={[styles.plantRow, styles.plantRowMuted]}>
                <Text style={styles.plantNameMuted}>{plant.plant_name}</Text>
                <Text style={styles.statusText}>{STATUS_LABELS[plant.status]}</Text>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 20, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 24 },

  promptCard: {
    backgroundColor: '#D1FAE5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  windfallCard: { backgroundColor: '#FEF3C7' },
  promptTitle: { fontSize: 14, fontWeight: '700', color: '#065F46', marginBottom: 4 },
  promptBody: { fontSize: 14, color: '#064E3B', lineHeight: 20 },

  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  emptyText: { fontSize: 14, color: '#9CA3AF', lineHeight: 20 },

  plantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  plantRowMuted: { opacity: 0.6 },
  plantInfo: { flex: 1 },
  plantName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  plantNameMuted: { fontSize: 15, color: '#9CA3AF' },
  plantDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 12,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
});
