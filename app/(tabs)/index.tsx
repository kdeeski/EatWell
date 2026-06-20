// Today screen — the home screen of EatWell.
// Shows tonight's chosen meal (or the pick-your-meal prompt),
// any morning check-in that needs completing, and quick fridge notes.

import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toTitleCase } from '../../lib/titleCase';
import { findStashMatch } from '../../lib/recipes';
import type { PlannedIngredient, Recipe } from '../../types';
import { logCookedMeal, localDateString, updateRecipe, fetchCookedMealForPlannedMeal, deleteRecipe, loadTodaysSomethingElseCook, loadCookedMealForDate } from '../../lib/data';
import { getWineMatch } from '../../lib/claude';
import type { WineMatchResult } from '../../lib/claude';
import { saveRecipe } from '../../lib/data';

function formatIngredients(ingredients: PlannedIngredient[]): string {
  return ingredients
    .map((i) => `${i.quantity} ${i.unit} ${toTitleCase(i.name)}`.trim())
    .join('\n');
}
import { useAppStore } from '../../store/useAppStore';
import { colors } from '../../constants/theme';
import { shared } from '../../constants/styles';
import CookingGuideModal from '../../components/recipes/CookingGuideModal';
import RecipeDetailModal from '../../components/recipes/RecipeDetailModal';
import SaveRecipeModal from '../../components/recipes/SaveRecipeModal';
import type { PlannedMeal } from '../../types';

const RATING_LABELS = ['', 'Meh', 'Fine', 'Good', 'Great', 'Loved it'];
const RATING_EMOJI  = ['', '😐', '🙂', '👍', '😄', '🤩'];

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { plannedMeals, todayCheckin, recipes, userId, updateRecipeInStore, removeRecipe, setTonightSomethingElseName, tonightSomethingElseName, inventoryItems, userPreferences, addRecipe } = useAppStore();
  const [guideTarget, setGuideTarget] = useState<PlannedMeal | null>(null);
  const [stashRecipe, setStashRecipe] = useState<Recipe | null>(null);
  const [saveForMeal, setSaveForMeal] = useState<string | null>(null);

  // "Something else tonight" sheet state
  const [elseOpen, setElseOpen]                   = useState(false);
  const [elseSearch, setElseSearch]               = useState('');
  const [elseSelectedRecipe, setElseSelectedRecipe] = useState<Recipe | null>(null);
  const [elseGuideTarget, setElseGuideTarget]     = useState<{ name: string } | null>(null);
  const elseSearchRef = useRef<TextInput>(null);

  // Inline "log as cooked" panel state — planned meal
  const [logOpen, setLogOpen]               = useState(false);
  const [logRating, setLogRating]           = useState<number | null>(null);
  const [logAgain, setLogAgain]             = useState<boolean | null>(null);
  const [logNotes, setLogNotes]             = useState('');
  const [logDrinkName, setLogDrinkName]     = useState('');
  const [logDrinkNotes, setLogDrinkNotes]   = useState('');
  const [logSaving, setLogSaving]           = useState(false);
  const [logDone, setLogDone]               = useState(false);

  // Inline "log as cooked" panel state — something else
  const [elseLogOpen, setElseLogOpen]       = useState(false);
  const [elseLogRating, setElseLogRating]   = useState<number | null>(null);
  const [elseLogAgain, setElseLogAgain]     = useState<boolean | null>(null);
  const [elseLogNotes, setElseLogNotes]     = useState('');
  const [elseLogDrinkName, setElseLogDrinkName] = useState('');
  const [elseLogDrinkNotes, setElseLogDrinkNotes] = useState('');
  const [elseLogSaving, setElseLogSaving]   = useState(false);
  const [elseLogDone, setElseLogDone]       = useState(false);

  // Drink pairing for tonight's meal
  const [wineResult, setWineResult]   = useState<WineMatchResult | null>(null);
  const [wineLoading, setWineLoading] = useState(false);
  const [wineError, setWineError]     = useState<string | null>(null);

  const handleDrinkPairing = async (mealName: string, description: string | null) => {
    if (wineLoading) return;
    setWineLoading(true);
    setWineError(null);
    setWineResult(null);
    try {
      const barNames = inventoryItems
        .filter((i) => (i.location === 'bar' || i.location === 'cellar') && !i.depleted)
        .map((i) => i.name);
      const result = await getWineMatch({
        meal_name: mealName,
        description: description ?? undefined,
        detail_level: userPreferences?.wine_detail_level ?? 'simple',
        bar_inventory: barNames.length > 0 ? barNames : undefined,
      });
      setWineResult(result);
    } catch (e: any) {
      setWineError('Could not load pairing — tap to retry');
    } finally {
      setWineLoading(false);
    }
  };

  const todayIndex = (new Date().getDay() + 6) % 7;
  const tonightsMeal = plannedMeals.find((m) => m.day_of_week === todayIndex);

  // Reset wine result when tonight's meal changes
  useEffect(() => {
    setWineResult(null);
    setWineError(null);
  }, [tonightsMeal?.id]);

  const [lastNightAlreadyLogged, setLastNightAlreadyLogged] = useState(false);
  useEffect(() => {
    if (!userId) return;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    loadCookedMealForDate(userId, localDateString(yesterday))
      .then((c) => { if (c) setLastNightAlreadyLogged(true); })
      .catch(() => {});
  }, [userId]);

  // Restore something-else cook state on reload
  useEffect(() => {
    if (!userId) return;
    loadTodaysSomethingElseCook(userId)
      .then((cook) => {
        if (!cook) return;
        setTonightSomethingElseName(cook.actual_meal_name);
        setElseLogDone(true);
        if (cook.rating != null) setElseLogRating(cook.rating);
      })
      .catch(() => {});
  }, [userId]);

  // Load any review already logged for tonight's meal (e.g. via Tonight card yesterday)
  useEffect(() => {
    if (!userId || !tonightsMeal) return;
    fetchCookedMealForPlannedMeal(userId, tonightsMeal.id)
      .then((cooked) => {
        if (!cooked) return;
        setLogDone(true);
        if (cooked.rating != null) setLogRating(cooked.rating);
      })
      .catch(() => {});
  }, [userId, tonightsMeal?.id]);

  const handleLogCooked = async () => {
    if (!tonightsMeal || !userId) return;
    setLogSaving(true);
    try {
      await logCookedMeal({
        user_id: userId,
        cooked_date: localDateString(),
        planned_meal_id: tonightsMeal.id,
        actual_meal_name: tonightsMeal.meal_name,
        rating: logRating as 1 | 2 | 3 | 4 | 5 | null,
        would_cook_again: logAgain,
        notes: logNotes.trim() || null,
        drink_name: logDrinkName.trim() || null,
        drink_notes: logDrinkNotes.trim() || null,
        voice_note_url: null,
        ate_out: false,
      });
      if (logRating != null) {
        const match = findStashMatch(tonightsMeal.meal_name, recipes);
        if (match) {
          try {
            const updated = await updateRecipe(match.id, { ...match, rating: logRating as 1|2|3|4|5 });
            updateRecipeInStore(match.id, updated);
          } catch { /* non-critical */ }
        }
      }
      setLogDone(true);
      setLogOpen(false);
    } catch (e) {
      console.error('Failed to log cooked meal', e);
    }
    setLogSaving(false);
  };

  const handleElseLogCooked = async () => {
    if (!tonightSomethingElseName || !userId) return;
    setElseLogSaving(true);
    try {
      await logCookedMeal({
        user_id: userId,
        cooked_date: localDateString(),
        planned_meal_id: null,
        actual_meal_name: tonightSomethingElseName,
        rating: elseLogRating as 1 | 2 | 3 | 4 | 5 | null,
        would_cook_again: elseLogAgain,
        notes: elseLogNotes.trim() || null,
        drink_name: elseLogDrinkName.trim() || null,
        drink_notes: elseLogDrinkNotes.trim() || null,
        voice_note_url: null,
        ate_out: false,
      });
      if (elseLogRating != null) {
        const match = findStashMatch(tonightSomethingElseName, recipes);
        if (match) {
          try {
            const updated = await updateRecipe(match.id, { ...match, rating: elseLogRating as 1|2|3|4|5 });
            updateRecipeInStore(match.id, updated);
          } catch { /* non-critical */ }
        }
      }
      setElseLogDone(true);
      setElseLogOpen(false);
    } catch (e) {
      console.error('Failed to log something-else meal', e);
    }
    setElseLogSaving(false);
  };

  const elseRecipes = recipes
    .filter((r) => r.category !== 'cocktails' && r.category !== 'glossary')
    .filter((r) => !elseSearch.trim() || r.name.toLowerCase().includes(elseSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleElseClose = () => { setElseOpen(false); setElseSearch(''); };

  const handleElseRecipe = (r: Recipe) => {
    handleElseClose();
    setTonightSomethingElseName(r.name);
    if (r.source_url) { Linking.openURL(r.source_url); }
    else { setElseSelectedRecipe(r); }
  };

  const handleElseAskClaude = () => {
    const name = elseSearch.trim();
    if (!name) {
      elseSearchRef.current?.focus();
      return;
    }
    setTonightSomethingElseName(name);
    handleElseClose();
    setElseGuideTarget({ name });
  };

  const checkinDone = !!todayCheckin?.completed_at;
  const lastNight   = todayCheckin?.last_night_response ?? null;
  const tonightPicked = checkinDone
    ? plannedMeals.find((m) => m.id === todayCheckin?.tonight_planned_meal_id) ?? null
    : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Text style={styles.greeting}>Good morning.</Text>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {checkinDone ? (
        /* ── Completed check-in summary ── */
        <TouchableOpacity
          style={[styles.checkinCard, styles.checkinCardDone]}
          onPress={() => router.push('/checkin')}
        >
          <Text style={[styles.checkinTitle, styles.checkinTitleDone]}>
            Morning Check-In ✓
          </Text>

          {lastNight && (
            <View style={styles.checkinRow}>
              <Text style={styles.checkinRowLabel}>Last night</Text>
              {lastNight.type === 'planned' && lastNight.meal_name ? (
                <Text style={styles.checkinRowValue}>
                  {toTitleCase(lastNight.meal_name)}
                  {lastNight.rating != null
                    ? `  ${RATING_EMOJI[lastNight.rating]} ${RATING_LABELS[lastNight.rating]}`
                    : ''}
                </Text>
              ) : lastNight.type === 'ate_out' ? (
                <Text style={styles.checkinRowValue}>Ate out</Text>
              ) : lastNight.type === 'something_else' ? (
                <Text style={styles.checkinRowValue}>Something else</Text>
              ) : (
                <Text style={styles.checkinRowValue}>Didn't cook</Text>
              )}
            </View>
          )}

          {tonightPicked && (
            <View style={styles.checkinRow}>
              <Text style={styles.checkinRowLabel}>Tonight</Text>
              <Text style={styles.checkinRowValue}>{toTitleCase(tonightPicked.meal_name)}</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        /* ── Pending check-in prompt ── */
        <TouchableOpacity
          style={styles.checkinCard}
          onPress={() => router.push('/checkin')}
        >
          <Text style={styles.checkinTitle}>Morning Check-In</Text>
          <Text style={styles.checkinSub}>
            {lastNightAlreadyLogged
              ? 'What are you thinking for tonight?'
              : 'What did you cook last night? What are you thinking for tonight?'}
          </Text>
          <Text style={styles.checkinCta}>Let's do it →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>Tonight</Text>
          <TouchableOpacity onPress={() => setElseOpen(true)}>
            <Text style={styles.somethingElseLink}>Something else? →</Text>
          </TouchableOpacity>
        </View>
        {tonightsMeal && !elseLogDone ? (
          <View style={styles.mealCard}>
            <Text style={styles.mealName}>{toTitleCase(tonightsMeal.meal_name)}</Text>
            {tonightsMeal.estimated_prep_minutes ? (
              <Text style={styles.mealMeta}>
                ~{tonightsMeal.estimated_prep_minutes} min
                {tonightsMeal.is_fish ? '  ·  Buy fresh today' : ''}
              </Text>
            ) : null}
            {tonightsMeal.description ? (
              <Text style={styles.mealDesc}>{tonightsMeal.description}</Text>
            ) : null}
            {(() => {
              const match = findStashMatch(tonightsMeal.meal_name, recipes);
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
                    onPress={() => setSaveForMeal(toTitleCase(tonightsMeal.meal_name))}
                  >
                    <Text style={styles.saveRecipeText}>+ Save a recipe for this</Text>
                    <Text style={shared.ctaArrow}>→</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={shared.ctaRow}
                    onPress={() => setGuideTarget(tonightsMeal)}
                  >
                    <Text style={styles.howToButtonText}>How to cook this</Text>
                    <Text style={shared.ctaArrow}>→</Text>
                  </TouchableOpacity>
                </>
              );
            })()}

            {/* Drink pairing */}
            {wineResult ? (
              <View style={styles.wineSection}>
                <Text style={styles.wineSectionLabel}>Drink pairing</Text>
                {wineResult.pairings.map((p, i) => {
                  const inGlossary = recipes.some((r) => r.category === 'glossary' && r.name.toLowerCase() === p.varietal.toLowerCase());
                  return (
                    <View key={i} style={styles.wineCard}>
                      <Text style={styles.wineVarietal}>{p.varietal}</Text>
                      <Text style={styles.wineReason}>{p.reason}</Text>
                      {p.pairing_note ? <Text style={styles.wineNote}>{p.pairing_note}</Text> : null}
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
                <TouchableOpacity onPress={() => { setWineResult(null); setWineError(null); }}>
                  <Text style={styles.wineDismiss}>Clear</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.wineSection}>
                <TouchableOpacity
                  style={shared.ctaRow}
                  onPress={() => handleDrinkPairing(tonightsMeal.meal_name, tonightsMeal.description)}
                  disabled={wineLoading}
                >
                  {wineLoading
                    ? <ActivityIndicator size="small" color={colors.brand.primary} />
                    : <>
                        <Text style={styles.drinkPairingLink}>Drink pairing</Text>
                        <Text style={shared.ctaArrow}>→</Text>
                      </>}
                </TouchableOpacity>
                {wineError ? (
                  <TouchableOpacity onPress={() => handleDrinkPairing(tonightsMeal.meal_name, tonightsMeal.description)}>
                    <Text style={styles.wineError}>{wineError} Tap to retry.</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Inline "log as cooked" */}
            {logDone ? (
              <View style={styles.logDoneRow}>
                <Text style={styles.logDoneText}>
                  Cooked ✓{logRating != null ? `  ·  ${logRating}/5 ${RATING_EMOJI[logRating]}` : ''}
                </Text>
              </View>
            ) : logOpen ? (
              <View style={styles.logPanel}>
                <Text style={styles.logPanelLabel}>How was it?</Text>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.ratingChip, logRating === r && styles.ratingChipSelected]}
                      onPress={() => setLogRating(r)}
                    >
                      <Text style={[styles.ratingNum, logRating === r && styles.ratingNumSelected]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {logRating != null && (
                  <Text style={styles.ratingLabel}>{RATING_LABELS[logRating]} {RATING_EMOJI[logRating]}</Text>
                )}
                <View style={styles.yesNoRow}>
                  <TouchableOpacity
                    style={[styles.yesNoChip, logAgain === true && styles.yesChipSelected]}
                    onPress={() => setLogAgain(true)}
                  >
                    <Text style={styles.yesNoText}>Cook again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.yesNoChip, logAgain === false && styles.noChipSelected]}
                    onPress={() => setLogAgain(false)}
                  >
                    <Text style={styles.yesNoText}>One-off</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Any notes? (optional)"
                  value={logNotes}
                  onChangeText={setLogNotes}
                  multiline
                />
                <TextInput
                  style={styles.notesInput}
                  placeholder="What did you drink? (optional)"
                  value={logDrinkName}
                  onChangeText={setLogDrinkName}
                />
                {logDrinkName.trim() ? (
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Tasting notes…"
                    value={logDrinkNotes}
                    onChangeText={setLogDrinkNotes}
                    multiline
                  />
                ) : null}
                <View style={styles.logBtnRow}>
                  <TouchableOpacity style={styles.logCancelBtn} onPress={() => setLogOpen(false)}>
                    <Text style={styles.logCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.logSaveBtn, logSaving && styles.logSaveBtnDisabled]}
                    onPress={handleLogCooked}
                    disabled={logSaving}
                  >
                    {logSaving
                      ? <ActivityIndicator size="small" color={colors.text.inverse} />
                      : <Text style={styles.logSaveText}>Save</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={[styles.logButton, shared.ctaRow]} onPress={() => setLogOpen(true)}>
                <Text style={styles.logButtonText}>Cooked it? Log a review</Text>
                <Text style={shared.ctaArrow}>→</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : !elseLogDone ? (
          <TouchableOpacity
            style={styles.emptyCard}
            onPress={() => router.push('/checkin')}
          >
            <Text style={styles.emptyText}>Nothing chosen yet — tap to pick tonight's meal</Text>
          </TouchableOpacity>
        ) : null}

        {/* Something-else card with its own log panel */}
        {tonightSomethingElseName ? (
          <View style={[styles.mealCard, { marginTop: 10 }]}>
            <Text style={styles.mealName}>{tonightSomethingElseName}</Text>
            <Text style={styles.mealDesc}>Something else tonight</Text>
            {elseLogDone ? (
              <View style={styles.logDoneRow}>
                <Text style={styles.logDoneText}>
                  Cooked ✓{elseLogRating != null ? `  ·  ${elseLogRating}/5 ${RATING_EMOJI[elseLogRating]}` : ''}
                </Text>
              </View>
            ) : elseLogOpen ? (
              <View style={styles.logPanel}>
                <Text style={styles.logPanelLabel}>How was it?</Text>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.ratingChip, elseLogRating === r && styles.ratingChipSelected]}
                      onPress={() => setElseLogRating(r)}
                    >
                      <Text style={[styles.ratingNum, elseLogRating === r && styles.ratingNumSelected]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {elseLogRating != null && (
                  <Text style={styles.ratingLabel}>{RATING_LABELS[elseLogRating]} {RATING_EMOJI[elseLogRating]}</Text>
                )}
                <View style={styles.yesNoRow}>
                  <TouchableOpacity style={[styles.yesNoChip, elseLogAgain === true && styles.yesChipSelected]} onPress={() => setElseLogAgain(true)}>
                    <Text style={styles.yesNoText}>Cook again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.yesNoChip, elseLogAgain === false && styles.noChipSelected]} onPress={() => setElseLogAgain(false)}>
                    <Text style={styles.yesNoText}>One-off</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={styles.notesInput} placeholder="Any notes? (optional)" value={elseLogNotes} onChangeText={setElseLogNotes} multiline />
                <TextInput
                  style={styles.notesInput}
                  placeholder="What did you drink? (optional)"
                  value={elseLogDrinkName}
                  onChangeText={setElseLogDrinkName}
                />
                {elseLogDrinkName.trim() ? (
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Tasting notes…"
                    value={elseLogDrinkNotes}
                    onChangeText={setElseLogDrinkNotes}
                    multiline
                  />
                ) : null}
                <View style={styles.logBtnRow}>
                  <TouchableOpacity style={styles.logCancelBtn} onPress={() => setElseLogOpen(false)}>
                    <Text style={styles.logCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.logSaveBtn, elseLogSaving && styles.logSaveBtnDisabled]}
                    onPress={handleElseLogCooked}
                    disabled={elseLogSaving}
                  >
                    {elseLogSaving ? <ActivityIndicator size="small" color={colors.text.inverse} /> : <Text style={styles.logSaveText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={[styles.logButton, shared.ctaRow]} onPress={() => setElseLogOpen(true)}>
                <Text style={styles.logButtonText}>Cooked it? Log a review</Text>
                <Text style={shared.ctaArrow}>→</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>This Week</Text>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/(tabs)/plan')}>
          <Text style={styles.linkText}>See the Full Week →</Text>
        </TouchableOpacity>
      </View>

      {/* Something else tonight — bottom sheet */}
      <Modal visible={elseOpen} animationType="slide" transparent onRequestClose={handleElseClose}>
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={handleElseClose} />
          <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>What do you fancy?</Text>
            <TextInput
              ref={elseSearchRef}
              style={styles.sheetSearch}
              placeholder="Search your recipes…"
              placeholderTextColor={colors.text.placeholder}
              value={elseSearch}
              onChangeText={setElseSearch}
              autoFocus
              returnKeyType="search"
            />
            <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
              {elseRecipes.map((r) => (
                <TouchableOpacity key={r.id} style={styles.sheetItem} onPress={() => handleElseRecipe(r)}>
                  <Text style={styles.sheetItemName}>{r.name}</Text>
                  <Text style={styles.sheetItemCat}>{r.category.replace(/_/g, ' ')}</Text>
                </TouchableOpacity>
              ))}
              {elseRecipes.length === 0 && elseSearch.trim() === '' && (
                <Text style={styles.sheetEmpty}>No recipes saved yet.</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.sheetClaudeBtn}
              onPress={handleElseAskClaude}
            >
              <Text style={styles.sheetClaudeText}>
                {elseSearch.trim()
                  ? `Ask Claude how to make "${elseSearch.trim()}" →`
                  : 'Ask Claude for a recipe →'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {saveForMeal && (
        <SaveRecipeModal
          visible
          prefill={{ name: saveForMeal, category: 'mains' }}
          onSave={() => setSaveForMeal(null)}
          onClose={() => setSaveForMeal(null)}
        />
      )}

      {stashRecipe && (
        <RecipeDetailModal
          recipe={stashRecipe}
          onClose={() => setStashRecipe(null)}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      )}

      {elseSelectedRecipe && (
        <RecipeDetailModal
          recipe={elseSelectedRecipe}
          onClose={() => setElseSelectedRecipe(null)}
          onEdit={() => {}}
          onDelete={async () => {
            try {
              await deleteRecipe(elseSelectedRecipe.id);
              removeRecipe(elseSelectedRecipe.id);
              setElseSelectedRecipe(null);
            } catch (e: any) {
              Alert.alert('Could not delete', e?.message ?? 'Something went wrong.');
            }
          }}
        />
      )}

      {elseGuideTarget && (
        <CookingGuideModal
          mealName={toTitleCase(elseGuideTarget.name)}
          description=""
          visible={!!elseGuideTarget}
          onClose={() => setElseGuideTarget(null)}
        />
      )}

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
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app },
  content: { padding: 20 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.text.primary },
  gearIcon: { fontSize: 22, color: colors.text.placeholder },

  checkinCard: {
    backgroundColor: colors.brand.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  checkinCardDone: {
    backgroundColor: colors.brand.primaryLighter,
    borderWidth: 1,
    borderColor: colors.brand.primaryLight,
  },
  checkinTitle: { fontSize: 17, fontWeight: '700', color: colors.text.inverse, marginBottom: 6 },
  checkinTitleDone: { color: colors.brand.primaryDark, marginBottom: 10 },
  checkinSub: { fontSize: 14, color: colors.brand.primaryLight, lineHeight: 20, marginBottom: 12 },
  checkinCta: { fontSize: 14, fontWeight: '600', color: colors.text.inverse },
  checkinRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  checkinRowLabel: { fontSize: 13, fontWeight: '600', color: colors.brand.primary, minWidth: 72 },
  checkinRowValue: { fontSize: 13, color: colors.brand.primaryDark, flex: 1 },

  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  mealCard: {
    backgroundColor: colors.background.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  mealName: { fontSize: 20, fontWeight: '700', color: colors.text.primary, marginBottom: 4 },
  mealMeta: { fontSize: 12, color: colors.text.placeholder, fontWeight: '500', marginBottom: 8 },
  mealDesc: { fontSize: 14, color: colors.text.muted, lineHeight: 20, marginBottom: 4 },

  emptyCard: {
    backgroundColor: colors.background.elevated,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 15, color: colors.text.placeholder, textAlign: 'center' },

  linkRow: { paddingVertical: 4 },
  linkText: { fontSize: 15, color: colors.brand.primary, fontWeight: '600' },

  howToButtonText: { fontSize: 13, color: colors.brand.primary, fontWeight: '600' },
  stashNudgeText: { fontSize: 13, color: colors.state.info, fontWeight: '600' },
  saveRecipeText: { fontSize: 13, color: colors.text.placeholder, fontWeight: '500' },

  wineSection: { gap: 8 },
  wineSectionLabel: { fontSize: 13, fontWeight: '600', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  drinkPairingLink: { fontSize: 13, fontWeight: '600', color: colors.brand.primary },
  wineCard: { backgroundColor: colors.background.elevated, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, padding: 12, gap: 4 },
  cocktailCard: { backgroundColor: colors.brand.plumLighter, borderColor: colors.brand.plumLight },
  wineVarietal: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  wineReason: { fontSize: 14, color: colors.text.secondary, lineHeight: 20 },
  wineNote: { fontSize: 13, color: colors.text.muted, lineHeight: 19, marginTop: 4 },
  cocktailName: { color: colors.brand.plum },
  wineDismiss: { fontSize: 12, color: colors.text.placeholder, marginTop: 4 },
  wineError: { fontSize: 13, color: colors.state.dangerBright, marginTop: 4 },
  glossaryAdd: { fontSize: 12, color: colors.brand.primary, fontWeight: '600', marginTop: 6 },
  glossarySaved: { fontSize: 12, color: colors.text.placeholder, marginTop: 6 },

  logButton: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border.hairline },
  logButtonText: { fontSize: 13, color: colors.text.placeholder, fontWeight: '500' },
  logDoneRow: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border.hairline },
  logDoneText: { fontSize: 13, fontWeight: '600', color: colors.brand.primary },

  logPanel: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border.hairline, gap: 10 },
  logPanelLabel: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },

  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingChip: {
    width: 44, height: 44, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border.default,
    backgroundColor: colors.background.surface, alignItems: 'center', justifyContent: 'center',
  },
  ratingChipSelected: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  ratingNum: { fontSize: 16, fontWeight: '700', color: colors.text.secondary },
  ratingNumSelected: { color: colors.text.inverse },
  ratingLabel: { fontSize: 13, color: colors.brand.primary, fontWeight: '600' },

  yesNoRow: { flexDirection: 'row', gap: 10 },
  yesNoChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border.default,
    backgroundColor: colors.background.surface, alignItems: 'center',
  },
  yesChipSelected: { backgroundColor: colors.brand.primaryLight, borderColor: colors.brand.primary },
  noChipSelected:  { backgroundColor: colors.state.dangerSoft, borderColor: colors.state.dangerBright },
  yesNoText: { fontSize: 14, fontWeight: '600', color: colors.text.secondary },

  notesInput: {
    backgroundColor: colors.background.elevated, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border.default,
    padding: 12, fontSize: 14, color: colors.text.primary,
    minHeight: 60, textAlignVertical: 'top',
  },
  logBtnRow: { flexDirection: 'row', gap: 10 },
  logCancelBtn: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.background.elevated,
  },
  logCancelText: { fontSize: 14, fontWeight: '600', color: colors.text.muted },
  logSaveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center',
  },
  logSaveBtnDisabled: { opacity: 0.5 },
  logSaveText: { fontSize: 14, fontWeight: '700', color: colors.text.inverse },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  somethingElseLink: { fontSize: 13, color: colors.brand.primary, fontWeight: '600' },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetDismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.background.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border.default, alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 14 },
  sheetSearch: {
    backgroundColor: colors.background.elevated, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: colors.text.primary, marginBottom: 12,
  },
  sheetList: { maxHeight: 280 },
  sheetItem: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.hairline,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sheetItemName: { fontSize: 15, color: colors.text.primary, fontWeight: '500', flex: 1 },
  sheetItemCat: { fontSize: 12, color: colors.text.placeholder, marginLeft: 8, textTransform: 'capitalize' },
  sheetEmpty: { fontSize: 14, color: colors.text.placeholder, textAlign: 'center', paddingVertical: 20 },
  sheetClaudeBtn: {
    marginTop: 16, paddingVertical: 14,
    borderRadius: 14, backgroundColor: colors.brand.primary,
    alignItems: 'center',
  },
  sheetClaudeText: { fontSize: 14, fontWeight: '600', color: colors.text.inverse },
});
