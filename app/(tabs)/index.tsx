// Today screen — the home screen of EatWell.
// Shows tonight's chosen meal (or the pick-your-meal prompt),
// any morning check-in that needs completing, and quick fridge notes.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toTitleCase } from '../../lib/titleCase';
import { findStashMatch } from '../../lib/recipes';
import type { PlannedIngredient, Recipe } from '../../types';
import { logCookedMeal, localDateString, updateRecipe } from '../../lib/data';

function formatIngredients(ingredients: PlannedIngredient[]): string {
  return ingredients
    .map((i) => `${i.quantity} ${i.unit} ${toTitleCase(i.name)}`.trim())
    .join('\n');
}
import { useAppStore } from '../../store/useAppStore';
import CookingGuideModal from '../../components/recipes/CookingGuideModal';
import RecipeDetailModal from '../../components/recipes/RecipeDetailModal';
import SaveRecipeModal from '../../components/recipes/SaveRecipeModal';
import type { PlannedMeal } from '../../types';

const RATING_LABELS = ['', 'Meh', 'Fine', 'Good', 'Great', 'Loved it'];
const RATING_EMOJI  = ['', '😐', '🙂', '👍', '😄', '🤩'];

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { plannedMeals, todayCheckin, recipes, userId, updateRecipeInStore } = useAppStore();
  const [guideTarget, setGuideTarget] = useState<PlannedMeal | null>(null);
  const [stashRecipe, setStashRecipe] = useState<Recipe | null>(null);
  const [saveForMeal, setSaveForMeal] = useState<string | null>(null);

  // Inline "log as cooked" panel state
  const [logOpen, setLogOpen]               = useState(false);
  const [logRating, setLogRating]           = useState<number | null>(null);
  const [logAgain, setLogAgain]             = useState<boolean | null>(null);
  const [logNotes, setLogNotes]             = useState('');
  const [logSaving, setLogSaving]           = useState(false);
  const [logDone, setLogDone]               = useState(false);

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

  const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
  const tonightsMeal = plannedMeals.find((m) => m.day_of_week === todayIndex);

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
            What did you cook last night? What are you thinking for tonight?
          </Text>
          <Text style={styles.checkinCta}>Let's do it →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Tonight</Text>
        {tonightsMeal ? (
          <View style={styles.mealCard}>
            <Text style={styles.mealName}>{toTitleCase(tonightsMeal.meal_name)}</Text>
            {tonightsMeal.description ? (
              <Text style={styles.mealDesc}>{tonightsMeal.description}</Text>
            ) : null}
            {(() => {
              const match = findStashMatch(tonightsMeal.meal_name, recipes);
              return match ? (
                match.source_url ? (
                  <TouchableOpacity
                    style={styles.stashNudge}
                    onPress={() => Linking.openURL(match.source_url!)}
                  >
                    <Text style={styles.stashNudgeText}>View recipe →</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.stashNudge}
                    onPress={() => setStashRecipe(match)}
                  >
                    <Text style={styles.stashNudgeText}>📖 You have a recipe for this →</Text>
                  </TouchableOpacity>
                )
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.stashNudge}
                    onPress={() => setSaveForMeal(toTitleCase(tonightsMeal.meal_name))}
                  >
                    <Text style={styles.saveRecipeText}>+ Save a recipe for this</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.howToButton}
                    onPress={() => setGuideTarget(tonightsMeal)}
                  >
                    <Text style={styles.howToButtonText}>How to cook this →</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
            {tonightsMeal.estimated_prep_minutes ? (
              <Text style={styles.mealMeta}>
                ~{tonightsMeal.estimated_prep_minutes} min
                {tonightsMeal.is_fish ? '  ·  Buy fresh today' : ''}
              </Text>
            ) : null}

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
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Text style={styles.logSaveText}>Save</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.logButton} onPress={() => setLogOpen(true)}>
                <Text style={styles.logButtonText}>Cooked it? Log a review →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.emptyCard}
            onPress={() => router.push('/checkin')}
          >
            <Text style={styles.emptyText}>Nothing chosen yet — tap to pick tonight's meal</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>This Week</Text>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/(tabs)/plan')}>
          <Text style={styles.linkText}>See the Full Week →</Text>
        </TouchableOpacity>
      </View>

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
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 20 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  greeting: { fontSize: 28, fontWeight: '700', color: '#1C1C1E' },
  gearIcon: { fontSize: 22, color: '#9CA3AF' },

  checkinCard: {
    backgroundColor: '#3B7A57',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  checkinCardDone: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  checkinTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  checkinTitleDone: { color: '#166534', marginBottom: 10 },
  checkinSub: { fontSize: 14, color: '#D1FAE5', lineHeight: 20, marginBottom: 12 },
  checkinCta: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  checkinRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  checkinRowLabel: { fontSize: 13, fontWeight: '600', color: '#4B7A5B', minWidth: 72 },
  checkinRowValue: { fontSize: 13, color: '#166534', flex: 1 },

  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  mealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  mealName: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 },
  mealDesc: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 8 },
  mealMeta: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },

  emptyCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 15, color: '#9CA3AF', textAlign: 'center' },

  linkRow: { paddingVertical: 4 },
  linkText: { fontSize: 15, color: '#3B7A57', fontWeight: '600' },

  howToButton: { marginTop: 8, marginBottom: 4 },
  howToButtonText: { fontSize: 13, color: '#3B7A57', fontWeight: '600' },

  stashNudge: { marginTop: 4 },
  stashNudgeText: { fontSize: 13, color: '#0369A1', fontWeight: '600' },
  saveRecipeText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  logButton: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  logButtonText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  logDoneRow: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  logDoneText: { fontSize: 13, fontWeight: '600', color: '#3B7A57' },

  logPanel: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 10 },
  logPanelLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },

  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingChip: {
    width: 44, height: 44, borderRadius: 10,
    borderWidth: 1, borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  ratingChipSelected: { backgroundColor: '#3B7A57', borderColor: '#3B7A57' },
  ratingNum: { fontSize: 16, fontWeight: '700', color: '#374151' },
  ratingNumSelected: { color: '#FFFFFF' },
  ratingLabel: { fontSize: 13, color: '#3B7A57', fontWeight: '600' },

  yesNoRow: { flexDirection: 'row', gap: 10 },
  yesNoChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF', alignItems: 'center',
  },
  yesChipSelected: { backgroundColor: '#D1FAE5', borderColor: '#3B7A57' },
  noChipSelected:  { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  yesNoText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  notesInput: {
    backgroundColor: '#F9FAFB', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    padding: 12, fontSize: 14, color: '#1C1C1E',
    minHeight: 60, textAlignVertical: 'top',
  },
  logBtnRow: { flexDirection: 'row', gap: 10 },
  logCancelBtn: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  logCancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  logSaveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#3B7A57', alignItems: 'center', justifyContent: 'center',
  },
  logSaveBtnDisabled: { opacity: 0.5 },
  logSaveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
