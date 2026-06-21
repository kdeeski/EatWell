import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { getReplantAdvice } from '../../lib/claude';
import { useAppStore } from '../../store/useAppStore';
import type { GardenPlant, GardenHarvest, ReplantAdvice } from '../../types';
import { colors } from '../../constants/theme';
import { shared } from '../../constants/styles';

interface Props {
  plant: GardenPlant;
  harvests: GardenHarvest[];
  onAddToGarden: (plantName: string) => void;
}

function buildHarvestSummary(harvests: GardenHarvest[]): string | null {
  if (harvests.length === 0) return null;
  const sorted = [...harvests].sort(
    (a, b) => new Date(a.harvest_date).getTime() - new Date(b.harvest_date).getTime()
  );
  const first = new Date(sorted[0].harvest_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
  const last = new Date(sorted[sorted.length - 1].harvest_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });

  const totalQty = sorted.reduce((sum, h) => sum + (h.quantity ?? 0), 0);
  const units = sorted.find((h) => h.unit)?.unit ?? '';
  const storageTypes = [...new Set(sorted.map((h) => h.storage))].join(', ');

  let summary = `${harvests.length} harvest${harvests.length > 1 ? 's' : ''}`;
  if (harvests.length > 1) summary += ` between ${first} and ${last}`;
  else summary += ` on ${first}`;
  if (totalQty > 0) summary += `, total ${totalQty}${units ? ` ${units}` : ''}`;
  if (storageTypes) summary += `, ${storageTypes}`;
  return summary;
}

export default function PlantAgainSection({ plant, harvests, onAddToGarden }: Props) {
  const { gardenPlants } = useAppStore();
  const [result, setResult] = useState<ReplantAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const doFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const data = await getReplantAdvice({
        plant_name: plant.plant_name,
        variety: plant.variety,
        current_month: now.getMonth() + 1,
        current_year: now.getFullYear(),
        previous_planted_date: plant.planted_date ?? '',
        previous_notes: plant.notes,
        previous_location: plant.location_note,
        harvest_summary: buildHarvestSummary(harvests),
        plants_in_ground: gardenPlants
          .filter((p) => p.status === 'planted' || p.status === 'growing')
          .map((p) => ({ plant_name: p.plant_name, status: p.status })),
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not load advice.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (loading) return;
    if (result) { setExpanded(!expanded); return; }
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    doFetch();
  };

  const handleClear = () => {
    setResult(null);
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <TouchableOpacity style={shared.ctaRow} onPress={handleToggle} hitSlop={{ top: 8, bottom: 8 }}>
        {loading
          ? <ActivityIndicator size="small" color={colors.brand.primary} />
          : <>
              <Text style={styles.ctaText}>{result ? 'Replanting advice' : 'Plant again'}</Text>
              <Text style={shared.ctaArrow}>→</Text>
            </>
        }
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.section}>
      <TouchableOpacity onPress={handleToggle} hitSlop={{ top: 4, bottom: 4 }}>
        <Text style={shared.sectionLabel}>Plant again</Text>
      </TouchableOpacity>

      {loading && (
        <ActivityIndicator size="small" color={colors.brand.primary} style={{ alignSelf: 'flex-start' }} />
      )}

      {error && (
        <TouchableOpacity onPress={doFetch}>
          <Text style={styles.errorText}>{error} Tap to retry.</Text>
        </TouchableOpacity>
      )}

      {result && (
        <>
          <View style={[styles.timingCard, { backgroundColor: result.is_good_time ? colors.brand.primaryLighter : colors.state.warningSoft }]}>
            <Text style={[styles.timingText, { color: result.is_good_time ? colors.brand.primaryDark : colors.state.warningDark }]}>
              {result.timing}
            </Text>
          </View>

          <View style={styles.adviceBlock}>
            <Text style={styles.adviceLabel}>From your last grow</Text>
            <Text style={styles.adviceText}>{result.tips_from_history}</Text>
          </View>

          {(result.soil_notes || result.sun_notes || result.companion_note) && (
            <View style={styles.notesRow}>
              {result.sun_notes && (
                <Text style={styles.notePill}>☀ {result.sun_notes}</Text>
              )}
              {result.soil_notes && (
                <Text style={styles.notePill}>⬡ {result.soil_notes}</Text>
              )}
              {result.companion_note && (
                <Text style={styles.notePill}>🌱 {result.companion_note}</Text>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.addButton} onPress={() => onAddToGarden(plant.plant_name)}>
            <Text style={styles.addButtonText}>+ Add to Garden</Text>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.actionText}>×</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={doFetch} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.actionText}>Regenerate</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  ctaText: { fontSize: 13, fontWeight: '600', color: colors.brand.primary },
  errorText: { fontSize: 13, color: colors.state.dangerBright },

  timingCard: {
    borderRadius: 10,
    padding: 12,
  },
  timingText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },

  adviceBlock: { gap: 2 },
  adviceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  adviceText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },

  notesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notePill: {
    fontSize: 12,
    color: colors.text.secondary,
    backgroundColor: colors.background.elevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  addButton: {
    backgroundColor: colors.brand.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.text.inverse,
    fontSize: 14,
    fontWeight: '600',
  },

  actionRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  actionText: { fontSize: 12, color: colors.text.placeholder },
});
