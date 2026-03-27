// This Week screen — shows the 7-meal plan, one card per day.
// Tapping a day lets you swap meals or see ingredients.

import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PlanScreen() {
  const router = useRouter();
  const { plannedMeals, currentMealPlan } = useAppStore();

  const hasPlan = plannedMeals.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>This Week</Text>

      {!hasPlan ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No plan yet</Text>
          <Text style={styles.emptyBody}>
            Time to plan the week. The app will look at what's in your fridge,
            what's in the garden, and build 7 meals around it.
          </Text>
          <TouchableOpacity
            style={styles.planButton}
            onPress={() => router.push('/planning')}
          >
            <Text style={styles.planButtonText}>Plan this week</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {DAY_LABELS.map((label, index) => {
            const meal = plannedMeals.find((m) => m.day_of_week === index);
            return (
              <View key={index} style={styles.dayRow}>
                <Text style={styles.dayLabel}>{label}</Text>
                {meal ? (
                  <View style={styles.mealChip}>
                    <Text style={styles.mealChipName}>{meal.meal_name}</Text>
                    {meal.is_fish && (
                      <Text style={styles.fishBadge}>Buy fresh</Text>
                    )}
                    {meal.estimated_prep_minutes ? (
                      <Text style={styles.mealChipMeta}>~{meal.estimated_prep_minutes} min</Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={[styles.mealChip, styles.mealChipEmpty]}>
                    <Text style={styles.mealChipEmpty}>Night off</Text>
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.replannButton}
            onPress={() => router.push('/planning')}
          >
            <Text style={styles.replannButtonText}>Replan the week</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 20, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 24 },

  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 },
  emptyBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  planButton: {
    backgroundColor: '#3B7A57',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  planButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  dayLabel: {
    width: 36,
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    paddingTop: 14,
  },
  mealChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  mealChipName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  mealChipMeta: { fontSize: 12, color: '#9CA3AF' },
  mealChipEmpty: { fontSize: 14, color: '#D1D5DB', fontStyle: 'italic' },
  fishBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B7A57',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },

  replannButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  replannButtonText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
});
