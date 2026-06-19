import { useState, useEffect } from 'react';
import { loadCookLogForRecipe } from '../../lib/data';
import {
  Modal, View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Linking, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { Recipe, RecipeCategory } from '../../types';
import { getWineMatch } from '../../lib/claude';
import type { WineMatchResult } from '../../lib/claude';
import { useAppStore } from '../../store/useAppStore';
import { findStashMatch } from '../../lib/recipes';
import { saveRecipe } from '../../lib/data';
import { colors } from '../../constants/theme';

const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  mains: 'Mains',
  sauces_dressings: 'Sauces & Dressings',
  sides: 'Sides',
  desserts: 'Desserts',
  baking: 'Baking',
  marinades_rubs: 'Marinades & Rubs',
  glossary: 'Glossary',
  cocktails: 'Cocktails',
};

const CATEGORY_COLOURS: Record<RecipeCategory, string> = {
  mains: colors.category.mains,
  sauces_dressings: colors.category.sauces_dressings,
  sides: colors.category.sides,
  desserts: colors.category.desserts,
  baking: colors.category.baking,
  marinades_rubs: colors.category.marinades_rubs,
  glossary: colors.category.glossary,
  cocktails: colors.category.cocktails,
};

interface Props {
  recipe: Recipe;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function GuideComponentCard({ component }: { component: NonNullable<Recipe['guide_json']>['components'][0] }) {
  const [expanded, setExpanded] = useState(false);
  const [stashRecipe, setStashRecipe] = useState<Recipe | null>(null);
  const { recipes } = useAppStore();
  const inStash = component.steps.length === 0;

  function handleExpand() {
    if (!expanded && inStash && !stashRecipe) {
      const match = findStashMatch(component.name, recipes, { strict: true });
      setStashRecipe(match);
    }
    setExpanded((v) => !v);
  }

  return (
    <View style={styles.componentCard}>
      <TouchableOpacity style={styles.componentHeaderRow} onPress={handleExpand} activeOpacity={0.8}>
        <Text style={styles.componentName}>{component.name}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {!expanded && (
        <Text style={styles.componentHint}>
          {inStash ? 'In your stash — tap to view' : 'Tap for details'}
        </Text>
      )}
      {expanded && (
        <>
          <Text style={styles.componentDesc}>{component.description}</Text>
          {inStash ? (
            stashRecipe ? (
              <>
                {stashRecipe.ingredients ? (
                  <Text style={styles.preText}>{stashRecipe.ingredients}</Text>
                ) : null}
                {stashRecipe.method ? (
                  <Text style={[styles.preText, { marginTop: 8 }]}>{stashRecipe.method}</Text>
                ) : null}
                {stashRecipe.guide_json?.steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={styles.stepNum}>{i + 1}.</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.componentHint}>Recipe not found in stash.</Text>
            )
          ) : (
            component.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepNum}>{i + 1}.</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}

export default function RecipeDetailModal({ recipe, onClose, onEdit, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const { userPreferences, userId, inventoryItems, recipes, addRecipe } = useAppStore();
  const [screenOn, setScreenOn] = useState(false);
  const [wineResult, setWineResult] = useState<WineMatchResult | null>(null);
  const [wineLoading, setWineLoading] = useState(false);
  const [wineError, setWineError] = useState<string | null>(null);
  const [cookLog, setCookLog] = useState<Array<{ cooked_date: string; notes: string | null; rating: number | null; drink_name: string | null; drink_notes: string | null }>>([]);

  useEffect(() => {
    if (!userId) return;
    loadCookLogForRecipe(userId, recipe.name)
      .then(setCookLog)
      .catch(() => {});
  }, [userId, recipe.name]);

  const ratings = cookLog.map((e) => e.rating).filter((r): r is number => r != null);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
  const badgeColour = CATEGORY_COLOURS[recipe.category];
  const guide = recipe.guide_json;

  async function toggleScreenOn() {
    if (screenOn) {
      if (Platform.OS !== 'web') deactivateKeepAwake();
      setScreenOn(false);
    } else {
      if (Platform.OS !== 'web') await activateKeepAwakeAsync();
      setScreenOn(true);
    }
  }

  async function handleWineMatch() {
    setWineLoading(true);
    setWineError(null);
    try {
      const barItems = inventoryItems
        .filter((i) => (i.location === 'bar' || i.location === 'cellar') && !i.depleted)
        .map((i) => i.name);
      const result = await getWineMatch({
        meal_name: recipe.name,
        description: recipe.description ?? undefined,
        detail_level: userPreferences?.wine_detail_level ?? 'simple',
        bar_inventory: barItems.length > 0 ? barItems : undefined,
      });
      setWineResult(result);
    } catch (e: any) {
      setWineError(e.message ?? 'Could not fetch wine pairing.');
    } finally {
      setWineLoading(false);
    }
  }

  return (
    <>
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.headerBtn}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{recipe.name}</Text>
            <View style={{ minWidth: 48 }} />
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
              {avgRating != null ? (
                <Text style={styles.rating}>
                  ★ {avgRating % 1 === 0 ? avgRating.toFixed(0) : avgRating.toFixed(1)}/5
                  {ratings.length > 1 ? <Text style={styles.ratingCount}> ({ratings.length}×)</Text> : null}
                </Text>
              ) : recipe.rating != null ? (
                <Text style={styles.rating}>★ {recipe.rating}/5</Text>
              ) : null}
            </View>

            {/* Description */}
            {recipe.description ? (
              <View style={styles.section}>
                <Text style={styles.bodyText}>{recipe.description}</Text>
              </View>
            ) : null}

            {guide ? (
              /* ── Guide layout (saved from cooking guide) ── */
              <>
                {recipe.ingredients ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Ingredients</Text>
                    <Text style={styles.preText}>{recipe.ingredients}</Text>
                  </View>
                ) : null}

                <View style={styles.section}>
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel}>How to cook it</Text>
                    <TouchableOpacity style={[styles.cookModePill, screenOn && styles.cookModePillActive]} onPress={toggleScreenOn}>
                      <Text style={styles.cookModePillText}>{screenOn ? 'Screen On ✓' : 'Keep Screen On'}</Text>
                    </TouchableOpacity>
                  </View>
                  {guide.steps.map((step, i) => (
                    <View key={i} style={styles.stepRow}>
                      <Text style={styles.stepNum}>{i + 1}.</Text>
                      <Text style={styles.stepText}>{step}</Text>
                    </View>
                  ))}
                </View>

                {guide.components.length > 0 && (
                  <View style={styles.section}>
                    {guide.components.map((comp, i) => (
                      <GuideComponentCard key={i} component={comp} />
                    ))}
                  </View>
                )}

                {guide.glossary.length > 0 && (
                  <View style={styles.section}>
                    {guide.glossary.map((item, i) => (
                      <View key={i} style={styles.glossaryRow}>
                        <Text style={styles.glossaryTerm}>{item.term}</Text>
                        <Text style={styles.glossaryDef}>{item.definition}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              /* ── Standard layout (manually added recipe) ── */
              <>
                {recipe.ingredients ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Ingredients</Text>
                    <Text style={styles.preText}>{recipe.ingredients}</Text>
                  </View>
                ) : null}

                {recipe.method ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Method</Text>
                    <Text style={styles.preText}>{recipe.method}</Text>
                  </View>
                ) : null}

                {recipe.method ? (
                  <TouchableOpacity style={[styles.cookModeBtn, screenOn && styles.cookModeBtnActive]} onPress={toggleScreenOn}>
                    <Text style={styles.cookModeBtnText}>{screenOn ? 'Screen On ✓' : 'Keep Screen On'}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}

            {/* Source */}
            {recipe.source_url ? (() => {
              let domain = recipe.source_url;
              try { domain = new URL(recipe.source_url).hostname.replace(/^www\./, ''); } catch {}
              return (
                <View style={styles.section}>
                  <TouchableOpacity style={styles.sourceLink} onPress={() => Linking.openURL(recipe.source_url!)}>
                    <Text style={styles.sourceLinkLabel}>View Original Recipe →</Text>
                    <Text style={styles.sourceLinkDomain}>{domain}</Text>
                  </TouchableOpacity>
                </View>
              );
            })() : recipe.source_book ? (
              <View style={styles.section}>
                <Text style={styles.sourceLinkLabel}>📖 {recipe.source_book}{recipe.page_number ? `, p. ${recipe.page_number}` : ''}</Text>
              </View>
            ) : null}

            {/* Drink pairing — only for mains/sides/desserts/baking */}
            {!['glossary', 'sauces_dressings', 'marinades_rubs', 'cocktails'].includes(recipe.category) && <View style={styles.section}>
              {wineResult ? (
                <>
                  <Text style={styles.sectionLabel}>Drink pairing</Text>
                  {wineResult.pairings.map((p, i) => {
                    const inGlossary = recipes.some((r) => r.category === 'glossary' && r.name.toLowerCase() === p.varietal.toLowerCase());
                    return (
                      <View key={i} style={styles.wineCard}>
                        <Text style={styles.wineVarietal}>{p.varietal}</Text>
                        <Text style={styles.wineReason}>{p.reason}</Text>
                        {p.pairing_note ? (
                          <Text style={styles.wineNote}>{p.pairing_note}</Text>
                        ) : null}
                        {userId && (
                          inGlossary
                            ? <Text style={styles.glossarySaved}>In glossary ✓</Text>
                            : <TouchableOpacity onPress={async () => {
                                const saved = await saveRecipe(userId, { name: p.varietal, category: 'glossary', description: p.reason + (p.pairing_note ? '\n' + p.pairing_note : ''), ingredients: null, method: null, source_url: null, source_book: null, page_number: null, rating: null, would_cook_again: null, cooked_meal_id: null, guide_json: null, bite_pairing: null });
                                addRecipe(saved);
                              }}>
                                <Text style={styles.glossaryAdd}>+ Save to glossary</Text>
                              </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                  {wineResult.cocktail && (
                    <View style={[styles.wineCard, styles.cocktailCard]}>
                      <Text style={[styles.wineVarietal, styles.cocktailName]}>🍸 {wineResult.cocktail.name}</Text>
                      <Text style={styles.wineReason}>{wineResult.cocktail.reason}</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => setWineResult(null)}>
                    <Text style={styles.wineDismiss}>Clear</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={handleWineMatch} disabled={wineLoading}>
                  {wineLoading
                    ? <ActivityIndicator size="small" color={colors.brand.primary} />
                    : <Text style={styles.sourceLinkLabel}>Drink pairing →</Text>
                  }
                </TouchableOpacity>
              )}
              {wineError ? (
                <TouchableOpacity onPress={handleWineMatch}>
                  <Text style={styles.wineError}>{wineError} Tap to retry.</Text>
                </TouchableOpacity>
              ) : null}
            </View>}

            {/* Cook log */}
            {cookLog.some((e) => e.notes || e.drink_name) && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Cook log</Text>
                {cookLog.filter((e) => e.notes || e.drink_name).map((entry, i) => {
                  const [, m, d] = entry.cooked_date.split('-');
                  return (
                    <View key={i} style={styles.cookLogRow}>
                      <Text style={styles.cookLogDate}>{d}/{m}</Text>
                      <View style={{ flex: 1 }}>
                        {entry.notes ? <Text style={styles.cookLogNote}>{entry.notes}</Text> : null}
                        {entry.drink_name ? (
                          <Text style={styles.cookLogDrink}>🍷 {entry.drink_name}{entry.drink_notes ? ` · ${entry.drink_notes}` : ''}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Edit / Delete */}
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={onEdit}>
                <Text style={styles.actionLink}>Edit recipe</Text>
              </TouchableOpacity>
              <Text style={styles.actionDivider}>·</Text>
              <TouchableOpacity onPress={() => Alert.alert(
                'Delete recipe',
                `Remove "${recipe.name}" from your stash?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: onDelete },
                ],
              )}>
                <Text style={styles.actionLinkDestructive}>Delete recipe</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.surface },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border.hairline,
  },
  headerBtn: { fontSize: 16, color: colors.text.muted, fontWeight: '500', minWidth: 48 },
  headerBtnRight: { fontSize: 16, color: colors.text.link, fontWeight: '600', minWidth: 48, textAlign: 'right' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text.primary, textAlign: 'center', marginHorizontal: 8 },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 20 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  categoryBadgeText: { fontSize: 13, fontWeight: '600' },
  rating: { fontSize: 14, fontWeight: '700', color: colors.rating.star },

  section: { gap: 12 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  bodyText: { fontSize: 15, color: colors.text.secondary, lineHeight: 22 },
  preText: { fontSize: 14, color: colors.text.secondary, lineHeight: 22 },
  linkText: { fontSize: 14, color: colors.text.link, textDecorationLine: 'underline' },

  sectionLabelText: { fontSize: 13, fontWeight: '600', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },

  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { fontSize: 15, fontWeight: '700', color: colors.brand.primary, minWidth: 22 },
  stepText: { flex: 1, fontSize: 15, color: colors.text.secondary, lineHeight: 22 },

  componentCard: { backgroundColor: colors.background.elevated, borderRadius: 12, borderWidth: 1, borderColor: colors.border.default, padding: 14, gap: 8 },
  componentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  componentName: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  chevron: { fontSize: 11, color: colors.text.placeholder },
  componentHint: { fontSize: 12, color: colors.text.placeholder },
  componentDesc: { fontSize: 14, color: colors.text.muted, lineHeight: 20 },
  componentStashLink: { fontSize: 14, color: colors.text.link, fontWeight: '600' },

  ratingCount: { fontSize: 12, color: colors.text.placeholder, fontWeight: '400' },

  cookLogRow: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border.hairline },
  cookLogDate: { fontSize: 13, fontWeight: '600', color: colors.text.placeholder, minWidth: 36 },
  cookLogNote: { fontSize: 14, color: colors.text.secondary, lineHeight: 20 },
  cookLogDrink: { fontSize: 13, color: colors.brand.plum, lineHeight: 18, marginTop: 2 },

  glossaryRow: { gap: 2 },
  glossaryTerm: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  glossaryDef: { fontSize: 14, color: colors.text.secondary, lineHeight: 20 },

  cookModePill: { backgroundColor: colors.brand.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  cookModePillActive: { backgroundColor: colors.brand.primary },
  cookModePillText: { fontSize: 12, fontWeight: '700', color: colors.text.inverse, letterSpacing: 0.3 },

  cookModeBtn: { backgroundColor: colors.brand.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  cookModeBtnActive: { backgroundColor: colors.brand.primaryDark },
  cookModeBtnText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700' },

  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  actionLink: { fontSize: 13, color: colors.text.placeholder, fontWeight: '500' },
  actionLinkDestructive: { fontSize: 13, color: colors.state.dangerBright, fontWeight: '500' },
  actionDivider: { fontSize: 13, color: colors.border.default },

  sourceLink: { gap: 2 },
  sourceLinkLabel: { fontSize: 15, fontWeight: '600', color: colors.text.link },
  sourceLinkDomain: { fontSize: 12, color: colors.text.placeholder },

  wineCard: { backgroundColor: colors.background.elevated, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, padding: 12, gap: 4 },
  cocktailCard: { backgroundColor: colors.brand.plumLighter, borderColor: colors.brand.plumLight },
  wineVarietal: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  cocktailName: { color: colors.brand.plum },
  wineReason: { fontSize: 14, color: '#374151', lineHeight: 20 },
  wineNote: { fontSize: 13, color: '#6B7280', lineHeight: 19, marginTop: 4 },
  wineDismiss: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  wineError: { fontSize: 13, color: '#EF4444', marginTop: 4 },
  glossaryAdd: { fontSize: 12, color: '#3B7A57', fontWeight: '600', marginTop: 6 },
  glossarySaved: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },
});
