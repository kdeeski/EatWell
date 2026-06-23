// This Week screen — tap a meal to select it, then use ▲▼ to move it.

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  LayoutAnimation, Platform, UIManager, ActivityIndicator, Linking,
  Animated, PanResponder, Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { toTitleCase } from '../../lib/titleCase';
import { findStashMatch } from '../../lib/recipes';
import {
  reorderPlannedMeals, loadCurrentMealPlan, fetchWeekCookedMeals,
  loadMealPlanForWeek, getThisWeekMonday, pushMealToNextWeek,
} from '../../lib/data';
import DrinkPairingSection from '../../components/DrinkPairingSection';
import type { MealPlan, PlannedMeal, PlannedIngredient, Recipe, CookedMeal } from '../../types';
import { colors } from '../../constants/theme';
import { shared } from '../../constants/styles';

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

function getWeekStart(offset: number): string {
  const d = new Date(getThisWeekMonday() + 'T12:00:00');
  d.setDate(d.getDate() + offset * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatWeekRange(weekStart: string): string {
  const d   = new Date(weekStart + 'T12:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${M[d.getMonth()]} – ${end.getDate()} ${M[end.getMonth()]}`;
}

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { plannedMeals, currentMealPlan, setMealPlan, userId, recipes } = useAppStore();
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [guideTarget, setGuideTarget] = useState<PlannedMeal | null>(null);
  const [stashRecipe, setStashRecipe] = useState<Recipe | null>(null);
  const [saveForMeal, setSaveForMeal] = useState<string | null>(null);
  const [cookedMap, setCookedMap]     = useState<Record<string, CookedMeal>>({});

  // Week navigation
  const [weekOffset, setWeekOffset]   = useState(0); // 0 = current week
  const [weekCache, setWeekCache]     = useState<Record<string, { plan: MealPlan | null; meals: PlannedMeal[]; cookedMap: Record<string, CookedMeal> } | null>>({});
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError]     = useState<string | null>(null);
  const [pushing, setPushing]         = useState<string | null>(null); // meal id being pushed to next week
  const [pinnedMealIds, setPinnedMealIds] = useState<Set<string>>(new Set());
  const weekOffsetRef = useRef(weekOffset);
  weekOffsetRef.current = weekOffset;
  const swipeX = useRef(new Animated.Value(0)).current;

  // Jump to a specific week when returning from the planning wizard
  const { showWeek } = useLocalSearchParams<{ showWeek?: string }>();
  useEffect(() => {
    const offset = parseInt(showWeek ?? '', 10);
    if (!isNaN(offset)) setWeekOffset(offset);
  }, [showWeek]);

  // Clear pins when switching weeks — they're ephemeral helpers for the next replan
  useEffect(() => {
    setPinnedMealIds(new Set());
  }, [weekOffset]);

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

  // Derived values for whichever week is being viewed
  const isCurrentWeek   = weekOffset === 0;
  const viewedWeekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset]);

  // Use live store data for the current week ONLY when the stored plan's week actually matches the
  // calendar week we're viewing. If the store holds a different week (e.g. the user generated
  // next week's plan but hasn't planned this week yet), fall through to weekCache so the display
  // is correct and a fresh fetch is triggered.
  const currentWeekIsInStore = isCurrentWeek && currentMealPlan?.week_start_date === viewedWeekStart;
  const displayedMeals  = currentWeekIsInStore ? plannedMeals : (weekCache[viewedWeekStart]?.meals ?? []);
  const displayedCooked = currentWeekIsInStore ? cookedMap    : (weekCache[viewedWeekStart]?.cookedMap ?? {});
  const displayedSlots  = currentWeekIsInStore
    ? slots
    : Array.from({ length: 7 }, (_, i) => displayedMeals.find(m => m.day_of_week === i)?.id ?? null);
  // true while the fetch is in-flight and we have no data yet
  const weekDataPending = !currentWeekIsInStore && weekCache[viewedWeekStart] === undefined;

  // Sync slots when plannedMeals changes (e.g. after bootstrap or save)
  useEffect(() => {
    if (saving) return; // don't clobber in-flight reorder
    setSlots(Array.from({ length: 7 }, (_, i) => {
      const meal = plannedMeals.find((m) => m.day_of_week === i);
      return meal?.id ?? null;
    }));
  }, [plannedMeals]);

  // Reload when the tab gains focus; auto-switch to new week on Monday mornings
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    const thisMonday = getThisWeekMonday();
    if (currentMealPlan?.week_start_date === thisMonday) return; // already on this week
    setWeekOffset(0); // reset navigation back to current week
    loadCurrentMealPlan(userId)
      .then((data) => { if (data) setMealPlan(data.plan, data.meals); })
      .catch((e) => setLoadError(e?.message ?? String(e)));
  }, [userId, currentMealPlan?.week_start_date]));

  // Load week data on demand — runs for any week not already served from store or cache
  useEffect(() => {
    setWeekError(null); // clear any previous error when the viewed week changes
    setSelectedSlot(null); // deselect when navigating weeks
    if (!userId) return;
    if (currentWeekIsInStore) return; // store already has the right week
    if (weekCache[viewedWeekStart] !== undefined) return; // already loaded (could be null = no plan)
    setWeekLoading(true);
    Promise.all([
      loadMealPlanForWeek(userId, viewedWeekStart),
      fetchWeekCookedMeals(userId, viewedWeekStart),
    ])
      .then(([planData, cookedList]) => {
        const map: Record<string, CookedMeal> = {};
        for (const c of cookedList) {
          if (c.planned_meal_id) {
            map[c.planned_meal_id] = c;
          } else {
            const match = planData?.meals.find(
              m => m.meal_name.toLowerCase() === c.actual_meal_name.toLowerCase()
            );
            if (match) map[match.id] = c;
          }
        }
        setWeekCache(prev => ({
          ...prev,
          [viewedWeekStart]: { plan: planData?.plan ?? null, meals: planData?.meals ?? [], cookedMap: map },
        }));
      })
      .catch(e => {
        console.warn('[plan] loadMealPlanForWeek failed:', e);
        setWeekError(e?.message ?? 'Could not load this week. Check your connection.');
        // Remove from cache so a retry attempt will re-fetch
        setWeekCache(prev => {
          const next = { ...prev };
          delete next[viewedWeekStart];
          return next;
        });
      })
      .finally(() => setWeekLoading(false));
  }, [currentWeekIsInStore, viewedWeekStart, userId]);

  // Reset wine result when selected slot changes
  // Load cooked meals for the current week
  useEffect(() => {
    if (!userId || !currentMealPlan) return;
    fetchWeekCookedMeals(userId, currentMealPlan.week_start_date)
      .then((list) => {
        const map: Record<string, CookedMeal> = {};
        for (const c of list) {
          if (c.planned_meal_id) {
            // Precise FK match (normal case after reorder fix)
            map[c.planned_meal_id] = c;
          } else {
            // planned_meal_id was nulled by a pre-fix reorder — match by name
            const match = plannedMeals.find(
              (m) => m.meal_name.toLowerCase() === c.actual_meal_name.toLowerCase()
            );
            if (match) map[match.id] = c;
          }
        }
        setCookedMap(map);
      })
      .catch((e) => console.warn('[plan] fetchWeekCookedMeals failed:', e));
  }, [userId, currentMealPlan?.id]);

  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  // PanResponder uses refs for mutable values so it never needs to be recreated.
  // Recreating it on every weekOffset change tears down the gesture system mid-interaction.
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder:  (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 15,
    onPanResponderGrant:   () => swipeX.setValue(0),
    onPanResponderMove:    (_, { dx }) => swipeX.setValue(dx),
    onPanResponderRelease: (_, { dx, vx }) => {
      const offset  = weekOffsetRef.current;
      const goLeft  = dx < -60 || (dx < 0 && vx < -0.5);
      const goRight = dx >  60 || (dx > 0 && vx >  0.5);
      const commitSwipe = (newOffset: number) => {
        // Reset position then update state. The weekDataPending spinner renders
        // immediately on the next frame, so the user sees a loader rather than
        // stale content while the new week's data is fetched.
        swipeX.setValue(0);
        setWeekOffset(newOffset);
      };
      if (goLeft && offset < 1) {
        Animated.timing(swipeX, { toValue: -SCREEN_WIDTH, duration: 200, useNativeDriver: false })
          .start(() => commitSwipe(offset + 1));
      } else if (goRight) {
        Animated.timing(swipeX, { toValue: SCREEN_WIDTH, duration: 200, useNativeDriver: false })
          .start(() => commitSwipe(offset - 1));
      } else {
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: false }).start();
      }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []); // intentionally empty — all mutable state accessed via refs

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

  const hasPlan = displayedMeals.length > 0;
  const selectedMeal = selectedSlot !== null
    ? displayedMeals.find((m) => m.id === displayedSlots[selectedSlot]) ?? null
    : null;
  const canMoveUp   = selectedSlot !== null && selectedSlot > 0 && !!selectedMeal;
  const canMoveDown = selectedSlot !== null && selectedSlot < displayedSlots.length - 1 && !!selectedMeal;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: swipeX }] }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.weekHeader}>
          <Text style={styles.heading}>{formatWeekRange(viewedWeekStart)}</Text>
          <View style={styles.weekHeaderRight}>
            {(weekLoading || weekDataPending) && (
              <ActivityIndicator size="small" color={colors.text.placeholder} style={{ marginRight: 8 }} />
            )}
            {!isCurrentWeek && (
              <TouchableOpacity onPress={() => setWeekOffset(0)}>
                <Text style={styles.thisWeekLink}>This Week</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {(weekLoading || weekDataPending) ? (
          // Data is on its way — show a full-screen spinner so no empty/stale content flashes
          <View style={styles.weekLoadingState}>
            <ActivityIndicator size="large" color={colors.brand.primary} />
          </View>
        ) : weekError ? (
          // Network or DB error loading this week's data
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Couldn't load this week</Text>
            <Text style={styles.errorText}>{weekError}</Text>
            <TouchableOpacity
              style={styles.planButton}
              onPress={() => {
                setWeekError(null);
                // Remove the failed entry from cache so the effect re-fetches
                setWeekCache(prev => {
                  const next = { ...prev };
                  delete next[viewedWeekStart];
                  return next;
                });
              }}
            >
              <Text style={styles.planButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : !hasPlan ? (
          <View style={styles.emptyState}>
            {isCurrentWeek ? (
              <>
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
              </>
            ) : weekOffset === 1 ? (
              <>
                <Text style={styles.emptyTitle}>No plan yet</Text>
                <Text style={styles.emptyBody}>Nothing planned for this week yet.</Text>
                <TouchableOpacity
                  style={styles.planButton}
                  onPress={() => router.push({ pathname: '/planning', params: { weekOffset: '1' } })}
                >
                  <Text style={styles.planButtonText}>Plan the Week</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No plan</Text>
                <Text style={styles.emptyBody}>No meals were planned for this week.</Text>
              </>
            )}
          </View>
        ) : (
          <>
            {isCurrentWeek && (
              <Text style={styles.hint}>
                {selectedMeal ? `"${selectedMeal.meal_name}" selected` : 'Tap a meal to move it'}
              </Text>
            )}

            {displayedSlots.map((mealId, listIndex) => {
              const meal       = mealId ? displayedMeals.find((m) => m.id === mealId) ?? null : null;
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

                  {(() => {
                    const cooked = meal ? (displayedCooked[meal.id] ?? null) : null;
                    return (
                      <View style={[
                        styles.mealCard,
                        isSelected && !cooked && styles.mealCardSelected,
                        !meal && styles.mealCardEmpty,
                        cooked && styles.mealCardCooked,
                      ]}>
                        {meal ? (
                          <>
                            <View style={styles.badgeRow}>
                              {cooked
                                ? <Text style={styles.cookedBadge}>Cooked ✓</Text>
                                : <>
                                    {meal.is_fish      && <Text style={styles.fishBadge}>Buy Fresh</Text>}
                                    {meal.needs_recipe && <Text style={styles.recipeBadge}>Recipe</Text>}
                                    {pinnedMealIds.has(meal.id) && <Text style={styles.pinnedBadge}>Pinned</Text>}
                                  </>
                              }
                            </View>
                            <Text style={[styles.mealName, cooked && styles.mealNameCooked]}>
                              {toTitleCase(meal.meal_name)}
                            </Text>
                            {cooked?.rating != null && (
                              <Text style={styles.mealRating}>{cooked.rating}/5</Text>
                            )}
                            <Text style={styles.mealMeta}>
                              {meal.estimated_prep_minutes ? `~${meal.estimated_prep_minutes} min` : ''}
                              {!isSelected && !cooked ? '  ·  Tap for details' : ''}
                            </Text>
                            {isSelected && meal.description ? (
                              <Text style={styles.description}>{meal.description}</Text>
                            ) : null}
                            {isSelected && !cooked && (() => {
                              const stash = recipes.find((r) =>
                                !['sauces_dressings', 'marinades_rubs', 'glossary'].includes(r.category) &&
                                r.rating != null &&
                                r.name.toLowerCase() === meal.meal_name.toLowerCase()
                              );
                              return stash?.rating != null
                                ? <Text style={styles.mealRating}>{stash.rating}/5</Text>
                                : null;
                            })()}
                            {isSelected && !cooked && (() => {
                              const mealRecipes = recipes.filter(
                                (r) => !['sauces_dressings', 'marinades_rubs', 'glossary'].includes(r.category)
                              );
                              const match = findStashMatch(meal.meal_name, mealRecipes);
                              return match ? (
                                match.source_url ? (
                                  <TouchableOpacity
                                    style={shared.ctaRow}
                                    onPress={() => Linking.openURL(match.source_url!)}
                                  >
                                    <Text style={styles.stashNudgeText}>View recipe</Text>
                                    <Text style={shared.ctaArrow}>→</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <TouchableOpacity
                                    style={shared.ctaRow}
                                    onPress={() => setStashRecipe(match)}
                                  >
                                    <Text style={styles.stashNudgeText}>You have a recipe for this</Text>
                                    <Text style={shared.ctaArrow}>→</Text>
                                  </TouchableOpacity>
                                )
                              ) : (
                                <>
                                  <TouchableOpacity
                                    style={shared.ctaRow}
                                    onPress={() => setSaveForMeal(toTitleCase(meal.meal_name))}
                                  >
                                    <Text style={styles.saveRecipeText}>+ Save a recipe for this</Text>
                                    <Text style={shared.ctaArrow}>→</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={shared.ctaRow}
                                    onPress={() => setGuideTarget(meal)}
                                  >
                                    <Text style={styles.howToButtonText}>How to cook this</Text>
                                    <Text style={shared.ctaArrow}>→</Text>
                                  </TouchableOpacity>
                                </>
                              );
                            })()}
                            {isSelected && !cooked && (
                              <DrinkPairingSection
                                mealName={meal.meal_name}
                                description={meal.description}
                                compact
                              />
                            )}
                            {isSelected && (isCurrentWeek || weekOffset === 1) && !cooked && (
                              <TouchableOpacity
                                style={styles.secondaryAction}
                                onPress={() => {
                                  setPinnedMealIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(meal.id)) next.delete(meal.id);
                                    else next.add(meal.id);
                                    return next;
                                  });
                                }}
                              >
                                <Text style={[styles.pinBtnText, pinnedMealIds.has(meal.id) && styles.pinBtnTextActive]}>
                                  {pinnedMealIds.has(meal.id) ? 'Keeping this on replan' : 'Keep this on replan'}
                                </Text>
                              </TouchableOpacity>
                            )}
                            {isSelected && isCurrentWeek && !cooked && (
                              <TouchableOpacity
                                style={shared.ctaRow}
                                disabled={!!pushing}
                                onPress={async () => {
                                  if (!userId) return;
                                  const nextWeekStart = getWeekStart(1);
                                  setPushing(meal.id);
                                  try {
                                    const { plan: nwPlan, meals: nwMeals } =
                                      await pushMealToNextWeek(userId, meal, nextWeekStart);
                                    setWeekCache((prev) => ({
                                      ...prev,
                                      [nextWeekStart]: {
                                        plan: nwPlan,
                                        meals: nwMeals,
                                        cookedMap: prev[nextWeekStart]?.cookedMap ?? {},
                                      },
                                    }));
                                  } catch (e: any) {
                                    console.warn('[plan] pushMealToNextWeek failed:', e?.message);
                                  } finally {
                                    setPushing(null);
                                  }
                                }}
                              >
                                {pushing === meal.id
                                  ? <ActivityIndicator size="small" color={colors.text.placeholder} />
                                  : <>
                                      <Text style={styles.pushNextWeekText}>Add to next week</Text>
                                      <Text style={shared.ctaArrow}>→</Text>
                                    </>
                                }
                              </TouchableOpacity>
                            )}
                          </>
                        ) : (
                          <Text style={styles.nightOff}>Night off</Text>
                        )}
                      </View>
                    );
                  })()}
                </TouchableOpacity>
              );
            })}

            {isCurrentWeek && (
              <TouchableOpacity
                style={styles.replanButton}
                onPress={() => router.push({
                  pathname: '/planning',
                  params: {
                    weekOffset: '0',
                    quickReplan: 'true',
                    ...(pinnedMealIds.size > 0 && { pinnedIds: [...pinnedMealIds].join(',') }),
                  },
                })}
              >
                <Text style={styles.replanButtonText}>
                  {pinnedMealIds.size > 0
                    ? `Replan (${pinnedMealIds.size} pinned)`
                    : 'Replan the Week'}
                </Text>
              </TouchableOpacity>
            )}

            {weekOffset === 1 && (
              <TouchableOpacity
                style={styles.replanButton}
                onPress={() => router.push({
                  pathname: '/planning',
                  params: {
                    weekOffset: '1',
                    ...(displayedMeals.length > 0 && { quickReplan: 'true' }),
                    ...(pinnedMealIds.size > 0 && { pinnedIds: [...pinnedMealIds].join(',') }),
                  },
                })}
              >
                <Text style={styles.replanButtonText}>
                  {displayedMeals.length > 0
                    ? pinnedMealIds.size > 0 ? `Replan (${pinnedMealIds.size} pinned)` : 'Replan the Week'
                    : 'Plan the Week'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
      </Animated.View>

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
          
        />
      )}

      {/* Move toolbar — only visible on current week when a non-cooked meal is selected */}
      {isCurrentWeek && selectedMeal && !displayedCooked[selectedMeal.id] && (
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
  container: { flex: 1, backgroundColor: colors.background.app },
  content:   { padding: 20 },
  heading:   { fontSize: 28, fontWeight: '700', color: colors.text.primary },
  hint:      { fontSize: 12, color: colors.text.placeholder, marginBottom: 20 },
  weekHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  weekHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  thisWeekLink:    { fontSize: 13, color: colors.brand.primary, fontWeight: '600' },

  weekLoadingState: { alignItems: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text.primary, marginBottom: 10 },
  emptyBody:  { fontSize: 15, color: colors.text.muted, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  errorText:  { fontSize: 12, color: colors.state.dangerBright, textAlign: 'center', marginBottom: 16, paddingHorizontal: 12 },
  planButton:     { backgroundColor: colors.brand.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  planButtonText: { color: colors.text.inverse, fontWeight: '700', fontSize: 16 },

  dayRow:   { marginBottom: 12 },
  dayLabel: { ...shared.sectionLabel, marginBottom: 4 },
  dayLabelSelected: { color: colors.brand.primary },

  mealCard: {
    flex: 1, backgroundColor: colors.background.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border.default,
  },
  mealCardSelected: { borderColor: colors.brand.primary, borderWidth: 2 },
  mealCardEmpty:    { backgroundColor: colors.background.elevated, borderColor: colors.border.hairline },
  mealCardCooked:   { backgroundColor: colors.background.elevated },
  mealNameCooked:   { color: colors.text.placeholder },
  cookedBadge: {
    fontSize: 11, fontWeight: '600', color: colors.brand.primaryDark, backgroundColor: colors.brand.primaryLighter,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },

  badgeRow:    { flexDirection: 'row', gap: 6, marginBottom: 4 },
  fishBadge:   {
    fontSize: 11, fontWeight: '600', color: colors.brand.primary, backgroundColor: colors.brand.primaryLight,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },
  recipeBadge: {
    fontSize: 11, fontWeight: '600', color: colors.state.warningDark, backgroundColor: colors.state.warningSoft,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },

  mealName:    { fontSize: 16, fontWeight: '600', color: colors.text.primary, marginBottom: 2 },
  mealMeta:    { fontSize: 12, color: colors.text.placeholder },
  description: { fontSize: 14, color: colors.text.secondary, lineHeight: 21, marginTop: 6, marginBottom: 4 },
  mealRating: { fontSize: 12, fontWeight: '600', color: colors.rating.star, marginTop: 4 },
  nightOff:    { fontSize: 14, color: colors.border.default, fontStyle: 'italic' },

  toolbar: {
    backgroundColor: colors.background.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border.hairline,
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
    backgroundColor: colors.brand.primaryLighter,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.brand.primaryLight,
  },
  moveArrowBtnDisabled: {
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.default,
  },
  moveArrowIcon: { fontSize: 14, color: colors.brand.primary, fontWeight: '700' },
  moveArrowLabel: { fontSize: 14, fontWeight: '600', color: colors.brand.primary },
  moveArrowIconDisabled: { color: colors.border.default },
  toolbarDoneBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.background.elevated,
  },
  toolbarDoneText: { fontSize: 14, fontWeight: '600', color: colors.text.secondary },

  replanButton:     { marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border.default, alignItems: 'center' },
  replanButtonText: { fontSize: 15, color: colors.text.muted, fontWeight: '500' },

  pushNextWeekText: { fontSize: 13, color: colors.text.placeholder, fontWeight: '500' },
  secondaryAction: { paddingVertical: 4 },
  pinBtnText: { fontSize: 13, color: colors.text.placeholder, fontWeight: '500' },
  pinBtnTextActive: { color: colors.brand.primary, fontWeight: '600' },
  pinnedBadge: {
    fontSize: 11, fontWeight: '600', color: colors.brand.primaryDark, backgroundColor: colors.brand.primaryLight,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },

  howToButtonText: { fontSize: 13, color: colors.brand.primary, fontWeight: '600' },

  stashNudgeText: { fontSize: 13, color: colors.state.info, fontWeight: '600' },
  saveRecipeText: { fontSize: 13, color: colors.text.placeholder, fontWeight: '500' },

});
