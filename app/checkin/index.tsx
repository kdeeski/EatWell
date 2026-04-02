// Morning check-in modal — daily debrief and tonight planning.
// Saves to DB. Shows summary if already completed today.

import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { saveCheckin, logCookedMeal } from '../../lib/data';

type Step = 'debrief' | 'rating' | 'tonight' | 'done';

const RATING_LABELS = ['', 'Meh', 'Fine', 'Good', 'Great', 'Loved it'];
const RATING_EMOJI = ['', '😐', '🙂', '👍', '😄', '🤩'];

export default function CheckinFlow() {
  const router = useRouter();
  const { plannedMeals, setTodayCheckin, todayCheckin, userId } = useAppStore();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIndex = (yesterday.getDay() + 6) % 7;
  const lastNightsMeal = plannedMeals.find((m) => m.day_of_week === yesterdayIndex);

  const todayIndex = (new Date().getDay() + 6) % 7;
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
  const [rating, setRating] = useState<number | null>(null);
  const [wouldCookAgain, setWouldCookAgain] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [tonightChoice, setTonightChoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setLastNightChoice(initialChoice);
    setRating((existingLastNight?.rating as number | null | undefined) ?? null);
    setWouldCookAgain(existingLastNight?.would_cook_again ?? null);
    setNotes(existingLastNight?.notes ?? '');
    setTonightChoice(todayCheckin?.tonight_planned_meal_id ?? null);
    setStep('debrief');
    setEditing(true);
  };

  // If already completed today, show summary (unless editing)
  if (todayCheckin?.completed_at && !editing) {
    const tonightMeal = plannedMeals.find((m) => m.id === todayCheckin.tonight_planned_meal_id);
    const lastNight = todayCheckin.last_night_response;
    const RATING_LABELS = ['', 'Meh', 'Fine', 'Good', 'Great', 'Loved it'];
    const RATING_EMOJI = ['', '😐', '🙂', '👍', '😄', '🤩'];
    return (
      <View style={styles.container}>
        <View style={styles.header}>
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
                      {RATING_EMOJI[lastNight.rating]} {RATING_LABELS[lastNight.rating]}
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
                <Text style={styles.summaryMeal}>Something else</Text>
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
              <Text style={[styles.summaryLabel, { color: '#3B7A57' }]}>Tonight</Text>
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
    } else {
      setStep('tonight');
    }
  };

  const handleRatingDone = () => {
    setStep('tonight');
  };

  const handleTonightChoice = async (mealId: string) => {
    setTonightChoice(mealId);
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Log cooked meal if they cooked the planned meal
      if (lastNightChoice === lastNightsMeal?.id && userId) {
        await logCookedMeal({
          user_id: userId,
          cooked_date: yesterday.toISOString().split('T')[0],
          planned_meal_id: lastNightsMeal.id,
          actual_meal_name: lastNightsMeal.meal_name,
          rating: rating as 1 | 2 | 3 | 4 | 5 | null,
          would_cook_again: wouldCookAgain,
          notes: notes.trim() || null,
          voice_note_url: null,
          ate_out: false,
        });
      } else if ((lastNightChoice === 'ate_out') && userId) {
        await logCookedMeal({
          user_id: userId,
          cooked_date: yesterday.toISOString().split('T')[0],
          planned_meal_id: null,
          actual_meal_name: 'Ate out',
          rating: null,
          would_cook_again: null,
          notes: null,
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
            meal_name: lastNightChoice === lastNightsMeal?.id ? lastNightsMeal?.meal_name : undefined,
            rating: lastNightChoice === lastNightsMeal?.id ? rating : null,
            would_cook_again: lastNightChoice === lastNightsMeal?.id ? wouldCookAgain : null,
            notes: lastNightChoice === lastNightsMeal?.id ? (notes.trim() || null) : null,
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { setEditing(false); router.back(); }}>
          <Text style={styles.cancel}>{editing ? 'Cancel' : 'Skip'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Morning check-in</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Debrief */}
        {step === 'debrief' && (
          <View>
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
          </View>
        )}

        {/* Rating */}
        {step === 'rating' && (
          <View>
            <Text style={styles.stepTitle}>How was {lastNightsMeal?.meal_name}?</Text>

            {/* Star rating */}
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.ratingChip, rating === r && styles.ratingChipSelected]}
                  onPress={() => setRating(r)}
                >
                  <Text style={styles.ratingEmoji}>{RATING_EMOJI[r]}</Text>
                  <Text style={[styles.ratingText, rating === r && styles.ratingTextSelected]}>
                    {RATING_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

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
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <TouchableOpacity style={styles.primaryButton} onPress={handleRatingDone}>
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tonight */}
        {step === 'tonight' && (
          <View>
            <Text style={styles.stepTitle}>What are you thinking for tonight?</Text>
            {tonightOptions.length === 0 ? (
              <Text style={styles.mutedText}>Nothing planned — you're on your own tonight!</Text>
            ) : (
              tonightOptions.map((meal) => (
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
              ))
            )}
            <TouchableOpacity
              style={[styles.mealOption, styles.mealOptionMuted]}
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
            {tonightChoice && tonightChoice !== 'not_sure' && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Tonight</Text>
                <Text style={styles.summaryMeal}>
                  {plannedMeals.find((m) => m.id === tonightChoice)?.meal_name}
                </Text>
                {plannedMeals.find((m) => m.id === tonightChoice)?.is_fish && (
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cancel: { fontSize: 16, color: '#6B7280' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  content: { padding: 24, paddingTop: 28 },

  stepTitle: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', marginBottom: 20 },
  subLabel: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 10, marginTop: 20 },
  mutedText: { fontSize: 15, color: '#9CA3AF', fontStyle: 'italic' },

  mealOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  mealOptionSelected: { borderColor: '#3B7A57', borderWidth: 2 },
  mealOptionMuted: { backgroundColor: '#F9FAFB' },
  mealOptionName: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  mealOptionDesc: { fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 18 },
  mealOptionMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  fishNote: { fontSize: 12, fontWeight: '600', color: '#3B7A57', marginTop: 4 },

  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  ratingChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    minWidth: 68,
  },
  ratingChipSelected: { backgroundColor: '#3B7A57', borderColor: '#3B7A57' },
  ratingEmoji: { fontSize: 18, marginBottom: 2 },
  ratingText: { fontSize: 12, color: '#374151' },
  ratingTextSelected: { color: '#FFFFFF', fontWeight: '600' },

  yesNoRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  yesNoChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  yesChipSelected: { backgroundColor: '#D1FAE5', borderColor: '#3B7A57' },
  noChipSelected: { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  yesNoText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  yesNoTextSelected: { color: '#1C1C1E' },

  notesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    fontSize: 15,
    color: '#1C1C1E',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },

  primaryButton: {
    backgroundColor: '#3B7A57',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  doneBlock: { paddingTop: 60, gap: 16 },
  doneTitle: { fontSize: 28, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },

  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryCardGreen: { borderColor: '#3B7A57' },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  summaryMeal: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  summaryDetail: { fontSize: 14, color: '#6B7280', marginBottom: 4 },
  summaryNotes: { fontSize: 14, color: '#374151', fontStyle: 'italic', marginTop: 4 },

  editButton: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  editButtonText: { fontSize: 15, color: '#9CA3AF', fontWeight: '500' },
  summaryTapHint: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
});
