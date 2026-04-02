import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { GardenSuggestion } from '../../types';

interface Props {
  suggestion: GardenSuggestion;
  onAddToGarden: () => void;
  onDismiss: () => void;
}

export default function SuggestionCard({ suggestion, onAddToGarden, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.headerRow}>
        <Text style={styles.plantName}>{suggestion.plant_name}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {!expanded && (
        <Text style={styles.hint}>Tap for details</Text>
      )}

      {expanded && (
        <>
          <View style={styles.whyBlock}>
            <Text style={styles.whyLabel}>Now because</Text>
            <Text style={styles.whyText}>{suggestion.why_now}</Text>
          </View>
          <View style={styles.whyBlock}>
            <Text style={styles.whyLabel}>Worth growing</Text>
            <Text style={styles.whyText}>{suggestion.why_worth_growing}</Text>
          </View>
          <View style={styles.whyBlock}>
            <Text style={styles.whyLabel}>For your cooking</Text>
            <Text style={styles.whyText}>{suggestion.why_suits_cooking}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.addButton} onPress={onAddToGarden}>
              <Text style={styles.addButtonText}>+ Add to Garden</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#D1FAE5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plantName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#064E3B',
  },
  chevron: {
    fontSize: 11,
    color: '#059669',
  },
  hint: {
    fontSize: 12,
    color: '#059669',
    marginTop: 3,
  },

  whyBlock: {
    marginTop: 10,
  },
  whyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  whyText: {
    fontSize: 13,
    color: '#064E3B',
    lineHeight: 19,
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  addButton: {
    flex: 1,
    backgroundColor: '#3B7A57',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#A7F3D0',
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#065F46',
    fontSize: 14,
    fontWeight: '600',
  },
});
