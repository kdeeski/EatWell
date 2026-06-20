import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  ActivityIndicator, Linking, TextInput, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import type { Recipe, RecipeCategory } from '../../types';
import RecipeDetailModal from '../../components/recipes/RecipeDetailModal';
import SaveRecipeModal from '../../components/recipes/SaveRecipeModal';
import { deleteRecipe, updateRecipe } from '../../lib/data';
import { toTitleCase } from '../../lib/titleCase';
import ImportFromClaudeModal from '../../components/recipes/ImportFromClaudeModal';
import DrinkPairingSection from '../../components/DrinkPairingSection';
import BitePairingSection from '../../components/BitePairingSection';
import { colors } from '../../constants/theme';
import { shared } from '../../constants/styles';

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
  mains: colors.category.mains,
  sauces_dressings: colors.category.sauces_dressings,
  sides: colors.category.sides,
  desserts: colors.category.desserts,
  baking: colors.category.baking,
  marinades_rubs: colors.category.marinades_rubs,
  cocktails: colors.category.cocktails,
  glossary: colors.category.glossary,
};

export default function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const { recipes, removeRecipe, updateRecipeInStore, userId } = useAppStore();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [showImport, setShowImport] = useState(false);

  const DRINK_PAIRING_CATEGORIES: RecipeCategory[] = ['mains', 'sides', 'desserts', 'baking'];

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return recipes.filter((r) => {
      const matchesCat = activeFilter === 'all' || r.category === activeFilter;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.ingredients ?? '').toLowerCase().includes(q) ||
        (r.source_book ?? '').toLowerCase().includes(q)
      );
    });
  }, [recipes, activeFilter, searchQuery]);

  const handleDelete = async (recipe: Recipe) => {
    try {
      await deleteRecipe(recipe.id);
      removeRecipe(recipe.id);
      setShowDetail(false);
      setSelectedRecipe(null);
    } catch (e: any) {
      Alert.alert('Could not delete', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const handleEdit = (recipe: Recipe) => {
    setShowDetail(false);
    setEditRecipe(recipe);
    setShowSave(true);
  };


  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background.app }}>
        {/* Header */}
        <View style={shared.headerBar}>
          <Text style={shared.headerTitle}>Recipes</Text>
          <View style={shared.headerButtons}>
            <TouchableOpacity
              style={shared.btnOutline}
              onPress={() => setShowImport(true)}
            >
              <Text style={shared.btnOutlineText}>Import</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={shared.btnFilled}
              onPress={() => { setEditRecipe(null); setShowSave(true); }}
            >
              <Text style={shared.btnFilledText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            placeholderTextColor={colors.text.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.searchClear} onPress={() => setSearchQuery('')}>
              <Text style={styles.searchClearText}>×</Text>
            </TouchableOpacity>
          )}
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
            {searchQuery.trim()
              ? `No recipes match "${searchQuery.trim()}".`
              : activeFilter === 'all'
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
            const isCocktail = item.category === 'cocktails';
            let sourceDomain: string | null = null;
            if (item.source_url) {
              try { sourceDomain = new URL(item.source_url).hostname.replace(/^www\./, ''); } catch {}
            }
            const sourceBookLabel = item.source_book
              ? (item.page_number ? `${item.source_book}, p.${item.page_number}` : item.source_book)
              : null;
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
                      {!isExpanded && (sourceDomain || sourceBookLabel) ? (
                        <Text style={styles.rowDomain}>{sourceBookLabel ?? sourceDomain}</Text>
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
                    ) : sourceBookLabel ? (
                      <Text style={styles.expandedDomain}>📖 {sourceBookLabel}</Text>
                    ) : null}

                    {item.description ? (
                      <Text style={styles.expandedDesc}>{item.description}</Text>
                    ) : null}

                    {item.category !== 'glossary' && (
                      <TouchableOpacity
                        style={shared.ctaRow}
                        onPress={() => item.source_url
                          ? Linking.openURL(item.source_url)
                          : (() => { setSelectedRecipe(item); setShowDetail(true); })()
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                      >
                        <Text style={styles.expandedViewFull}>
                          {item.source_url ? 'View original recipe' : 'View full recipe'}
                        </Text>
                        <Text style={shared.ctaArrow}>→</Text>
                      </TouchableOpacity>
                    )}

                    {showDrinkPairing && (
                      <DrinkPairingSection
                        mealName={item.name}
                        description={item.description}
                        compact
                      />
                    )}

                    {isCocktail && (
                      <BitePairingSection
                        recipeId={item.id}
                        recipeName={item.name}
                        recipeDescription={item.description}
                        bitePairing={item.bite_pairing}
                      />
                    )}

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

                    <View style={styles.expandedActions}>
                      <TouchableOpacity onPress={() => handleEdit(item)}>
                        <Text style={styles.expandedEdit}>Edit</Text>
                      </TouchableOpacity>
                      <Text style={styles.expandedActionDivider}>·</Text>
                      <TouchableOpacity onPress={() => Alert.alert(
                        'Delete recipe',
                        `Remove "${item.name}" from your stash?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item) },
                        ]
                      )}>
                        <Text style={styles.expandedDelete}>Delete</Text>
                      </TouchableOpacity>
                    </View>
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
  container: { flex: 1, backgroundColor: colors.background.app },

  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.background.surface, borderRadius: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, height: 38, fontSize: 15, color: colors.text.primary },
  searchClear: { paddingLeft: 8, paddingVertical: 8 },
  searchClearText: { fontSize: 20, color: colors.text.placeholder, lineHeight: 22 },

  pillScroll: { flexGrow: 0, backgroundColor: colors.background.app },
  pillContent: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  pillActive: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  pillText: { fontSize: 14, color: colors.text.muted, fontWeight: '500' },
  pillTextActive: { color: colors.text.inverse, fontWeight: '600' },

  listContent: { paddingHorizontal: 20, paddingTop: 4 },

  row: {
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 14,
    marginBottom: 8,
  },
  rowExpanded: { borderColor: colors.brand.primary, borderWidth: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowLeft: { flex: 1, gap: 6 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 16, fontWeight: '600', color: colors.text.primary },
  rowBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  rowBadgeText: { fontSize: 12, fontWeight: '600' },
  rowRating: { fontSize: 12, fontWeight: '600', color: colors.rating.star },
  rowDomain: { fontSize: 12, color: colors.text.placeholder },
  rowHint: { fontSize: 12, color: colors.text.placeholder },

  expandedBody: { marginTop: 10, gap: 8 },
  expandedDomain: { fontSize: 13, color: colors.text.link, fontWeight: '500' },
  expandedDesc: { fontSize: 14, color: colors.text.secondary, lineHeight: 21 },
  expandedViewFull: { fontSize: 13, fontWeight: '600', color: colors.text.link },
  expandedActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border.hairline },
  expandedEdit: { fontSize: 13, color: colors.text.muted, fontWeight: '500' },
  expandedActionDivider: { fontSize: 13, color: colors.border.default },
  expandedDelete: { fontSize: 13, color: colors.state.dangerBright, fontWeight: '500' },

  ratingRow: { marginTop: 12, gap: 6 },
  ratingLabel: { fontSize: 12, color: colors.text.placeholder, fontWeight: '500' },
  ratingChips: { flexDirection: 'row', gap: 6 },
  ratingChip: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.background.surface, alignItems: 'center', justifyContent: 'center' },
  ratingChipSelected: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  ratingChipText: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },
  ratingChipTextSelected: { color: colors.text.inverse },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: colors.text.muted, textAlign: 'center', lineHeight: 22 },
});
