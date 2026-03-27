// Morning check-in modal — the daily 7am flow.
// Part 1: What did you cook last night? (+ rating if they loved it)
// Part 2: What are you cooking tonight?

import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';

type Step = 'debrief' | 'rating' | 'tonight' | 'done';

const RATING_LABELS = ['', 'Meh', 'Fine', 'Good', 'Great', 'Loved it'];

export default function CheckinFlow() {
  const router = useRouter();
  const { plannedMeals, setTodayCheckin, todayCheckin } = useAppStore();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIndex = (yesterday.getDay() + 6) % 7;
  const lastNightsMeal = plannedMeals.find((m) => m.day_of_week === yesterdayIndex);

  const todayIndex = (new Date().getDay() + 6) % 7;
  const tonightOptions = plannedMeals.filter((m) => m.day_of_week === todayIndex);

  const [step, setStep] = useState<Step>('debrief');
  const [lastNightChoice, setLastNightChoice] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [tonightChoice, setTonightChoice] = useState<string | null>(null);

  const handleDebrief = (choice: string) => {
    setLastNightChoice(choice);
    if (choice === lastNightsMeal?.id) {
      setStep('rating');
    } else {
      setStep('tonight');
    }
  };

  const handleRating = (r: number) => {
    setRating(r);
    setStep('tonight');
  };

  const handleTonightChoice = (mealId: string) => {
    setTonightChoice(mealId);
    setStep('done');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Skip</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Morning check-in</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Part 1: Last night debrief */}
        {step === 'debrief' && (
          <View>
            <Text style={styles.stepTitle}>What did you end up cooking last night?</Text>

            {lastNightsMeal && (
              <TouchableOpacity
                style={styles.mealOption}
                onPress={() => handleDebrief(lastNightsMeal.id)}
              >
                <Text style={styles.mealOptionName}>{lastNightsMeal.meal_name}</Text>
                <Text style={styles.mealOptionMeta}>The plan</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.mealOption}
              onPress={() => handleDebrief('something_else')}
            >
              <Text style={styles.mealOptionName}>Something else</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mealOption}
              onPress={() => handleDebrief('ate_out')}
            >
              <Text style={styles.mealOptionName}>Ate out / ordered in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mealOption}
              onPress={() => handleDebrief('didnt_cook')}
            >
              <Text style={styles.mealOptionName}>Didn't cook</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Rating */}
        {step === 'rating' && (
          <View>
            <Text style={styles.stepTitle}>How was it?</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.ratingChip, rating === r && styles.ratingChipSelected]}
                  onPress={() => handleRating(r)}
                >
                  <Text style={[styles.ratingText, rating === r && styles.ratingTextSelected]}>
                    {RATING_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Part 2: Tonight */}
        {step === 'tonight' && (
          <View>
            <Text style={styles.stepTitle}>What are you thinking for tonight?</Text>
            {tonightOptions.length === 0 ? (
              <Text style={styles.mutedText}>Nothing planned for tonight — you're on your own!</Text>
            ) : (
              tonightOptions.map((meal) => (
                <TouchableOpacity
                  key={meal.id}
                  style={styles.mealOption}
                  onPress={() => handleTonightChoice(meal.id)}
                >
                  <Text style={styles.mealOptionName}>{meal.meal_name}</Text>
                  {meal.description ? (
                    <Text style={styles.mealOptionDesc}>{meal.description}</Text>
                  ) : null}
                  {meal.is_fish && (
                    <Text style={styles.fishNote}>Buy fresh today</Text>
                  )}
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
              <Text style={styles.doneBody}>
                {plannedMeals.find((m) => m.id === tonightChoice)?.meal_name} it is tonight.
                {plannedMeals.find((m) => m.id === tonightChoice)?.is_fish
                  ? " Don't forget to pick up the fish today."
                  : ''}
              </Text>
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
  mealOptionMuted: { backgroundColor: '#F9FAFB' },
  mealOptionName: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  mealOptionDesc: { fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 18 },
  mealOptionMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  fishNote: { fontSize: 12, fontWeight: '600', color: '#3B7A57', marginTop: 4 },

  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  ratingChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  ratingChipSelected: { backgroundColor: '#3B7A57', borderColor: '#3B7A57' },
  ratingText: { fontSize: 15, color: '#374151' },
  ratingTextSelected: { color: '#FFFFFF', fontWeight: '600' },

  doneBlock: { alignItems: 'center', paddingTop: 60, gap: 16 },
  doneTitle: { fontSize: 28, fontWeight: '700', color: '#1C1C1E' },
  doneBody: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24, maxWidth: 280 },

  primaryButton: {
    backgroundColor: '#3B7A57',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
