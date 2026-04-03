import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recipe, RecipeCategory } from '../../types';

const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  mains: 'Mains',
  sauces_dressings: 'Sauces & Dressings',
  sides: 'Sides',
  desserts: 'Desserts',
  baking: 'Baking',
  marinades_rubs: 'Marinades & Rubs',
  glossary: 'Glossary',
  component: 'Component',
};

const CATEGORY_COLOURS: Record<RecipeCategory, string> = {
  mains: '#3B7A57',
  sauces_dressings: '#D97706',
  sides: '#6B7280',
  desserts: '#9333EA',
  baking: '#EA580C',
  marinades_rubs: '#0369A1',
  glossary: '#374151',
  component: '#0891B2',
};

interface Props {
  recipe: Recipe;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCookMode: () => void;
}

export default function RecipeDetailModal({ recipe, onClose, onEdit, onDelete, onCookMode }: Props) {
  const insets = useSafeAreaInsets();
  const badgeColour = CATEGORY_COLOURS[recipe.category];

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.headerBtn}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{recipe.name}</Text>
          <TouchableOpacity onPress={onEdit} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.headerBtnRight}>Edit</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Category badge + rating */}
          <View style={styles.metaRow}>
            <View style={[styles.categoryBadge, { backgroundColor: badgeColour + '22', borderColor: badgeColour + '44' }]}>
              <Text style={[styles.categoryBadgeText, { color: badgeColour }]}>
                {CATEGORY_LABELS[recipe.category]}
              </Text>
            </View>
            {recipe.rating != null && (
              <Text style={styles.rating}>{'★'.repeat(recipe.rating)}</Text>
            )}
          </View>

          {/* Description */}
          {recipe.description ? (
            <View style={styles.section}>
              <Text style={styles.bodyText}>{recipe.description}</Text>
            </View>
          ) : null}

          {/* Ingredients */}
          {recipe.ingredients ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Ingredients</Text>
              <Text style={styles.preText}>{recipe.ingredients}</Text>
            </View>
          ) : null}

          {/* Method */}
          {recipe.method ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Method</Text>
              <Text style={styles.preText}>{recipe.method}</Text>
            </View>
          ) : null}

          {/* Source URL */}
          {recipe.source_url ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Source</Text>
              <TouchableOpacity onPress={() => Linking.openURL(recipe.source_url!)}>
                <Text style={styles.linkText}>{recipe.source_url}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Cook Mode */}
          {recipe.method ? (
            <TouchableOpacity style={styles.cookModeBtn} onPress={onCookMode}>
              <Text style={styles.cookModeBtnText}>Cook Mode</Text>
            </TouchableOpacity>
          ) : null}

          {/* Delete */}
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Text style={styles.deleteBtnText}>Delete Recipe</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerBtn: { fontSize: 16, color: '#6B7280', fontWeight: '500', minWidth: 48 },
  headerBtnRight: { fontSize: 16, color: '#3B7A57', fontWeight: '600', minWidth: 48, textAlign: 'right' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1C1C1E', textAlign: 'center', marginHorizontal: 8 },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 20 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryBadgeText: { fontSize: 13, fontWeight: '600' },
  rating: { fontSize: 18, color: '#F59E0B', letterSpacing: 1 },

  section: { gap: 6 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bodyText: { fontSize: 15, color: '#374151', lineHeight: 22 },
  preText: { fontSize: 14, color: '#374151', lineHeight: 22, fontFamily: undefined },
  linkText: { fontSize: 14, color: '#3B7A57', textDecorationLine: 'underline' },

  cookModeBtn: {
    backgroundColor: '#3B7A57',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  cookModeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  deleteBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  deleteBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
});
