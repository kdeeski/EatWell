// Morning check-in modal — daily debrief and tonight planning.
// Saves to DB. Shows summary if already completed today.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { saveCheckin, logCookedMeal, localDateString, updateRecipe, loadMealPlanForWeek, getThisWeekMonday, fetchCookedMealForPlannedMeal, loadCookedMealForDate } from '../../lib/data';
import { findStashMatch } from '../../lib/recipes';
import { colors } from '../../constants/theme';

type Step = 'debrief' | 'something_else_detail' | 'rating' | 'tonight' | 'done';

const RATING_LABELS = ['', 'Meh', 'Fine', 'Good', 'Great', 'Loved it'];

export default function CheckinFlow() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plannedMeals, setTodayCheckin, todayCheckin, userId, recipes, updateRecipeInStore, tonightSomethingElseName, setTonightSomethingElseName } = useAppStore();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIndex = (yesterday.getDay() + 6) % 7;
  const todayIndex = (new Date().getDay() + 6) % 7;

  // If yesterday was in the previous week (e.g. today is Monday, yesterday was Sunday)
  // we need last week's plan — the current store holds this week's meals only.
  const crossedWeekBoundary = yesterdayIndex > todayIndex;
  const [prevWeekMeals, setPrevWeekMeals] = useState<typeof plannedMeals>([]);
  useEffect(() => {
    if (!crossedWeekBoundary || !userId) return;
    const thisMonday = new Date(getThisWeekMonday() + 'T12:00:00');
    thisMonday.setDate(thisMonday.getDate() - 7);
    const lastWeekStart = `${thisMonday.getFullYear()}-${String(thisMonday.getMonth() + 1).padStart(2, '0')}-${String(thisMonday.getDate()).padStart(2, '0')}`;
    loadMealPlanForWeek(userId, lastWeekStart)
      .then((data) => { if (data) setPrevWeekMeals(data.meals); })
      .catch(() => {});
  }, [crossedWeekBoundary, userId]);

  const lastNightsMeal = (crossedWeekBoundary ? prevWeekMeals : plannedMeals)
    .find((m) => m.day_of_week === yesterdayIndex);
  const tonightOptions = plannedMeals.filter((m) => m.day_of_week === todayIndex);

  const [editing, setEditing] = useState(false);

  // Pre-populate from existing check-in when entering edit mode
  const existingLastNight = todayCheckin?.last_night_response;
  const initialChoice = existingLastNight?.type === 'planned' ? (lastNightsMeal?.id ?? null)
    : existingLastNight?.type === 'ate_out' ? 'ate_out'
    : existingLastNight?.type === 'something_else' ? 'something_else'
    : existingLastNight?.type === 'didnt_cook' ? 'didnt_cook'
    : null;

  const [step, setStep] = useState<Step>('debrief');
  const [lastNightChoice, setLastNightChoice] = useState<string | null>(null);
  const [somethingElseName, setSomethingElseName] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [wouldCookAgain, setWouldCookAgain] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [drinkName, setDrinkName] = useState('');
  const [drinkNotes, setDrinkNotes] = useState('');
  const [tonightChoice, setTonightChoice] = useState<string | null>(null);
  const [tonightStashSearch, setTonightStashSearch] = useState('');
  const [tonightStashName, setTonightStashName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  type LastNightCooked = { actual_meal_name: string; rating: number | null; would_cook_again: boolean | null; notes: string | null; planned_meal_id: string | null };
  const [lastNightCooked, setLastNightCooked] = useState<LastNightCooked | null>(null);
  const [lastNightCookedLoading, setLastNightCookedLoading] = useState(true);

  // Load yesterday's cooked meal from DB on mount
  useEffect(() => {
    if (!userId) { setLastNightCookedLoading(false); return; }
    if (todayCheckin?.completed_at) { setLastNightCookedLoading(false); return; }
    loadCookedMealForDate(userId, localDateString(yesterday))
      .then((cooked) => {
        if (cooked) {
          setLastNightCooked(cooked);
          if (cooked.planned_meal_id) {
            setLastNightChoice(cooked.planned_meal_id);
          } else {
            setLastNightChoice('something_else');
            setSomethingElseName(cooked.actual_meal_name);
          }
          if (cooked.rating != null) setRating(cooked.rating);
          if (cooked.would_cook_again != null) setWouldCookAgain(cooked.would_cook_again);
          if (cooked.notes) setNotes(cooked.notes);
        }
      })
      .catch(() => {})
      .finally(() => setLastNightCookedLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Pre-fill from "Something else tonight" choice made last evening
  useEffect(() => {
    if (todayCheckin?.completed_at) return;
    if (!tonightSomethingElseName) return;
    setLastNightChoice('something_else');
    setSomethingElseName(tonightSomethingElseName);
    setStep('rating');
    setTonightSomethingElseName(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-populate rating/notes from a review already logged via Tonight card
  useEffect(() => {
    if (!userId || !lastNightsMeal) return;
    fetchCookedMealForPlannedMeal(userId, lastNightsMeal.id)
      .then((cooked) => {
        if (!cooked) return;
        if (cooked.rating != null) setRating(cooked.rating);
        if (cooked.would_cook_again != null) setWouldCookAgain(cooked.would_cook_again);
        if (cooked.notes) setNotes(cooked.notes);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, lastNightsMeal?.id]);

  const startEditing = () => {
    setLastNightChoice(initialChoice);
    setSomethingElseName(
      existingLastNight?.type === 'something_else' ? (existingLastNight.meal_name ?? '') : ''
    );
    setRating((existingLastNight?.rating as number | null | undefined) ?? null);
    setWouldCookAgain(existingLastNight?.would_cook_again ?? null);
    setNotes(existingLastNight?.notes ?? '');
    setTonightChoice(todayCheckin?.tonight_planned_meal_id ?? null);
    setStep('debrief');
    setEditing(true);
  };

  // If already completed today, show summary (unless editing)
  if (todayCheckin?.completed_at && !editing && todayCheckin.checkin_date === localDateString()) {
    const tonightMeal = plannedMeals.find((m) => m.id === todayCheckin.tonight_planned_meal_id);
    const lastNight = todayCheckin.last_night_response;

    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancel}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Morning check-in</Text>
          <View style={{ width: 48 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.stepTitle}>Today's check-in ✓</Text>

          {/* Last night — tap to re-open debrief */}
          {lastNight && (
            <TouchableOpacity style={styles.summaryCard} onPress={startEditing} activeOpacity={0.7}>
              <Text style={styles.summaryLabel}>Last night</Text>
              {lastNight.type === 'planned' && lastNight.meal_name ? (
                <>
                  <Text style={styles.summaryMeal}>{lastNight.meal_name}</Text>
                  {lastNight.rating != null && (
                    <Text style={styles.summaryDetail}>
                      {lastNight.rating}/5 · {RATING_LABELS[lastNight.rating]}
                      {lastNight.would_cook_again === true ? '  ·  Would cook again' : ''}
                      {lastNight.would_cook_again === false ? '  ·  Wouldn\'t repeat' : ''}
                    </Text>
                  )}
                  {lastNight.notes ? (
                    <Text style={styles.summaryNotes}>{lastNight.notes}</Text>
                  ) : null}
                </>
              ) : lastNight.type === 'ate_out' ? (
                <Text style={styles.summaryMeal}>Ate out</Text>
              ) : lastNight.type === 'something_else' ? (
                <Text style={styles.summaryMeal}>{lastNight.meal_name ?? 'Something else'}</Text>
              ) : (
                <Text style={styles.summaryMeal}>Didn't cook</Text>
              )}
              <Text style={styles.summaryTapHint}>Tap to edit</Text>
            </TouchableOpacity>
          )}

          {/* Tonight — tap to change */}
          {tonightMeal && (
            <TouchableOpacity
              style={[styles.summaryCard, styles.summaryCardGreen]}
              onPress={() => { startEditing(); setStep('tonight'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.summaryLabel, { color: colors.brand.primary }]}>Tonight</Text>
              <Text style={styles.summaryMeal}>{tonightMeal.meal_name}</Text>
              {tonightMeal.is_fish && (
                <Text style={styles.fishNote}>Don't forget to pick up the fish today.</Text>
              )}
              <Text style={styles.summaryTapHint}>Tap to change</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.primaryButtonText}>Back to today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editButton} onPress={startEditing}>
            <Text style={styles.editButtonText}>Edit check-in</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const handleDebrief = (choice: string) => {
    setLastNightChoice(choice);
    if (choice === lastNightsMeal?.id) {
      setStep('rating');
    } else if (choice === 'something_else') {
      setStep('something_else_detail');
    } else {
      setStep('tonight');
    }
  };

  const handleRatingDone = () => {
    setStep('tonight');
  };

  const handleTonightStashPick = async (recipeName: string) => {
    const matchedMeal = tonightOptions.find(
      (m) => m.meal_name.toLowerCase() === recipeName.toLowerCase()
    );
    if (matchedMeal) {
      await handleTonightChoice(matchedMeal.id);
      return;
    }
    setTonightStashName(recipeName);
    setTonightSomethingElseName(recipeName);
    await handleTonightChoice('not_sure');
  };

  const handleTonightChoice = async (mealId: string) => {
    setTonightChoice(mealId);
    setSaving(true);
    try {
      const today = localDateString();

      // Log cooked meal — skip if already logged (lastNightCooked was loaded from DB)
      if (lastNightChoice === lastNightsMeal?.id && userId && !lastNightCooked) {
        await logCookedMeal({
          user_id: userId,
          cooked_date: localDateString(yesterday),
          planned_meal_id: lastNightsMeal.id,
          actual_meal_name: lastNightsMeal.meal_name,
          rating: rating as 1 | 2 | 3 | 4 | 5 | null,
          would_cook_again: wouldCookAgain,
          notes: notes.trim() || null,
          drink_name: drinkName.trim() || null,
          drink_notes: drinkNotes.trim() || null,
          voice_note_url: null,
          ate_out: false,
        });

        // Propagate rating to stash recipe if there's a match
        if (rating != null) {
          const match = findStashMatch(lastNightsMeal.meal_name, recipes);
          if (match) {
            try {
              const updated = await updateRecipe(match.id, { ...match, rating: rating as 1|2|3|4|5 });
              updateRecipeInStore(match.id, updated);
            } catch { /* non-critical */ }
          }
        }
      } else if (lastNightChoice === 'something_else' && somethingElseName.trim() && userId && !lastNightCooked) {
        await logCookedMeal({
          user_id: userId,
          cooked_date: localDateString(yesterday),
          planned_meal_id: null,
          actual_meal_name: somethingElseName.trim(),
          rating: rating as 1 | 2 | 3 | 4 | 5 | null,
          would_cook_again: wouldCookAgain,
          notes: notes.trim() || null,
          drink_name: drinkName.trim() || null,
          drink_notes: drinkNotes.trim() || null,
          voice_note_url: null,
          ate_out: false,
        });

        if (rating != null) {
          const match = findStashMatch(somethingElseName.trim(), recipes);
          if (match) {
            try {
              const updated = await updateRecipe(match.id, { ...match, rating: rating as 1|2|3|4|5 });
              updateRecipeInStore(match.id, updated);
            } catch { /* non-critical */ }
          }
        }
      } else if (lastNightChoice === 'ate_out' && userId && !lastNightCooked) {
        await logCookedMeal({
          user_id: userId,
          cooked_date: localDateString(yesterday),
          planned_meal_id: null,
          actual_meal_name: 'Ate out',
          rating: null,
          would_cook_again: null,
          notes: null,
          drink_name: null,
          drink_notes: null,
          voice_note_url: null,
          ate_out: true,
        });
      }

      // Save check-in
      if (userId) {
        const checkin = await saveCheckin({
          user_id: userId,
          checkin_date: today,
          last_night_response: lastNightChoice ? {
            type: lastNightChoice === lastNightsMeal?.id ? 'planned'
              : lastNightChoice === 'something_else' ? 'something_else'
              : lastNightChoice === 'ate_out' ? 'ate_out'
              : 'didnt_cook',
            meal_name: lastNightChoice === lastNightsMeal?.id ? lastNightsMeal?.meal_name
              : lastNightChoice === 'something_else' ? (somethingElseName.trim() || undefined)
              : undefined,
            rating: (lastNightChoice === lastNightsMeal?.id || lastNightChoice === 'something_else') ? rating : null,
            would_cook_again: (lastNightChoice === lastNightsMeal?.id || lastNightChoice === 'something_else') ? wouldCookAgain : null,
            notes: (lastNightChoice === lastNightsMeal?.id || lastNightChoice === 'something_else') ? (notes.trim() || null) : null,
          } : null,
          tonight_planned_meal_id: mealId !== 'not_sure' ? mealId : null,
          holly_joining: false,
          completed_at: new Date().toISOString(),
        });
        setTodayCheckin(checkin);
      }
    } catch (e) {
      console.error('Failed to save check-in', e);
    }
    setSaving(false);
    setEditing(false);
    setStep('done');
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => { setEditing(false); router.back(); }}>
          <Text style={styles.cancel}>{editing ? 'Cancel' : 'Skip'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Morning check-in</Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Debrief */}
        {step === 'debrief' && (
          <View>
            {lastNightCookedLoading ? (
              <ActivityIndicator color={colors.brand.primary} style={{ marginTop: 40 }} />
            ) : lastNightCooked ? (
              <>
                <Text style={styles.sectionMicro}>Last night</Text>
                <View style={styles.knownMealCard}>
                  <Text style={styles.knownMealName}>{lastNightCooked.actual_meal_name}</Text>
                  {lastNightCooked.rating != null ? (
                    <Text style={styles.knownMealRating}>
                      {lastNightCooked.rating}/5 · {RATING_LABELS[lastNightCooked.rating]}
                      {lastNightCooked.would_cook_again === true ? '  ·  Would cook again' : ''}
                      {lastNightCooked.would_cook_again === false ? '  ·  Wouldn\'t repeat' : ''}
                    </Text>
                  ) : (
                    <>
                      <Text style={[styles.subLabel, { marginTop: 12 }]}>How was it?</Text>
                      <View style={styles.ratingRow}>
                        {[1, 2, 3, 4, 5].map((r) => (
                          <TouchableOpacity
                            key={r}
                            style={[styles.ratingChip, rating === r && styles.ratingChipSelected]}
                            onPress={() => setRating(r)}
                          >
                            <Text style={[styles.ratingNum, rating === r && styles.ratingNumSelected]}>{r}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {rating != null && (
                        <Text style={styles.ratingSelectedLabel}>{RATING_LABELS[rating]}</Text>
                      )}
                    </>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.changeLink}
                  onPress={() => { setLastNightCooked(null); setLastNightChoice(null); setRating(null); setWouldCookAgain(null); setNotes(''); setSomethingElseName(''); }}
                >
                  <Text style={styles.changeLinkText}>Not right? Change →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 24 }]}
                  onPress={() => setStep('tonight')}
                >
                  <Text style={styles.primaryButtonText}>What about tonight? →</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.stepTitle}>What did you end up cooking last night?</Text>

                {lastNightsMeal && (
                  <TouchableOpacity
                    style={[styles.mealOption, lastNightChoice === lastNightsMeal.id && styles.mealOptionSelected]}
                    onPress={() => handleDebrief(lastNightsMeal.id)}
                  >
                    <Text style={styles.mealOptionName}>{lastNightsMeal.meal_name}</Text>
                    <Text style={styles.mealOptionMeta}>The plan</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.mealOption} onPress={() => handleDebrief('something_else')}>
                  <Text style={styles.mealOptionName}>Something else</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mealOption} onPress={() => handleDebrief('ate_out')}>
                  <Text style={styles.mealOptionName}>Ate out / ordered in</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mealOption} onPress={() => handleDebrief('didnt_cook')}>
                  <Text style={styles.mealOptionName}>Didn't cook</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Something else — what did you cook? */}
        {step === 'something_else_detail' && (
          <View>
            <Text style={styles.stepTitle}>What did you cook?</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Search your recipes or type a name…"
              placeholderTextColor={colors.text.placeholder}
              value={somethingElseName}
              onChangeText={setSomethingElseName}
              autoFocus
              autoCapitalize="sentences"
            />
            {(() => {
              const q = somethingElseName.trim().toLowerCase();
              const hits = recipes
                .filter((r) => r.category !== 'cocktails' && r.category !== 'glossary')
                .filter((r) => q && r.name.toLowerCase().includes(q))
                .slice(0, 5);
              if (!hits.length) return null;
              return (
                <View style={styles.stashResults}>
                  {hits.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={styles.stashResult}
                      onPress={() => { setSomethingElseName(r.name); setStep('rating'); }}
                    >
                      <Text style={styles.stashResultName}>{r.name}</Text>
                      <Text style={styles.stashResultCat}>{r.category.replace(/_/g, ' ')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('rating')}>
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipLink} onPress={() => { setSomethingElseName(''); setStep('tonight'); }}>
              <Text style={styles.skipLinkText}>Skip — I'd rather not say</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Rating */}
        {step === 'rating' && (
          <View>
            <Text style={styles.stepTitle}>
              How was {lastNightChoice === 'something_else' ? (somethingElseName || 'it') : lastNightsMeal?.meal_name}?
            </Text>

            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.ratingChip, rating === r && styles.ratingChipSelected]}
                  onPress={() => setRating(r)}
                >
                  <Text style={[styles.ratingNum, rating === r && styles.ratingNumSelected]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {rating != null && (
              <Text style={styles.ratingSelectedLabel}>{RATING_LABELS[rating]}</Text>
            )}

            {/* Would cook again */}
            <Text style={styles.subLabel}>Would you cook it again?</Text>
            <View style={styles.yesNoRow}>
              <TouchableOpacity
                style={[styles.yesNoChip, wouldCookAgain === true && styles.yesChipSelected]}
                onPress={() => setWouldCookAgain(true)}
              >
                <Text style={[styles.yesNoText, wouldCookAgain === true && styles.yesNoTextSelected]}>
                  Yes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.yesNoChip, wouldCookAgain === false && styles.noChipSelected]}
                onPress={() => setWouldCookAgain(false)}
              >
                <Text style={[styles.yesNoText, wouldCookAgain === false && styles.yesNoTextSelected]}>
                  No
                </Text>
              </TouchableOpacity>
            </View>

            {/* Notes */}
            <Text style={styles.subLabel}>Any notes? (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="What worked, what didn't, any tweaks..."
              placeholderTextColor={colors.text.placeholder}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {/* Drink */}
            <Text style={styles.subLabel}>What did you drink? (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g. Felton Road Pinot Noir 2022"
              placeholderTextColor={colors.text.placeholder}
              value={drinkName}
              onChangeText={setDrinkName}
            />
            {drinkName.trim() ? (
              <TextInput
                style={[styles.notesInput, { marginTop: 8 }]}
                placeholder="Tasting notes…"
                placeholderTextColor={colors.text.placeholder}
                value={drinkNotes}
                onChangeText={setDrinkNotes}
                multiline
              />
            ) : null}

            <TouchableOpacity style={styles.primaryButton} onPress={handleRatingDone}>
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tonight */}
        {step === 'tonight' && (
          <View>
            <Text style={styles.stepTitle}>What are you thinking for tonight?</Text>

            {tonightOptions.length > 0 && (
              <>
                <Text style={styles.sectionMicro}>This week's plan</Text>
                {tonightOptions.map((meal) => (
                  <TouchableOpacity
                    key={meal.id}
                    style={styles.mealOption}
                    onPress={() => handleTonightChoice(meal.id)}
                  >
                    <Text style={styles.mealOptionName}>{meal.meal_name}</Text>
                    {meal.description ? (
                      <Text style={styles.mealOptionDesc} numberOfLines={2}>{meal.description}</Text>
                    ) : null}
                    {meal.is_fish && <Text style={styles.fishNote}>Buy fresh today</Text>}
                    {meal.estimated_prep_minutes ? (
                      <Text style={styles.mealOptionMeta}>~{meal.estimated_prep_minutes} min</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={[styles.sectionMicro, { marginTop: tonightOptions.length > 0 ? 20 : 0 }]}>
              From my recipe stash
            </Text>
            <TextInput
              style={styles.stashSearchInput}
              placeholder="Search recipes…"
              value={tonightStashSearch}
              onChangeText={setTonightStashSearch}
              autoCapitalize="none"
            />
            {(() => {
              const q = tonightStashSearch.trim().toLowerCase();
              if (!q) return null;
              const hits = recipes
                .filter((r) => r.category !== 'cocktails' && r.category !== 'glossary')
                .filter((r) => r.name.toLowerCase().includes(q))
                .slice(0, 6);
              if (!hits.length) return <Text style={styles.mutedText}>No matches</Text>;
              return (
                <View style={styles.stashResults}>
                  {hits.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={styles.stashResult}
                      onPress={() => handleTonightStashPick(r.name)}
                    >
                      <Text style={styles.stashResultName}>{r.name}</Text>
                      <Text style={styles.stashResultCat}>{r.category.replace(/_/g, ' ')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}

            <TouchableOpacity
              style={[styles.mealOption, styles.mealOptionMuted, { marginTop: 20 }]}
              onPress={() => handleTonightChoice('not_sure')}
            >
              <Text style={styles.mealOptionName}>Not sure yet</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Done */}
        {step === 'done' && (
          <View style={styles.doneBlock}>
            <Text style={styles.doneTitle}>All set.</Text>
            {(tonightStashName || (tonightChoice && tonightChoice !== 'not_sure')) && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Tonight</Text>
                <Text style={styles.summaryMeal}>
                  {tonightStashName ?? plannedMeals.find((m) => m.id === tonightChoice)?.meal_name}
                </Text>
                {!tonightStashName && plannedMeals.find((m) => m.id === tonightChoice)?.is_fish && (
                  <Text style={styles.fishNote}>Don't forget to pick up the fish today.</Text>
                )}
              </View>
            )}
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.hairline,
  },
  cancel: { fontSize: 16, color: colors.text.muted },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text.primary },
  content: { padding: 24, paddingTop: 28 },

  stepTitle: { fontSize: 22, fontWeight: '700', color: colors.text.primary, marginBottom: 20 },
  subLabel: { fontSize: 15, fontWeight: '600', color: colors.text.secondary, marginBottom: 10, marginTop: 20 },
  mutedText: { fontSize: 15, color: colors.text.placeholder, fontStyle: 'italic' },

  mealOption: {
    backgroundColor: colors.background.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  mealOptionSelected: { borderColor: colors.brand.primary, borderWidth: 2 },
  mealOptionMuted: { backgroundColor: colors.background.elevated },
  mealOptionName: { fontSize: 17, fontWeight: '600', color: colors.text.primary },
  mealOptionDesc: { fontSize: 13, color: colors.text.muted, marginTop: 4, lineHeight: 18 },
  mealOptionMeta: { fontSize: 12, color: colors.text.placeholder, marginTop: 4 },
  fishNote: { fontSize: 12, fontWeight: '600', color: colors.brand.primary, marginTop: 4 },

  ratingRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  ratingChip: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingChipSelected: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  ratingNum: { fontSize: 16, fontWeight: '700', color: colors.text.secondary },
  ratingNumSelected: { color: colors.text.inverse },
  ratingSelectedLabel: { fontSize: 14, color: colors.brand.primary, fontWeight: '600', marginBottom: 16 },

  yesNoRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  yesNoChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.surface,
    alignItems: 'center',
  },
  yesChipSelected: { backgroundColor: colors.brand.primaryLight, borderColor: colors.brand.primary },
  noChipSelected: { backgroundColor: colors.state.dangerSoft, borderColor: colors.state.dangerBright },
  yesNoText: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },
  yesNoTextSelected: { color: colors.text.primary },

  notesInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 14,
    fontSize: 15,
    color: colors.text.primary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },

  primaryButton: {
    backgroundColor: colors.brand.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: colors.text.inverse, fontWeight: '700', fontSize: 16 },

  doneBlock: { paddingTop: 60, gap: 16 },
  doneTitle: { fontSize: 28, fontWeight: '700', color: colors.text.primary, textAlign: 'center' },

  summaryCard: {
    backgroundColor: colors.background.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  summaryCardGreen: { borderColor: colors.brand.primary },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: colors.text.placeholder, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  summaryMeal: { fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 4 },
  summaryDetail: { fontSize: 14, color: colors.text.muted, marginBottom: 4 },
  summaryNotes: { fontSize: 14, color: colors.text.secondary, fontStyle: 'italic', marginTop: 4 },

  editButton: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  editButtonText: { fontSize: 15, color: colors.text.placeholder, fontWeight: '500' },
  skipLink: { paddingVertical: 14, alignItems: 'center' },
  skipLinkText: { fontSize: 14, color: colors.text.placeholder },
  summaryTapHint: { fontSize: 11, color: colors.text.placeholder, marginTop: 6 },

  sectionMicro: {
    fontSize: 11, fontWeight: '700', color: colors.text.placeholder,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  knownMealCard: {
    backgroundColor: colors.background.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginBottom: 8,
  },
  knownMealName: { fontSize: 20, fontWeight: '700', color: colors.text.primary },
  knownMealRating: { fontSize: 14, color: colors.text.muted, marginTop: 6 },
  changeLink: { alignSelf: 'flex-start', paddingVertical: 4 },
  changeLinkText: { fontSize: 13, color: colors.text.placeholder },

  stashSearchInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 12,
    fontSize: 15,
    color: colors.text.primary,
    marginBottom: 8,
  },
  stashResults: {
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginBottom: 12,
    overflow: 'hidden',
  },
  stashResult: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.hairline,
  },
  stashResultName: { fontSize: 15, fontWeight: '500', color: colors.text.primary, flex: 1 },
  stashResultCat: { fontSize: 12, color: colors.text.placeholder, textTransform: 'capitalize', marginLeft: 8 },
});
