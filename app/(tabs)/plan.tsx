// This Week screen — shows the 7-meal plan with drag-to-reorder.

import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  PanResponder, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { reorderPlannedMeals } from '../../lib/data';
import type { PlannedMeal } from '../../types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CARD_HEIGHT = 106; // card height + margin

export default function PlanScreen() {
  const router = useRouter();
  const { plannedMeals, currentMealPlan, setMealPlan } = useAppStore();
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [displayOrder, setDisplayOrder] = useState<number[]>(() =>
    Array.from({ length: 7 }, (_, i) => i)
  );

  // Always-current refs for use inside PanResponder closures (avoid stale captures)
  const orderRef = useRef(displayOrder);
  orderRef.current = displayOrder;
  const mealsRef = useRef(plannedMeals);
  mealsRef.current = plannedMeals;
  const planRef = useRef(currentMealPlan);
  planRef.current = currentMealPlan;

  // Track drag state in refs (no re-renders during drag)
  const draggingFrom = useRef<number | null>(null);   // original slot index
  const draggingDay  = useRef<number | null>(null);   // dayIndex of dragged meal
  const didMove      = useRef(false);                 // true only if position changed

  // PanResponders created ONCE per slot — must not be recreated on render
  const panResponders = useRef<ReturnType<typeof PanResponder.create>[] | null>(null);
  if (!panResponders.current) {
    panResponders.current = Array.from({ length: 7 }, (_, slotIndex) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          draggingFrom.current = slotIndex;
          draggingDay.current  = orderRef.current[slotIndex];
          didMove.current      = false;
          setExpandedSlot(null);
          setIsDragging(true);
        },
        onPanResponderMove: (_, { dy }) => {
          if (draggingFrom.current === null || draggingDay.current === null) return;
          const rawTarget = draggingFrom.current + dy / CARD_HEIGHT;
          const target    = Math.max(0, Math.min(6, Math.round(rawTarget)));
          const currentPos = orderRef.current.indexOf(draggingDay.current);
          if (target !== currentPos) {
            didMove.current = true;
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            const next = [...orderRef.current];
            next.splice(currentPos, 1);
            next.splice(target, 0, draggingDay.current);
            orderRef.current = next;
            setDisplayOrder(next);
          }
        },
        onPanResponderRelease: async () => {
          const moved = didMove.current;
          draggingFrom.current = null;
          draggingDay.current  = null;
          didMove.current      = false;
          setIsDragging(false);

          // Only save if the order actually changed
          if (!moved || !planRef.current) return;

          const finalOrder = orderRef.current;
          const reordered = finalOrder
            .map((originalDay, newPosition) => {
              const meal = mealsRef.current.find((m) => m.day_of_week === originalDay);
              return meal ? { ...meal, day_of_week: newPosition as PlannedMeal['day_of_week'] } : null;
            })
            .filter(Boolean) as PlannedMeal[];

          if (reordered.length === 0) return;

          // Capture snapshot before optimistic update so rollback is accurate
          const snapshot = mealsRef.current.slice();

          // Optimistic store update
          setMealPlan(planRef.current, reordered);

          // Persist to DB
          try {
            await reorderPlannedMeals(planRef.current.id, reordered);
          } catch (e) {
            console.error('Failed to save meal order', e);
            // Rollback: restore pre-drag state
            setMealPlan(planRef.current, snapshot);
          }
        },
      })
    );
  }

  const hasPlan = plannedMeals.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} scrollEnabled={!isDragging}>
      <Text style={styles.heading}>This Week</Text>

      {!hasPlan ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No plan yet</Text>
          <Text style={styles.emptyBody}>
            Time to plan the week. The app will look at what's in your fridge,
            what's in the garden, and build 7 meals around it.
          </Text>
          <TouchableOpacity style={styles.planButton} onPress={() => router.push('/planning')}>
            <Text style={styles.planButtonText}>Plan This Week</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.dragHint}>Hold ≡ and drag to reorder</Text>

          {displayOrder.map((dayIndex, listIndex) => {
            const meal       = plannedMeals.find((m) => m.day_of_week === dayIndex);
            const isExpanded = expandedSlot === listIndex;
            const pr         = panResponders.current![listIndex];

            return (
              <View key={listIndex} style={styles.dayRow}>
                <Text style={styles.dayLabel}>{DAY_SHORT[listIndex]}</Text>

                <TouchableOpacity
                  style={[
                    styles.mealCard,
                    isExpanded && styles.mealCardExpanded,
                    !meal && styles.mealCardEmpty,
                  ]}
                  activeOpacity={meal ? 0.7 : 1}
                  onPress={() => meal && setExpandedSlot(isExpanded ? null : listIndex)}
                >
                  {meal ? (
                    <>
                      <View style={styles.badgeRow}>
                        {meal.is_fish      && <Text style={styles.fishBadge}>Buy Fresh</Text>}
                        {meal.needs_recipe && <Text style={styles.recipeBadge}>Recipe</Text>}
                      </View>
                      <Text style={styles.mealName}>{meal.meal_name}</Text>
                      <Text style={styles.mealMeta}>
                        {meal.estimated_prep_minutes ? `~${meal.estimated_prep_minutes} min` : ''}
                        {!isExpanded ? '  ·  Tap for How to Cook' : ''}
                      </Text>
                      {isExpanded && meal.description && (
                        <Text style={styles.description}>{meal.description}</Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.nightOff}>Night off</Text>
                  )}
                </TouchableOpacity>

                {meal && (
                  <View style={styles.dragHandle} {...pr.panHandlers}>
                    <Text style={styles.dragIcon}>≡</Text>
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={styles.replanButton} onPress={() => router.push('/planning')}>
            <Text style={styles.replanButtonText}>Replan the Week</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content:   { padding: 20, paddingTop: 60 },
  heading:   { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  dragHint:  { fontSize: 12, color: '#9CA3AF', marginBottom: 20 },

  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 },
  emptyBody:  { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  planButton:     { backgroundColor: '#3B7A57', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  planButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  dayRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  dayLabel: { width: 36, fontSize: 13, fontWeight: '600', color: '#9CA3AF', paddingTop: 14 },

  mealCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  mealCardExpanded: { borderColor: '#3B7A57', borderWidth: 1.5, shadowOpacity: 0.08, elevation: 2 },
  mealCardEmpty:    { backgroundColor: '#F9FAFB' },

  badgeRow:    { flexDirection: 'row', gap: 6, marginBottom: 4 },
  fishBadge:   {
    fontSize: 11, fontWeight: '600', color: '#3B7A57', backgroundColor: '#D1FAE5',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },
  recipeBadge: {
    fontSize: 11, fontWeight: '600', color: '#92400E', backgroundColor: '#FEF3C7',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },

  mealName:    { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  mealMeta:    { fontSize: 12, color: '#9CA3AF' },
  description: { marginTop: 12, fontSize: 15, color: '#374151', lineHeight: 23 },
  nightOff:    { fontSize: 14, color: '#D1D5DB', fontStyle: 'italic' },

  dragHandle: {
    width: 32, paddingTop: 12, alignItems: 'center', justifyContent: 'flex-start',
  },
  dragIcon: { fontSize: 20, color: '#D1D5DB', lineHeight: 28 },

  replanButton:     { marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  replanButtonText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
});
