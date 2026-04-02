import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { GardenSuggestion } from '../../types';

interface Props {
  suggestion: GardenSuggestion;
  onAddToGarden: () => void;
  onDismiss: () => void;
}

export default function SuggestionCard({ suggestion, onAddToGarden, onDismiss }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.plantName}>{suggestion.plant_name}</Text>
      <Text style={styles.why}>{suggestion.why_now}</Text>
      <Text style={styles.why}>{suggestion.why_worth_growing}</Text>
      <Text style={styles.why}>{suggestion.why_suits_cooking}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.addButton} onPress={onAddToGarden}>
          <Text style={styles.addButtonText}>+ Add to Garden</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissButtonText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#D1FAE5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 4,
  },
  plantName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#064E3B',
    marginBottom: 4,
  },
  why: {
    fontSize: 13,
    color: '#065F46',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
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
