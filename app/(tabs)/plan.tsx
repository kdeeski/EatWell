// This Week screen — tap a meal to select it, then use ▲▼ to move it.

import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { reorderPlannedMeals, loadCurrentMealPlan } from '../../lib/data';
import type { PlannedMeal } from '../../types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PlanScreen() {
  const router = useRouter();
  const { plannedMeals, currentMealPlan, setMealPlan, userId } = useAppStore();
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [displayOrder, setDisplayOrder] = useState<number[]>(() =>
    Array.from({ length: 7 }, (_, i) => i)
  );

  const mealsRef = useRef(plannedMeals);
  mealsRef.current = plannedMeals;
  const planRef = useRef(currentMealPlan);
  planRef.current = currentMealPlan;
  const displayOrderRef = useRef(displayOrder);
  displayOrderRef.current = displayOrder;

  useEffect(() => {
    if (currentMealPlan || !userId) return;
    loadCurrentMealPlan(userId)
      .then((data) => { if (data) setMealPlan(data.plan, data.meals); })
      .catch((e) => setLoadError(e?.message ?? String(e)));
  }, [userId]);

  const moveSelected = (direction: -1 | 1) => {
    if (selectedSlot === null) return;
    const toIndex = selectedSlot + direction;
    if (toIndex < 0 || toIndex >= displayOrderRef.current.length) return;

    const next = [...displayOrderRef.current];
    const tmp = next[selectedSlot];
    next[selectedSlot] = next[toIndex];
    next[toIndex] = tmp;

    LayoutAnimation.configureNext({ duration: 150, update: { type: LayoutAnimation.Types.easeInEaseOut } });
    setDisplayOrder(next);
    setSelectedSlot(toIndex);
    setDirty(true);
  };

  const handleDone = async () => {
    setSelectedSlot(null);
    if (!dirty || !planRef.current) { setDirty(false); return; }

    // Visible meals only (one per slot) — extras stay untouched
    const visibleOriginalIds = displayOrderRef.current
      .map((d) => mealsRef.current.find((m) => m.day_of_week === d))
      .filter(Boolean)
      .map((m) => m!.id);

    const reordered = displayOrderRef.current
      .map((originalDay, newPosition) => {
        const meal = mealsRef.current.find((m) => m.day_of_week === originalDay);
        return meal ? { ...meal, day_of_week: newPosition as PlannedMeal['day_of_week'] } : null;
      })
      .filter(Boolean) as PlannedMeal[];

    if (reordered.length === 0) { setDirty(false); return; }

    const snapshot = mealsRef.current.slice();
    setSaving(true);
    try {
      const saved = await reorderPlannedMeals(planRef.current.id, visibleOriginalIds, reordered);
      setMealPlan(planRef.current, saved);
    } catch (e) {
      console.error('Failed to save meal order', e);
      setMealPlan(planRef.current, snapshot);
      // Revert display order to match rolled-back store
      setDisplayOrder(Array.from({ length: 7 }, (_, i) => i));
    } finally {
      setSaving(false);
      setDirty(false);
    }
  };

  const hasPlan = plannedMeals.length > 0;
  const selectedMeal = selectedSlot !== null
    ? plannedMeals.find((m) => m.day_of_week === displayOrder[selectedSlot]) ?? null
    : null;
  const canMoveUp   = selectedSlot !== null && selectedSlot > 0 && !!selectedMeal;
  const canMoveDown = selectedSlot !== null && selectedSlot < displayOrder.length - 1 && !!selectedMeal;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>This Week</Text>

        {!hasPlan ? (
          <View style={styles.emptyState}>
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
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              {selectedMeal ? `"${selectedMeal.meal_name}" selected` : 'Tap a meal to move it'}
            </Text>

            {displayOrder.map((dayIndex, listIndex) => {
              const meal       = plannedMeals.find((m) => m.day_of_week === dayIndex);
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

                  <View style={[
                    styles.mealCard,
                    isSelected && styles.mealCardSelected,
                    !meal && styles.mealCardEmpty,
                  ]}>
                    {meal ? (
                      <>
                        <View style={styles.badgeRow}>
                          {meal.is_fish      && <Text style={styles.fishBadge}>Buy Fresh</Text>}
                          {meal.needs_recipe && <Text style={styles.recipeBadge}>Recipe</Text>}
                        </View>
                        <Text style={styles.mealName}>{meal.meal_name}</Text>
                        <Text style={styles.mealMeta}>
                          {meal.estimated_prep_minutes ? `~${meal.estimated_prep_minutes} min` : ''}
                          {!isSelected ? '  ·  Tap for details' : ''}
                        </Text>
                        {isSelected && meal.description ? (
                          <Text style={styles.description}>{meal.description}</Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.nightOff}>Night off</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.replanButton} onPress={() => router.push('/planning')}>
              <Text style={styles.replanButtonText}>Replan the Week</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Move toolbar — only visible when a meal is selected */}
      {selectedMeal && (
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
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content:   { padding: 20, paddingTop: 60, paddingBottom: 20 },
  heading:   { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  hint:      { fontSize: 12, color: '#9CA3AF', marginBottom: 20 },

  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 },
  emptyBody:  { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  errorText:  { fontSize: 12, color: '#EF4444', textAlign: 'center', marginBottom: 16, paddingHorizontal: 12 },
  planButton:     { backgroundColor: '#3B7A57', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  planButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  dayRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  dayLabel: { width: 36, fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  dayLabelSelected: { color: '#3B7A57' },

  mealCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  mealCardSelected: { borderColor: '#3B7A57', borderWidth: 2, elevation: 3 },
  mealCardEmpty:    { backgroundColor: '#F9FAFB', shadowOpacity: 0 },

  badgeRow:    { flexDirection: 'row', gap: 6, marginBottom: 4 },
  fishBadge:   {
    fontSize: 11, fontWeight: '600', color: '#3B7A57', backgroundColor: '#D1FAE5',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },
  recipeBadge: {
    fontSize: 11, fontWeight: '600', color: '#92400E', backgroundColor: '#FEF3C7',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start',
  },

  mealName:    { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginBottom: 2 },
  mealMeta:    { fontSize: 12, color: '#9CA3AF' },
  description: { fontSize: 14, color: '#374151', lineHeight: 21, marginTop: 8 },
  nightOff:    { fontSize: 14, color: '#D1D5DB', fontStyle: 'italic' },

  toolbar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
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
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  moveArrowBtnDisabled: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  moveArrowIcon: { fontSize: 14, color: '#3B7A57', fontWeight: '700' },
  moveArrowLabel: { fontSize: 14, fontWeight: '600', color: '#3B7A57' },
  moveArrowIconDisabled: { color: '#D1D5DB' },
  toolbarDoneBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  toolbarDoneText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  replanButton:     { marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  replanButtonText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
});
