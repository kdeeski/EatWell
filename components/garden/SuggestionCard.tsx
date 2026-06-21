import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { GardenSuggestion } from '../../types';
import { colors } from '../../constants/theme';

interface Props {
  suggestion: GardenSuggestion;
  isFromWishlist?: boolean;
  onAddToGarden: () => void;
  onAddToWishlist: () => void;
  onDismiss: () => void;
}

export default function SuggestionCard({ suggestion, isFromWishlist, onAddToGarden, onAddToWishlist, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.plantName}>{suggestion.plant_name}</Text>
          {isFromWishlist && (
            <View style={styles.wishlistPill}>
              <Text style={styles.wishlistPillText}>From your list</Text>
            </View>
          )}
        </View>
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

          {(suggestion.soil_notes || suggestion.sun_notes) && (
            <View style={styles.growingNotes}>
              {suggestion.sun_notes ? (
                <Text style={styles.growingNote}>{'☀'} {suggestion.sun_notes}</Text>
              ) : null}
              {suggestion.soil_notes ? (
                <Text style={styles.growingNote}>{'⬡'} {suggestion.soil_notes}</Text>
              ) : null}
            </View>
          )}

          {suggestion.companion_note != null && (
            <Text style={styles.companionNote}>{'🌱'} {suggestion.companion_note}</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.addButton} onPress={onAddToGarden}>
              <Text style={styles.addButtonText}>+ Plant Now</Text>
            </TouchableOpacity>
            {!isFromWishlist && (
              <TouchableOpacity style={styles.wishlistButton} onPress={onAddToWishlist}>
                <Text style={styles.wishlistButtonText}>+ My List</Text>
              </TouchableOpacity>
            )}
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
    backgroundColor: colors.background.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  plantName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  wishlistPill: {
    backgroundColor: colors.brand.primary + '22',
    borderWidth: 1,
    borderColor: colors.brand.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  wishlistPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.brand.primary,
  },
  chevron: {
    fontSize: 11,
    color: colors.text.placeholder,
  },
  hint: {
    fontSize: 12,
    color: colors.text.placeholder,
    marginTop: 3,
  },

  whyBlock: {
    marginTop: 10,
  },
  whyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  whyText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },

  growingNotes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.hairline,
  },
  growingNote: {
    fontSize: 12,
    color: colors.text.secondary,
    backgroundColor: colors.background.elevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  companionNote: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 8,
    lineHeight: 18,
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  addButton: {
    flex: 1,
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
  wishlistButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary + '12',
    alignItems: 'center',
  },
  wishlistButtonText: {
    color: colors.brand.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: colors.text.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
