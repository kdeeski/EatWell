import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import type { Recipe, RecipeCategory } from '../../types';
import RecipeDetailModal from '../../components/recipes/RecipeDetailModal';
import SaveRecipeModal from '../../components/recipes/SaveRecipeModal';
import CookModeModal from '../../components/recipes/CookModeModal';
import { deleteRecipe } from '../../lib/data';
import { toTitleCase } from '../../lib/titleCase';
import ImportFromClaudeModal from '../../components/recipes/ImportFromClaudeModal';

type FilterKey = 'all' | RecipeCategory;

const FILTER_LABELS: { key: FilterKey; label: string }[] = [
  { key: 'all',              label: 'All' },
  { key: 'mains',            label: 'Mains' },
  { key: 'sauces_dressings', label: 'Sauces & Dressings' },
  { key: 'sides',            label: 'Sides' },
  { key: 'desserts',         label: 'Desserts' },
  { key: 'baking',           label: 'Baking' },
  { key: 'marinades_rubs',   label: 'Marinades' },
  { key: 'glossary',         label: 'Glossary' },
];

const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  mains: 'Mains',
  sauces_dressings: 'Sauces & Dressings',
  sides: 'Sides',
  desserts: 'Desserts',
  baking: 'Baking',
  marinades_rubs: 'Marinades & Rubs',
  glossary: 'Glossary',
};

const CATEGORY_COLOURS: Record<RecipeCategory, string> = {
  mains: '#3B7A57',
  sauces_dressings: '#D97706',
  sides: '#6B7280',
  desserts: '#9333EA',
  baking: '#EA580C',
  marinades_rubs: '#0369A1',
  glossary: '#374151',
};

export default function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const { recipes, removeRecipe } = useAppStore();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [showCookMode, setShowCookMode] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const filtered = activeFilter === 'all'
    ? recipes
    : recipes.filter((r) => r.category === activeFilter);

  const handleDelete = async (recipe: Recipe) => {
    setShowDetail(false);
    setSelectedRecipe(null);
    try {
      await deleteRecipe(recipe.id);
      removeRecipe(recipe.id);
    } catch (e) {
      console.error('Failed to delete recipe', e);
    }
  };

  const handleEdit = (recipe: Recipe) => {
    setShowDetail(false);
    setEditRecipe(recipe);
    setShowSave(true);
  };

  const handleCookMode = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setShowDetail(false);
    setShowCookMode(true);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#F9FAFB' }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>Recipes</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.importBtn}
              onPress={() => setShowImport(true)}
            >
              <Text style={styles.importBtnText}>Import</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => { setEditRecipe(null); setShowSave(true); }}
            >
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pillContent}
        >
          {FILTER_LABELS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.pill, activeFilter === f.key && styles.pillActive]}
              onPress={() => setActiveFilter(f.key)}
            >
              <Text style={[styles.pillText, activeFilter === f.key && styles.pillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* Recipe list */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No recipes yet</Text>
          <Text style={styles.emptyBody}>
            {activeFilter === 'all'
              ? 'Your recipe stash is empty — save meals you love or add your own.'
              : `No ${FILTER_LABELS.find((f) => f.key === activeFilter)?.label ?? ''} recipes saved yet.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          renderItem={({ item }) => {
            const colour = CATEGORY_COLOURS[item.category];
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => { setSelectedRecipe(item); setShowDetail(true); }}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowName}>{toTitleCase(item.name)}</Text>
                  <View style={[styles.rowBadge, { backgroundColor: colour + '22', borderColor: colour + '44' }]}>
                    <Text style={[styles.rowBadgeText, { color: colour }]}>
                      {CATEGORY_LABELS[item.category]}
                    </Text>
                  </View>
                </View>
                {item.rating != null && (
                  <Text style={styles.rowRating}>{'★'.repeat(item.rating)}</Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Detail modal */}
      {showDetail && selectedRecipe && (
        <RecipeDetailModal
          recipe={selectedRecipe}
          onClose={() => { setShowDetail(false); setSelectedRecipe(null); }}
          onEdit={() => handleEdit(selectedRecipe)}
          onDelete={() => handleDelete(selectedRecipe)}
          onCookMode={() => handleCookMode(selectedRecipe)}
        />
      )}

      {/* Save/Edit modal */}
      {showSave && (
        <SaveRecipeModal
          visible={showSave}
          existingRecipe={editRecipe}
          onSave={(recipe) => {
            setShowSave(false);
            setEditRecipe(null);
            // If we were in edit mode from detail, re-open detail with updated recipe
            if (editRecipe) {
              setSelectedRecipe(recipe);
              setShowDetail(true);
            }
          }}
          onClose={() => { setShowSave(false); setEditRecipe(null); }}
        />
      )}

      {/* Cook mode modal */}
      {showCookMode && selectedRecipe?.method && (
        <CookModeModal
          recipeName={selectedRecipe.name}
          method={selectedRecipe.method}
          onClose={() => setShowCookMode(false)}
        />
      )}

      {/* Import from Claude modal */}
      <ImportFromClaudeModal
        visible={showImport}
        onClose={() => setShowImport(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E' },
  headerButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  importBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  importBtnText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  addBtn: {
    backgroundColor: '#3B7A57',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  pillScroll: { flexGrow: 0, backgroundColor: '#F9FAFB' },
  pillContent: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pillActive: { backgroundColor: '#3B7A57', borderColor: '#3B7A57' },
  pillText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  pillTextActive: { color: '#FFFFFF', fontWeight: '600' },

  listContent: { paddingHorizontal: 20, paddingTop: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 8,
  },
  rowLeft: { flex: 1, gap: 6 },
  rowName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  rowBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  rowBadgeText: { fontSize: 12, fontWeight: '600' },
  rowRating: { fontSize: 14, color: '#F59E0B', marginLeft: 8 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
});
