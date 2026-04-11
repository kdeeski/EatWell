import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  ActivityIndicator, Linking,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import type { Recipe, RecipeCategory } from '../../types';
import RecipeDetailModal from '../../components/recipes/RecipeDetailModal';
import SaveRecipeModal from '../../components/recipes/SaveRecipeModal';
import { deleteRecipe, updateRecipe } from '../../lib/data';
import { toTitleCase } from '../../lib/titleCase';
import ImportFromClaudeModal from '../../components/recipes/ImportFromClaudeModal';
import { getWineMatch } from '../../lib/claude';
import type { WineMatchResult } from '../../lib/claude';

type FilterKey = 'all' | RecipeCategory;

const FILTER_LABELS: { key: FilterKey; label: string }[] = [
  { key: 'all',              label: 'All' },
  { key: 'mains',            label: 'Mains' },
  { key: 'sauces_dressings', label: 'Sauces & Dressings' },
  { key: 'sides',            label: 'Sides' },
  { key: 'desserts',         label: 'Desserts' },
  { key: 'baking',           label: 'Baking' },
  { key: 'marinades_rubs',   label: 'Marinades' },
  { key: 'cocktails',        label: 'Cocktails' },
  { key: 'glossary',         label: 'Glossary' },
];

const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  mains: 'Mains',
  sauces_dressings: 'Sauces & Dressings',
  sides: 'Sides',
  desserts: 'Desserts',
  baking: 'Baking',
  marinades_rubs: 'Marinades & Rubs',
  cocktails: 'Cocktails',
  glossary: 'Glossary',
};

const CATEGORY_COLOURS: Record<RecipeCategory, string> = {
  mains: '#3B7A57',
  sauces_dressings: '#D97706',
  sides: '#6B7280',
  desserts: '#9333EA',
  baking: '#EA580C',
  marinades_rubs: '#0369A1',
  cocktails: '#0891B2',
  glossary: '#374151',
};

export default function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const { recipes, removeRecipe, userPreferences, updateRecipeInStore, userId } = useAppStore();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Drink pairing state — keyed by recipe id so results persist when re-expanding
  const [wineResults, setWineResults] = useState<Record<string, WineMatchResult>>({});
  const [wineLoading, setWineLoading] = useState<string | null>(null);
  const [wineErrors, setWineErrors] = useState<Record<string, string>>({});

  const DRINK_PAIRING_CATEGORIES: RecipeCategory[] = ['mains', 'sides', 'desserts', 'baking'];

  async function handleWineMatch(recipe: Recipe) {
    setWineLoading(recipe.id);
    setWineErrors((prev) => { const n = { ...prev }; delete n[recipe.id]; return n; });
    try {
      const result = await getWineMatch({
        meal_name: recipe.name,
        description: recipe.description ?? undefined,
        detail_level: userPreferences?.wine_detail_level ?? 'simple',
      });
      setWineResults((prev) => ({ ...prev, [recipe.id]: result }));
    } catch (e: any) {
      setWineErrors((prev) => ({ ...prev, [recipe.id]: e.message ?? 'Could not fetch pairing.' }));
    } finally {
      setWineLoading(null);
    }
  }

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
            const isExpanded = expandedId === item.id;
            const showDrinkPairing = DRINK_PAIRING_CATEGORIES.includes(item.category);
            const wineResult = wineResults[item.id] ?? null;
            const wineError = wineErrors[item.id] ?? null;
            const isWineLoading = wineLoading === item.id;
            let sourceDomain: string | null = null;
            if (item.source_url) {
              try { sourceDomain = new URL(item.source_url).hostname.replace(/^www\./, ''); } catch {}
            }
            return (
              <TouchableOpacity
                style={[styles.row, isExpanded && styles.rowExpanded]}
                onPress={() => setExpandedId(isExpanded ? null : item.id)}
                onLongPress={() => { setEditRecipe(item); setShowSave(true); }}
                delayLongPress={400}
                activeOpacity={0.7}
              >
                <View style={styles.rowTop}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowName}>{toTitleCase(item.name)}</Text>
                    <View style={styles.rowMeta}>
                      <View style={[styles.rowBadge, { backgroundColor: colour + '22', borderColor: colour + '44' }]}>
                        <Text style={[styles.rowBadgeText, { color: colour }]}>
                          {CATEGORY_LABELS[item.category]}
                        </Text>
                      </View>
                      {item.rating != null && (
                        <Text style={styles.rowRating}>{item.rating}/5</Text>
                      )}
                      {sourceDomain && !isExpanded ? (
                        <Text style={styles.rowDomain}>{sourceDomain}</Text>
                      ) : null}
                      {!isExpanded && (
                        <Text style={styles.rowHint}>· Tap for details</Text>
                      )}
                    </View>
                  </View>
                </View>

                {isExpanded && (
                  <View style={styles.expandedBody}>
                    {sourceDomain ? (
                      <TouchableOpacity onPress={() => Linking.openURL(item.source_url!)} hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}>
                        <Text style={styles.expandedDomain}>{sourceDomain}</Text>
                      </TouchableOpacity>
                    ) : null}

                    {item.description ? (
                      <Text style={styles.expandedDesc}>{item.description}</Text>
                    ) : null}

                    {item.category !== 'glossary' && (
                      <TouchableOpacity
                        onPress={() => item.source_url
                          ? Linking.openURL(item.source_url)
                          : (() => { setSelectedRecipe(item); setShowDetail(true); })()
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                      >
                        <Text style={styles.expandedViewFull}>
                          {item.source_url ? 'View original recipe →' : 'View full recipe →'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {showDrinkPairing && (
                      wineResult ? (
                        <View style={styles.wineSection}>
                          {wineResult.pairings.map((p, i) => (
                            <View key={i} style={styles.wineCard}>
                              <Text style={styles.wineVarietal}>{p.varietal}</Text>
                              <Text style={styles.wineReason}>{p.reason}</Text>
                              {p.pairing_note ? (
                                <Text style={styles.wineNote}>{p.pairing_note}</Text>
                              ) : null}
                            </View>
                          ))}
                          <TouchableOpacity onPress={() => setWineResults((prev) => { const n = { ...prev }; delete n[item.id]; return n; })}>
                            <Text style={styles.wineDismiss}>Clear</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleWineMatch(item)}
                          disabled={isWineLoading}
                          hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                        >
                          {isWineLoading
                            ? <ActivityIndicator size="small" color="#3B7A57" style={{ alignSelf: 'flex-start', marginTop: 8 }} />
                            : <Text style={styles.expandedDrinkPairing}>Drink pairing →</Text>
                          }
                        </TouchableOpacity>
                      )
                    )}
                    {wineError ? (
                      <TouchableOpacity onPress={() => handleWineMatch(item)}>
                        <Text style={styles.wineError}>{wineError} Tap to retry.</Text>
                      </TouchableOpacity>
                    ) : null}

                    {item.category !== 'glossary' && (
                      <View style={styles.ratingRow}>
                        <Text style={styles.ratingLabel}>
                          {item.rating != null ? `Your rating: ${item.rating}/5` : 'Rate this meal:'}
                        </Text>
                        <View style={styles.ratingChips}>
                          {[1, 2, 3, 4, 5].map((r) => (
                            <TouchableOpacity
                              key={r}
                              style={[styles.ratingChip, item.rating === r && styles.ratingChipSelected]}
                              onPress={async () => {
                                if (!userId) return;
                                try {
                                  const updated = await updateRecipe(item.id, { ...item, rating: r as 1|2|3|4|5 });
                                  updateRecipeInStore(item.id, updated);
                                } catch { /* non-critical */ }
                              }}
                            >
                              <Text style={[styles.ratingChipText, item.rating === r && styles.ratingChipTextSelected]}>{r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 8,
  },
  rowExpanded: { borderColor: '#3B7A57', borderWidth: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowLeft: { flex: 1, gap: 6 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  rowBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  rowBadgeText: { fontSize: 12, fontWeight: '600' },
  rowRating: { fontSize: 12, fontWeight: '600', color: '#F59E0B' },
  rowDomain: { fontSize: 12, color: '#9CA3AF' },
  rowHint: { fontSize: 12, color: '#9CA3AF' },

  expandedBody: { marginTop: 10, gap: 8 },
  expandedDomain: { fontSize: 13, color: '#3B7A57', fontWeight: '500' },
  expandedDesc: { fontSize: 14, color: '#374151', lineHeight: 21 },
  expandedViewFull: { fontSize: 13, fontWeight: '600', color: '#3B7A57' },
  expandedDrinkPairing: { fontSize: 13, fontWeight: '600', color: '#3B7A57', marginTop: 2 },

  wineSection: { gap: 6, marginTop: 2 },
  wineCard: { backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', padding: 10, gap: 3 },
  wineVarietal: { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
  wineReason: { fontSize: 13, color: '#374151', lineHeight: 18 },
  wineNote: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 3 },
  wineDismiss: { fontSize: 12, color: '#9CA3AF' },
  wineError: { fontSize: 12, color: '#EF4444' },

  ratingRow: { marginTop: 12, gap: 6 },
  ratingLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  ratingChips: { flexDirection: 'row', gap: 6 },
  ratingChip: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  ratingChipSelected: { backgroundColor: '#3B7A57', borderColor: '#3B7A57' },
  ratingChipText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  ratingChipTextSelected: { color: '#FFFFFF' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
});
