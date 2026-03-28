// This Week screen — shows the 7-meal plan with drag-to-reorder.

import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, PanResponder, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { updateMealDayOfWeek } from '../../lib/data';
import type { PlannedMeal } from '../../types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CARD_HEIGHT = 96; // approximate card height + margin

export default function PlanScreen() {
  const router = useRouter();
  const { plannedMeals, currentMealPlan, setMealPlan } = useAppStore();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  // Build ordered list of days (sorted by day_of_week)
  const sortedMeals = [...plannedMeals].sort((a, b) => a.day_of_week - b.day_of_week);

  // Local ordering state — array of day indices in display order
  const [displayOrder, setDisplayOrder] = useState<number[]>(() =>
    DAY_SHORT.map((_, i) => i)
  );

  // Drag state
  const draggingIndex = useRef<number | null>(null);
  const dragAnim = useRef(new Animated.Value(0)).current;
  const currentOrder = useRef(displayOrder);
  currentOrder.current = displayOrder;

  const makePanResponder = useCallback((listIndex: number) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        draggingIndex.current = listIndex;
        dragAnim.setValue(0);
        setExpandedDay(null);
      },
      onPanResponderMove: (_, { dy }) => {
        dragAnim.setValue(dy);
        const rawTarget = listIndex + dy / CARD_HEIGHT;
        const target = Math.max(0, Math.min(6, Math.round(rawTarget)));
        if (target !== draggingIndex.current) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          const newOrder = [...currentOrder.current];
          const [moved] = newOrder.splice(draggingIndex.current!, 1);
          newOrder.splice(target, 0, moved);
          draggingIndex.current = target;
          setDisplayOrder(newOrder);
        }
      },
      onPanResponderRelease: async () => {
        Animated.spring(dragAnim, { toValue: 0, useNativeDriver: true }).start();
        draggingIndex.current = null;
        // Save new day assignments to DB
        if (!currentMealPlan) return;
        const finalOrder = currentOrder.current;
        const updates = finalOrder.map((originalDay, newPosition) => {
          const meal = plannedMeals.find((m) => m.day_of_week === originalDay);
          return meal ? { meal, newDay: newPosition } : null;
        }).filter(Boolean) as { meal: PlannedMeal; newDay: number }[];

        // Optimistic update
        setMealPlan(currentMealPlan, updates.map(({ meal, newDay }) => ({
          ...meal,
          day_of_week: newDay as PlannedMeal['day_of_week'],
        })));

        // Persist to DB
        try {
          await Promise.all(updates.map(({ meal, newDay }) =>
            updateMealDayOfWeek(meal.id, newDay)
          ));
        } catch (e) {
          console.error('Failed to save meal order', e);
        }
      },
    });
  }, [plannedMeals, currentMealPlan]);

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
          <TouchableOpacity style={styles.planButton} onPress={() => router.push('/planning')}>
            <Text style={styles.planButtonText}>Plan this week</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.dragHint}>Hold ≡ and drag to reorder</Text>
          {displayOrder.map((dayIndex, listIndex) => {
            const meal = plannedMeals.find((m) => m.day_of_week === dayIndex);
            const isExpanded = expandedDay === dayIndex;
            const isDragging = draggingIndex.current === listIndex;
            const panResponder = makePanResponder(listIndex);

            return (
              <View key={dayIndex} style={styles.dayRow}>
                <Text style={styles.dayLabel}>{DAY_SHORT[dayIndex]}</Text>

                <TouchableOpacity
                  style={[styles.mealCard, isExpanded && styles.mealCardExpanded, !meal && styles.mealCardEmpty]}
                  activeOpacity={meal ? 0.7 : 1}
                  onPress={() => meal && setExpandedDay(isExpanded ? null : dayIndex)}
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

                {meal && (
                  <Animated.View
                    style={[styles.dragHandle, isDragging && { transform: [{ translateY: dragAnim }] }]}
                    {...panResponder.panHandlers}
                  >
                    <Text style={styles.dragIcon}>≡</Text>
                  </Animated.View>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={styles.replanButton} onPress={() => router.push('/planning')}>
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
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  dragHint: { fontSize: 12, color: '#9CA3AF', marginBottom: 20 },

  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 },
  emptyBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  planButton: { backgroundColor: '#3B7A57', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  planButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  dayRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  dayLabel: { width: 36, fontSize: 13, fontWeight: '600', color: '#9CA3AF', paddingTop: 14 },

  mealCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  mealCardExpanded: { borderColor: '#3B7A57', borderWidth: 1.5, shadowOpacity: 0.08, elevation: 2 },
  mealCardEmpty: { backgroundColor: '#F9FAFB' },

  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  fishBadge: {
    fontSize: 11, fontWeight: '600', color: '#3B7A57', backgroundColor: '#D1FAE5',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },
  recipeBadge: {
    fontSize: 11, fontWeight: '600', color: '#92400E', backgroundColor: '#FEF3C7',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },

  mealName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  mealMeta: { fontSize: 12, color: '#9CA3AF' },
  description: { marginTop: 12, fontSize: 15, color: '#374151', lineHeight: 23 },
  nightOff: { fontSize: 14, color: '#D1D5DB', fontStyle: 'italic' },

  dragHandle: {
    width: 32, paddingTop: 12, alignItems: 'center', justifyContent: 'flex-start',
  },
  dragIcon: { fontSize: 20, color: '#D1D5DB', lineHeight: 28 },

  replanButton: {
    marginTop: 16, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center',
  },
  replanButtonText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
});
