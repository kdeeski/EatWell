// This Week screen — shows the 7-meal plan, one card per day.
// Tap a meal card to expand and read the full cooking description.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { updateMealDayOfWeek } from '../../lib/data';
import type { PlannedMeal } from '../../types';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PlanScreen() {
  const router = useRouter();
  const { plannedMeals, currentMealPlan, setMealPlan } = useAppStore();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const swapDays = async (dayA: number, dayB: number) => {
    const mealA = plannedMeals.find((m) => m.day_of_week === dayA);
    const mealB = plannedMeals.find((m) => m.day_of_week === dayB);
    if (!mealA || !mealB || !currentMealPlan) return;
    // Optimistic update
    setMealPlan(currentMealPlan, plannedMeals.map((m) => {
      if (m.id === mealA.id) return { ...m, day_of_week: dayB as PlannedMeal['day_of_week'] };
      if (m.id === mealB.id) return { ...m, day_of_week: dayA as PlannedMeal['day_of_week'] };
      return m;
    }));
    setExpandedDay(null);
    try {
      await updateMealDayOfWeek(mealA.id, dayB);
      await updateMealDayOfWeek(mealB.id, dayA);
    } catch (e) {
      console.error('Failed to swap meals', e);
    }
  };

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
          {DAY_SHORT.map((short, index) => {
            const meal = plannedMeals.find((m) => m.day_of_week === index);
            const isExpanded = expandedDay === index;
            const prevMeal = plannedMeals.find((m) => m.day_of_week === index - 1);
            const nextMeal = plannedMeals.find((m) => m.day_of_week === index + 1);

            return (
              <View key={index} style={styles.dayRow}>
                <Text style={styles.dayLabel}>{short}</Text>

                <TouchableOpacity
                  style={[styles.mealCard, isExpanded && styles.mealCardExpanded, !meal && styles.mealCardEmpty]}
                  activeOpacity={meal ? 0.7 : 1}
                  onPress={() => {
                    if (!meal) return;
                    setExpandedDay(isExpanded ? null : index);
                  }}
                >
                  {meal ? (
                    <>
                      <View style={styles.badgeRow}>
                        {meal.is_fish && <Text style={styles.fishBadge}>Buy fresh</Text>}
                        {meal.needs_recipe && <Text style={styles.recipeBadge}>Recipe</Text>}
                      </View>
                      <Text style={styles.mealName}>{meal.meal_name}</Text>
                      <Text style={styles.mealMeta}>
                        {meal.estimated_prep_minutes ? `~${meal.estimated_prep_minutes} min` : ''}
                        {!isExpanded ? '  ·  Tap for how to cook' : ''}
                      </Text>
                      {isExpanded && meal.description ? (
                        <Text style={styles.description}>{meal.description}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.nightOff}>Night off</Text>
                  )}
                </TouchableOpacity>

                {/* Reorder arrows */}
                {meal && (
                  <View style={styles.arrowCol}>
                    <TouchableOpacity
                      style={[styles.arrowBtn, !prevMeal && styles.arrowBtnDisabled]}
                      onPress={() => prevMeal && swapDays(index, index - 1)}
                      disabled={!prevMeal}
                    >
                      <Text style={styles.arrowText}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.arrowBtn, !nextMeal && styles.arrowBtnDisabled]}
                      onPress={() => nextMeal && swapDays(index, index + 1)}
                      disabled={!nextMeal}
                    >
                      <Text style={styles.arrowText}>▼</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.replanButton}
            onPress={() => router.push('/planning')}
          >
            <Text style={styles.replanButtonText}>Replan the week</Text>
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
    marginBottom: 10,
    gap: 12,
  },
  dayLabel: {
    width: 36,
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    paddingTop: 14,
  },

  mealCard: {
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
  mealCardExpanded: {
    borderColor: '#3B7A57',
    borderWidth: 1.5,
    shadowOpacity: 0.08,
    elevation: 2,
  },
  mealCardEmpty: {
    backgroundColor: '#F9FAFB',
  },

  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  fishBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B7A57',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  recipeBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },

  mealName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  mealMeta: { fontSize: 12, color: '#9CA3AF' },

  description: {
    marginTop: 12,
    fontSize: 15,
    color: '#374151',
    lineHeight: 23,
  },

  nightOff: { fontSize: 14, color: '#D1D5DB', fontStyle: 'italic' },

  arrowCol: { justifyContent: 'center', gap: 4 },
  arrowBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  arrowBtnDisabled: { opacity: 0.25 },
  arrowText: { fontSize: 10, color: '#6B7280' },

  replanButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  replanButtonText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
});
