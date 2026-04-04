// Today screen — the home screen of EatWell.
// Shows tonight's chosen meal (or the pick-your-meal prompt),
// any morning check-in that needs completing, and quick fridge notes.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toTitleCase } from '../../lib/titleCase';
import { findStashMatch } from '../../lib/recipes';
import type { PlannedIngredient, Recipe } from '../../types';

function formatIngredients(ingredients: PlannedIngredient[]): string {
  return ingredients
    .map((i) => `${i.quantity} ${i.unit} ${toTitleCase(i.name)}`.trim())
    .join('\n');
}
import { useAppStore } from '../../store/useAppStore';
import CookingGuideModal from '../../components/recipes/CookingGuideModal';
import RecipeDetailModal from '../../components/recipes/RecipeDetailModal';
import type { PlannedMeal } from '../../types';

const RATING_LABELS = ['', 'Meh', 'Fine', 'Good', 'Great', 'Loved it'];
const RATING_EMOJI  = ['', '😐', '🙂', '👍', '😄', '🤩'];

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { plannedMeals, todayCheckin, recipes } = useAppStore();
  const [guideTarget, setGuideTarget] = useState<PlannedMeal | null>(null);
  const [stashRecipe, setStashRecipe] = useState<Recipe | null>(null);

  const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
  const tonightsMeal = plannedMeals.find((m) => m.day_of_week === todayIndex);

  const checkinDone = !!todayCheckin?.completed_at;
  const lastNight   = todayCheckin?.last_night_response ?? null;
  const tonightPicked = checkinDone
    ? plannedMeals.find((m) => m.id === todayCheckin?.tonight_planned_meal_id) ?? null
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
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
            <TouchableOpacity
              style={styles.howToButton}
              onPress={() => setGuideTarget(tonightsMeal)}
            >
              <Text style={styles.howToButtonText}>How to cook this →</Text>
            </TouchableOpacity>
            {(() => {
              const match = findStashMatch(tonightsMeal.meal_name, recipes);
              return match ? (
                <TouchableOpacity
                  style={styles.stashNudge}
                  onPress={() => setStashRecipe(match)}
                >
                  <Text style={styles.stashNudgeText}>📖 You have a recipe for this →</Text>
                </TouchableOpacity>
              ) : null;
            })()}
            {tonightsMeal.estimated_prep_minutes ? (
              <Text style={styles.mealMeta}>
                ~{tonightsMeal.estimated_prep_minutes} min
                {tonightsMeal.is_fish ? '  ·  Buy fresh today' : ''}
              </Text>
            ) : null}
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

      {stashRecipe && (
        <RecipeDetailModal
          recipe={stashRecipe}
          onClose={() => setStashRecipe(null)}
          onEdit={() => {}}
          onDelete={() => {}}
          onCookMode={() => {}}
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
});
