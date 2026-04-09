// This Week screen — tap a meal to select it, then use ▲▼ to move it.

import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  LayoutAnimation, Platform, UIManager, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { toTitleCase } from '../../lib/titleCase';
import { findStashMatch } from '../../lib/recipes';
import { reorderPlannedMeals, loadCurrentMealPlan } from '../../lib/data';
import { getWineMatch } from '../../lib/claude';
import type { WineMatchResult } from '../../lib/claude';
import type { PlannedMeal, PlannedIngredient, Recipe } from '../../types';

function formatIngredients(ingredients: PlannedIngredient[]): string {
  return ingredients
    .map((i) => `${i.quantity} ${i.unit} ${toTitleCase(i.name)}`.trim())
    .join('\n');
}
import CookingGuideModal from '../../components/recipes/CookingGuideModal';
import RecipeDetailModal from '../../components/recipes/RecipeDetailModal';
import SaveRecipeModal from '../../components/recipes/SaveRecipeModal';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { plannedMeals, currentMealPlan, setMealPlan, userId, recipes, userPreferences } = useAppStore();
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [guideTarget, setGuideTarget] = useState<PlannedMeal | null>(null);
  const [stashRecipe, setStashRecipe] = useState<Recipe | null>(null);
  const [saveForMeal, setSaveForMeal] = useState<string | null>(null);
  const [wineResult, setWineResult]   = useState<WineMatchResult | null>(null);
  const [wineLoading, setWineLoading] = useState(false);
  const [wineError, setWineError]     = useState<string | null>(null);

  const [slots, setSlots] = useState<(string | null)[]>(() =>
    Array.from({ length: 7 }, (_, i) => {
      const meal = plannedMeals.find((m) => m.day_of_week === i);
      return meal?.id ?? null;
    })
  );

  const mealsRef = useRef(plannedMeals);
  mealsRef.current = plannedMeals;
  const planRef = useRef(currentMealPlan);
  planRef.current = currentMealPlan;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Sync slots when plannedMeals changes (e.g. after bootstrap or save)
  useEffect(() => {
    if (saving) return; // don't clobber in-flight reorder
    setSlots(Array.from({ length: 7 }, (_, i) => {
      const meal = plannedMeals.find((m) => m.day_of_week === i);
      return meal?.id ?? null;
    }));
  }, [plannedMeals]);

  useEffect(() => {
    if (currentMealPlan || !userId) return;
    loadCurrentMealPlan(userId)
      .then((data) => { if (data) setMealPlan(data.plan, data.meals); })
      .catch((e) => setLoadError(e?.message ?? String(e)));
  }, [userId]);

  // Reset wine result when selected slot changes
  useEffect(() => {
    setWineResult(null);
    setWineError(null);
  }, [selectedSlot]);

  async function handleWineMatch(meal: PlannedMeal) {
    setWineLoading(true);
    setWineError(null);
    try {
      const result = await getWineMatch({
        meal_name: meal.meal_name,
        description: meal.description ?? undefined,
        detail_level: userPreferences?.wine_detail_level ?? 'simple',
      });
      setWineResult(result);
    } catch (e: any) {
      setWineError(e.message ?? 'Could not fetch wine pairing.');
    } finally {
      setWineLoading(false);
    }
  }

  const moveSelected = (direction: -1 | 1) => {
    if (selectedSlot === null) return;
    const toIndex = selectedSlot + direction;
    if (toIndex < 0 || toIndex >= slotsRef.current.length) return;

    const next = [...slotsRef.current];
    const tmp = next[selectedSlot];
    next[selectedSlot] = next[toIndex];
    next[toIndex] = tmp;

    LayoutAnimation.configureNext({ duration: 150, update: { type: LayoutAnimation.Types.easeInEaseOut } });
    setSlots(next);
    setSelectedSlot(toIndex);
    setDirty(true);
  };

  const handleDone = async () => {
    setSelectedSlot(null);
    if (!dirty || !planRef.current) { setDirty(false); return; }

    // Build reordered list: slot index becomes new day_of_week
    const visibleOriginalIds = slotsRef.current
      .filter((id): id is string => id !== null);

    const reordered = slotsRef.current
      .map((id, newPosition) => {
        if (!id) return null;
        const meal = mealsRef.current.find((m) => m.id === id);
        return meal ? { ...meal, day_of_week: newPosition as PlannedMeal['day_of_week'] } : null;
      })
      .filter(Boolean) as PlannedMeal[];

    if (reordered.length === 0) { setDirty(false); return; }

    const snapshot = mealsRef.current.slice();
    setSaving(true);
    try {
      const saved = await reorderPlannedMeals(planRef.current.id, visibleOriginalIds, reordered);
      // Reset slots from saved meals so IDs are fresh
      setSlots(Array.from({ length: 7 }, (_, i) => {
        const meal = saved.find((m) => m.day_of_week === i);
        return meal?.id ?? null;
      }));
      setMealPlan(planRef.current, saved);
    } catch (e) {
      console.error('Failed to save meal order', e);
      setMealPlan(planRef.current, snapshot);
      // Revert slots to match rolled-back store
      setSlots(Array.from({ length: 7 }, (_, i) => {
        const meal = snapshot.find((m) => m.day_of_week === i);
        return meal?.id ?? null;
      }));
    } finally {
      setSaving(false);
      setDirty(false);
    }
  };

  const hasPlan = plannedMeals.length > 0;
  const selectedMeal = selectedSlot !== null
    ? plannedMeals.find((m) => m.id === slots[selectedSlot]) ?? null
    : null;
  const canMoveUp   = selectedSlot !== null && selectedSlot > 0 && !!selectedMeal;
  const canMoveDown = selectedSlot !== null && selectedSlot < slots.length - 1 && !!selectedMeal;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.heading}>This Week</Text>

        {!hasPlan ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No plan yet</Text>
            <Text style={styles.emptyBody}>
              Time to plan the week. The app will look at what's in your fridge,
              what's in the garden, and build meals around it.
            </Text>
            {loadError && (
              <Text style={styles.errorText}>{loadError}</Text>
            )}
            <TouchableOpacity style={styles.planButton} onPress={() => router.push('/planning')}>
              <Text style={styles.planButtonText}>Plan This Week</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              {selectedMeal ? `"${selectedMeal.meal_name}" selected` : 'Tap a meal to move it'}
            </Text>

            {slots.map((mealId, listIndex) => {
              const meal       = mealId ? plannedMeals.find((m) => m.id === mealId) ?? null : null;
              const isSelected = selectedSlot === listIndex;

              return (
                <TouchableOpacity
                  key={listIndex}
                  style={styles.dayRow}
                  onPress={() => {
                    if (!meal) return;
                    setSelectedSlot(isSelected ? null : listIndex);
                  }}
                  activeOpacity={meal ? 0.7 : 1}
                >
                  <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                    {DAY_SHORT[listIndex]}
                  </Text>

                  <View style={[
                    styles.mealCard,
                    isSelected && styles.mealCardSelected,
                    !meal && styles.mealCardEmpty,
                  ]}>
                    {meal ? (
                      <>
                        <View style={styles.badgeRow}>
                          {meal.is_fish      && <Text style={styles.fishBadge}>Buy Fresh</Text>}
                          {meal.needs_recipe && <Text style={styles.recipeBadge}>Recipe</Text>}
                        </View>
                        <Text style={styles.mealName}>{toTitleCase(meal.meal_name)}</Text>
                        <Text style={styles.mealMeta}>
                          {meal.estimated_prep_minutes ? `~${meal.estimated_prep_minutes} min` : ''}
                          {!isSelected ? '  ·  Tap for details' : ''}
                        </Text>
                        {isSelected && meal.description ? (
                          <Text style={styles.description}>{meal.description}</Text>
                        ) : null}
                        {isSelected && (() => {
                          const stash = recipes.find((r) =>
                            !['sauces_dressings', 'marinades_rubs', 'glossary'].includes(r.category) &&
                            r.rating != null &&
                            r.name.toLowerCase() === meal.meal_name.toLowerCase()
                          );
                          return stash?.rating != null
                            ? <Text style={styles.mealRating}>{stash.rating}/5</Text>
                            : null;
                        })()}
                        {isSelected && (() => {
                          const mealRecipes = recipes.filter(
                            (r) => !['sauces_dressings', 'marinades_rubs', 'glossary'].includes(r.category)
                          );
                          const match = findStashMatch(meal.meal_name, mealRecipes);
                          return match ? (
                            <TouchableOpacity
                              style={styles.stashNudge}
                              onPress={() => setStashRecipe(match)}
                            >
                              <Text style={styles.stashNudgeText}>📖 You have a recipe for this →</Text>
                            </TouchableOpacity>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.stashNudge}
                                onPress={() => setSaveForMeal(toTitleCase(meal.meal_name))}
                              >
                                <Text style={styles.saveRecipeText}>+ Save a recipe for this</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.howToButton}
                                onPress={() => setGuideTarget(meal)}
                              >
                                <Text style={styles.howToButtonText}>How to cook this →</Text>
                              </TouchableOpacity>
                            </>
                          );
                        })()}
                        {isSelected && (
                          <View style={styles.wineSection}>
                            {wineResult ? (
                              <>
                                {wineResult.pairings.map((p, i) => (
                                  <View key={i} style={styles.wineCard}>
                                    <Text style={styles.wineVarietal}>{p.varietal}</Text>
                                    <Text style={styles.wineReason}>{p.reason}</Text>
                                    {p.pairing_note ? (
                                      <Text style={styles.wineNote}>{p.pairing_note}</Text>
                                    ) : null}
                                  </View>
                                ))}
                                <TouchableOpacity onPress={() => setWineResult(null)}>
                                  <Text style={styles.wineDismiss}>Clear</Text>
                                </TouchableOpacity>
                              </>
                            ) : (
                              <TouchableOpacity onPress={() => handleWineMatch(meal)} disabled={wineLoading}>
                                {wineLoading
                                  ? <ActivityIndicator size="small" color="#3B7A57" />
                                  : <Text style={styles.howToButtonText}>Drink pairing →</Text>
                                }
                              </TouchableOpacity>
                            )}
                            {wineError ? (
                              <TouchableOpacity onPress={() => handleWineMatch(meal)}>
                                <Text style={styles.wineError}>{wineError} Tap to retry.</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={styles.nightOff}>Night off</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.replanButton} onPress={() => router.push('/planning')}>
              <Text style={styles.replanButtonText}>Replan the Week</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Cooking guide modal */}
      {guideTarget && (
        <CookingGuideModal
          mealName={toTitleCase(guideTarget.meal_name)}
          description={guideTarget.description ?? ''}
          visible={!!guideTarget}
          onClose={() => setGuideTarget(null)}
          prefillGuide={recipes.find((r) => r.name.toLowerCase() === guideTarget.meal_name.toLowerCase() && r.guide_json)?.guide_json ?? undefined}
          ingredients={formatIngredients(guideTarget.ingredients)}
        />
      )}

      {/* Save recipe for a planned meal */}
      {saveForMeal && (
        <SaveRecipeModal
          visible
          prefill={{ name: saveForMeal, category: 'mains' }}
          onSave={() => setSaveForMeal(null)}
          onClose={() => setSaveForMeal(null)}
        />
      )}

      {/* Stash recipe detail — opened from nudge */}
      {stashRecipe && (
        <RecipeDetailModal
          recipe={stashRecipe}
          onClose={() => setStashRecipe(null)}
          onEdit={() => {}}
          onDelete={() => {}}
          onCookMode={() => {}}
        />
      )}

      {/* Move toolbar — only visible when a meal is selected */}
      {selectedMeal && (
        <View style={styles.toolbar}>
          <View style={styles.toolbarMoveRow}>
            <TouchableOpacity
              style={[styles.moveArrowBtn, !canMoveUp && styles.moveArrowBtnDisabled]}
              onPress={() => moveSelected(-1)}
              disabled={!canMoveUp}
            >
              <Text style={[styles.moveArrowIcon, !canMoveUp && styles.moveArrowIconDisabled]}>▲</Text>
              <Text style={[styles.moveArrowLabel, !canMoveUp && styles.moveArrowIconDisabled]}>Earlier</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.moveArrowBtn, !canMoveDown && styles.moveArrowBtnDisabled]}
              onPress={() => moveSelected(1)}
              disabled={!canMoveDown}
            >
              <Text style={[styles.moveArrowIcon, !canMoveDown && styles.moveArrowIconDisabled]}>▼</Text>
              <Text style={[styles.moveArrowLabel, !canMoveDown && styles.moveArrowIconDisabled]}>Later</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.toolbarDoneBtn} onPress={handleDone} disabled={saving}>
            <Text style={styles.toolbarDoneText}>{saving ? 'Saving…' : 'Done'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content:   { padding: 20, paddingBottom: 20 },
  heading:   { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  hint:      { fontSize: 12, color: '#9CA3AF', marginBottom: 20 },

  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 },
  emptyBody:  { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  errorText:  { fontSize: 12, color: '#EF4444', textAlign: 'center', marginBottom: 16, paddingHorizontal: 12 },
  planButton:     { backgroundColor: '#3B7A57', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  planButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  dayRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  dayLabel: { width: 36, fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  dayLabelSelected: { color: '#3B7A57' },

  mealCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  mealCardSelected: { borderColor: '#3B7A57', borderWidth: 2 },
  mealCardEmpty:    { backgroundColor: '#F9FAFB', borderColor: '#F3F4F6' },

  badgeRow:    { flexDirection: 'row', gap: 6, marginBottom: 4 },
  fishBadge:   {
    fontSize: 11, fontWeight: '600', color: '#3B7A57', backgroundColor: '#D1FAE5',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },
  recipeBadge: {
    fontSize: 11, fontWeight: '600', color: '#92400E', backgroundColor: '#FEF3C7',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },

  mealName:    { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginBottom: 2 },
  mealMeta:    { fontSize: 12, color: '#9CA3AF' },
  description: { fontSize: 14, color: '#374151', lineHeight: 21, marginTop: 8 },
  mealRating: { fontSize: 12, fontWeight: '600', color: '#F59E0B', marginTop: 4 },
  nightOff:    { fontSize: 14, color: '#D1D5DB', fontStyle: 'italic' },

  toolbar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toolbarMoveRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  moveArrowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  moveArrowBtnDisabled: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  moveArrowIcon: { fontSize: 14, color: '#3B7A57', fontWeight: '700' },
  moveArrowLabel: { fontSize: 14, fontWeight: '600', color: '#3B7A57' },
  moveArrowIconDisabled: { color: '#D1D5DB' },
  toolbarDoneBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  toolbarDoneText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  replanButton:     { marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  replanButtonText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },

  howToButton: { marginTop: 8 },
  howToButtonText: { fontSize: 13, color: '#3B7A57', fontWeight: '600' },

  stashNudge: { marginTop: 8 },
  stashNudgeText: { fontSize: 13, color: '#0369A1', fontWeight: '600' },
  saveRecipeText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  wineSection: { marginTop: 8, gap: 6 },
  wineCard: { backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', padding: 10, gap: 3 },
  wineVarietal: { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
  wineReason: { fontSize: 13, color: '#374151', lineHeight: 18 },
  wineNote: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 3 },
  wineDismiss: { fontSize: 12, color: '#9CA3AF' },
  wineError: { fontSize: 12, color: '#EF4444' },
});
