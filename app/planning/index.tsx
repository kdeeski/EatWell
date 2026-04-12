// Weekly planning flow — modal presented from the plan tab or Today screen.
// Steps: fridge confirmation → garden → spontaneous additions → week ahead → generate plan.

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { generateMealPlan } from '../../lib/claude';
import { saveMealPlan, saveShoppingList, addGardenPlant, loadMealPlanForWeek, fetchWeekCookedMeals } from '../../lib/data';
import { getPlantsDueForHarvest } from '../../constants/gardenCalendar';

type Step = 'week_picker' | 'fridge' | 'garden' | 'spontaneous' | 'week_ahead' | 'carry_forward' | 'generating' | 'done' | 'error';

export default function PlanningFlow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { weekOffset: weekOffsetParam } = useLocalSearchParams<{ weekOffset?: string }>();
  const { inventoryItems, gardenPlants, setMealPlan, setShoppingList, setGardenPlants, addGardenPlantsToStore, userId, userPreferences, recipes, plannedMeals } = useAppStore();
  const fridgeItems = inventoryItems.filter((i) => i.location === 'fridge' && !i.depleted);

  // If opened from the plan tab with an explicit weekOffset param, use it directly and skip
  // the week_picker step. Without a param, show the picker on Fri/Sat/Sun as before.
  const [targetWeekOffset, setTargetWeekOffset] = useState<0 | 1>(() => {
    if (weekOffsetParam === '0') return 0;
    if (weekOffsetParam === '1') return 1;
    const adjusted = (new Date().getDay() + 6) % 7;
    return adjusted === 6 ? 1 : 0; // Sunday defaults to next week
  });
  const [step, setStep] = useState<Step>(() => {
    if (weekOffsetParam !== undefined) return 'fridge'; // explicit target — skip picker
    // Show week picker on Friday, Saturday, or Sunday so the user can choose this or next week
    const adjusted = (new Date().getDay() + 6) % 7; // 0=Mon … 6=Sun
    return adjusted >= 4 ? 'week_picker' : 'fridge';
  });
  const [generatingMessage, setGeneratingMessage] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const GENERATING_MESSAGES = [
    "Looking at what's in your fridge...",
    "Thinking about the week ahead...",
    "Choosing interesting meals for you...",
    "Considering what's in season...",
    "Clustering ingredients to cut waste...",
    "Planning around your nights away...",
    "Putting together your shopping list...",
    "Almost there...",
  ];

  const generatingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step === 'generating') {
      setGeneratingMessage(0);
      generatingIntervalRef.current = setInterval(() => {
        setGeneratingMessage((prev) => Math.min(prev + 1, GENERATING_MESSAGES.length - 1));
      }, 4000);
    } else {
      if (generatingIntervalRef.current) {
        clearInterval(generatingIntervalRef.current);
        generatingIntervalRef.current = null;
      }
    }
    return () => {
      if (generatingIntervalRef.current) clearInterval(generatingIntervalRef.current);
    };
  }, [step]);
  const [fridgeConfirmed, setFridgeConfirmed] = useState(false);
  const [fridgeExtras, setFridgeExtras] = useState('');

  const [gardenHarvesting, setGardenHarvesting] = useState<string[]>([]);
  const plantsDue = getPlantsDueForHarvest(gardenPlants);

  const [gardenExtras, setGardenExtras] = useState('');

  const [spontaneous, setSpontaneous] = useState('');
  const [nightsAway, setNightsAway] = useState<number[]>([]);
  const [hollyHomeNights, setHollyHomeNights] = useState<number[]>([]);
  const [carryForwardIds, setCarryForwardIds] = useState<string[]>([]);

  const toggleCarryForward = (id: string) =>
    setCarryForwardIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleNightAway = (day: number) =>
    setNightsAway((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  const toggleHollyNight = (day: number) =>
    setHollyHomeNights((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  const toggleGardenHarvest = (name: string) =>
    setGardenHarvesting((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );

  const handleGenerate = async () => {
    setStep('generating');
    try {
      // ── Carry forward: meals selected from previous week ──────────────────
      const carryForwardMeals = carryForwardIds.length > 0
        ? plannedMeals
            .filter((m) => carryForwardIds.includes(m.id))
            .map((m) => ({ name: m.meal_name, description: m.description }))
        : undefined;

      // ── Meal rotation: pre-select high-rated repeats client-side ──────────
      const ratio = userPreferences?.rotation_repeat_ratio ?? 0;
      const minRated = userPreferences?.rotation_min_rated ?? 10;
      const ratedRecipes = recipes.filter((r) => r.rating !== null);
      const highRated = ratedRecipes.filter((r) => r.rating! >= 4);
      const availableNights = 7 - nightsAway.length;
      const repeatCount = Math.max(1, Math.round(availableNights * ratio));
      const repeatMeals =
        ratio > 0 && ratedRecipes.length >= minRated && highRated.length > 0
          ? [...highRated]
              .sort(() => Math.random() - 0.5)
              .slice(0, Math.min(repeatCount, highRated.length))
              .map((r) => ({ name: r.name, rating: r.rating!, description: r.description }))
          : [];

      const rawResult = await generateMealPlan({
        fridgeItems,
        gardenAvailable: [
          ...gardenHarvesting,
          ...gardenExtras.split(',').map((s) => s.trim()).filter(Boolean),
        ],
        spontaneousAdditions: spontaneous
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        nightsAway: effectiveNightsAway,
        hollyHomeNights,
        carryForwardMeals,
        repeatMeals: repeatMeals.length > 0 ? repeatMeals : undefined,
        preferences: userPreferences ? {
          cuisine_likes: userPreferences.cuisine_likes,
          cuisine_dislikes: userPreferences.cuisine_dislikes,
          proteins_excluded: userPreferences.proteins_excluded,
          spice_level: userPreferences.spice_level,
          weeknight_max_minutes: userPreferences.weeknight_max_minutes,
          weekend_cooking: userPreferences.weekend_cooking,
          holly_joins_regularly: userPreferences.holly_joins_regularly,
          cooking_notes: userPreferences.cooking_notes,
          standing_orders: userPreferences.standing_orders,
        } : null,
      });
      // Build confirmed garden list for validation
      const gardenNames = [
        ...gardenHarvesting,
        ...gardenExtras.split(',').map((s) => s.trim()).filter(Boolean),
      ].map((s) => s.toLowerCase());

      const result = {
        ...rawResult,
        meals: rawResult.meals
          // Safety net: remove meals on nights-away or locked (already-cooked) days
          .filter((m) => !effectiveNightsAway.includes(m.day_of_week))
          .map((m) => ({
            ...m,
            ingredients: m.ingredients.map((ing) => ({
              ...ing,
              // Only trust from_garden if the ingredient name matches something
              // the user actually confirmed as ready — prevents Claude marking
              // all herbs/spices as garden when they're dried pantry items.
              from_garden: ing.from_garden &&
                gardenNames.length > 0 &&
                gardenNames.some((g) =>
                  ing.name.toLowerCase().includes(g) || g.includes(ing.name.toLowerCase())
                ),
            })),
          })),
      };

      const now = new Date();
      const localDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      // Calculate target week's Monday using the chosen offset (0 = this week, 1 = next week)
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + targetWeekOffset * 7);
      const weekStartDate = localDate(monday);
      const todayStr = localDate(now);

      // Determine which days already have a cooked meal so they can be locked.
      // Claude skips these days (via nightsAway) and saveMealPlan preserves their
      // planned_meal rows, keeping cooked_meals.planned_meal_id FK links intact.
      let lockedDays: number[] = [];
      if (userId) {
        const [existingPlan, cookedList] = await Promise.all([
          loadMealPlanForWeek(userId, weekStartDate),
          fetchWeekCookedMeals(userId, weekStartDate),
        ]);
        if (existingPlan && cookedList.length > 0) {
          lockedDays = existingPlan.meals
            .filter((m) =>
              cookedList.some(
                (c) =>
                  c.planned_meal_id === m.id ||
                  c.actual_meal_name.toLowerCase() === m.meal_name.toLowerCase()
              )
            )
            .map((m) => m.day_of_week);
        }
      }
      const effectiveNightsAway = [...new Set([...nightsAway, ...lockedDays])];

      // Save garden extras to garden_plants if not already tracked
      const extraNames = gardenExtras.split(',').map((s) => s.trim()).filter(Boolean);
      const existingNames = gardenPlants.map((p) => p.plant_name.toLowerCase());
      const newPlants = await Promise.all(
        extraNames
          .filter((name) => !existingNames.includes(name.toLowerCase()))
          .map((name) =>
            addGardenPlant({
              user_id: userId!,
              plant_name: name,
              planted_date: todayStr,
              expected_ready_date: todayStr,
              status: 'ready',
              quantity_planted: null,
              notes: 'Added during meal planning',
            })
          )
      );
      if (newPlants.length > 0) {
        addGardenPlantsToStore(newPlants);
      }

      // Save to Supabase and update the app store
      const { plan, meals } = await saveMealPlan(userId!, weekStartDate, result, lockedDays);
      // Only update the plan tab store entry when targeting this week.
      // Targeting next week keeps this week's plan (and cooked locks) intact on the plan tab.
      if (targetWeekOffset === 0) {
        setMealPlan(plan, meals);
      }

      const shoppingData = await saveShoppingList(userId!, plan.id, weekStartDate, result);
      setShoppingList(shoppingData.list, shoppingData.items);

      setStep('done');
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e?.message ?? 'Something went wrong. Please try again.');
      setStep('error');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plan the week</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Step: Week picker — shown on Fri/Sat/Sun */}
        {step === 'week_picker' && (
          <View>
            <Text style={styles.stepTitle}>Which week are you planning?</Text>
            <Text style={styles.stepBody}>Choose the week you'd like to generate meals for.</Text>
            {([0, 1] as const).map((offset) => {
              const mon = new Date();
              mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + offset * 7);
              const sun = new Date(mon);
              sun.setDate(mon.getDate() + 6);
              const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const label = offset === 0 ? 'This week' : 'Next week';
              const range = `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
              const selected = targetWeekOffset === offset;
              return (
                <TouchableOpacity
                  key={offset}
                  style={[styles.tapOption, selected && styles.tapOptionSelected]}
                  onPress={() => setTargetWeekOffset(offset)}
                >
                  <Text style={[styles.tapOptionText, selected && styles.tapOptionTextSelected]}>{label}</Text>
                  <Text style={[styles.carryForwardDesc, selected && { color: '#065F46' }]}>{range}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('fridge')}>
              <Text style={styles.primaryButtonText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step: Fridge confirmation */}
        {step === 'fridge' && (
          <View>
            <Text style={styles.stepTitle}>What's in the fridge?</Text>
            <Text style={styles.stepBody}>
              Based on last week's shop and what you cooked, here's what I think you've still got:
            </Text>
            <View style={styles.fridgeSummary}>
              {fridgeItems.length === 0 ? (
                <Text style={styles.mutedText}>Nothing on record yet.</Text>
              ) : (
                fridgeItems.map((item) => (
                  <Text key={item.id} style={styles.fridgeItem}>
                    · {item.quantity} {item.unit} {item.name}
                  </Text>
                ))
              )}
            </View>
            <Text style={styles.question}>Does that sound right? Anything extra I don't know about?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. a beautiful piece of fish from the market, bag of feijoas..."
              value={fridgeExtras}
              onChangeText={setFridgeExtras}
              multiline
            />
            <TouchableOpacity style={styles.primaryButton} onPress={() => { setFridgeConfirmed(true); setStep('garden'); }}>
              <Text style={styles.primaryButtonText}>Looks right →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step: Garden */}
        {step === 'garden' && (
          <View>
            <Text style={styles.stepTitle}>What's in the garden?</Text>
            {plantsDue.length === 0 ? (
              <Text style={styles.stepBody}>Nothing looks ready to harvest this week.</Text>
            ) : (
              <>
                <Text style={styles.stepBody}>These look ready — harvesting any?</Text>
                {plantsDue.map((plant) => (
                  <TouchableOpacity
                    key={plant.plant_name}
                    style={[styles.tapOption, gardenHarvesting.includes(plant.plant_name) && styles.tapOptionSelected]}
                    onPress={() => toggleGardenHarvest(plant.plant_name)}
                  >
                    <Text style={[styles.tapOptionText, gardenHarvesting.includes(plant.plant_name) && styles.tapOptionTextSelected]}>
                      {plant.plant_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <TextInput
              style={styles.input}
              placeholder="Anything else ready that's not listed? e.g. basil, lemons, silverbeet..."
              value={gardenExtras}
              onChangeText={setGardenExtras}
              multiline
            />
            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('spontaneous')}>
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step: Spontaneous additions */}
        {step === 'spontaneous' && (
          <View>
            <Text style={styles.stepTitle}>Anything spontaneous?</Text>
            <Text style={styles.stepBody}>
              A beautiful piece of fish at the market? A bag of feijoas from a neighbour?
              Anything the app couldn't have predicted?
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Type or leave blank..."
              value={spontaneous}
              onChangeText={setSpontaneous}
              multiline
            />
            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('week_ahead')}>
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step: Week ahead */}
        {step === 'week_ahead' && (
          <View>
            <Text style={styles.stepTitle}>The week ahead</Text>
            <Text style={styles.stepBody}>Any nights you won't be home?</Text>
            <View style={styles.dayGrid}>
              {DAY_LABELS.map((label, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.dayChip, nightsAway.includes(index) && styles.dayChipSelected]}
                  onPress={() => toggleNightAway(index)}
                >
                  <Text style={[styles.dayChipText, nightsAway.includes(index) && styles.dayChipTextSelected]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.stepBody}>Any nights Holly's joining you?</Text>
            <View style={styles.dayGrid}>
              {DAY_LABELS.map((label, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.dayChip, hollyHomeNights.includes(index) && styles.dayChipHolly]}
                  onPress={() => toggleHollyNight(index)}
                >
                  <Text style={[styles.dayChipText, hollyHomeNights.includes(index) && styles.dayChipTextHolly]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() =>
                targetWeekOffset === 1 && plannedMeals.length > 0
                  ? setStep('carry_forward')
                  : handleGenerate()
              }
            >
              <Text style={styles.primaryButtonText}>
                {targetWeekOffset === 1 && plannedMeals.length > 0
                  ? 'Next →'
                  : 'Generate my meal plan'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step: Carry forward */}
        {step === 'carry_forward' && (
          <View>
            <View style={styles.carryForwardHeader}>
              <Text style={styles.stepTitle}>Anything to carry forward?</Text>
              <TouchableOpacity onPress={() =>
                carryForwardIds.length === plannedMeals.length
                  ? setCarryForwardIds([])
                  : setCarryForwardIds(plannedMeals.map((m) => m.id))
              }>
                <Text style={styles.carryForwardToggleAll}>
                  {carryForwardIds.length === plannedMeals.length ? 'Clear' : 'Select all'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.stepBody}>Meals from this week you didn't get to — tap any to include in next week's plan.</Text>
            {plannedMeals.map((meal) => {
              const selected = carryForwardIds.includes(meal.id);
              return (
                <TouchableOpacity
                  key={meal.id}
                  style={[styles.tapOption, selected && styles.tapOptionSelected]}
                  onPress={() => toggleCarryForward(meal.id)}
                >
                  <Text style={[styles.tapOptionText, selected && styles.tapOptionTextSelected]}>
                    {meal.meal_name}
                  </Text>
                  {meal.description ? (
                    <Text style={styles.carryForwardDesc} numberOfLines={2}>{meal.description}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
            <View style={styles.carryForwardButtons}>
              <TouchableOpacity style={styles.skipButton} onPress={() => { setCarryForwardIds([]); handleGenerate(); }}>
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, styles.carryForwardDone]} onPress={handleGenerate}>
                <Text style={styles.primaryButtonText}>
                  {carryForwardIds.length > 0 ? `Carry ${carryForwardIds.length} forward →` : 'Generate my meal plan'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Generating */}
        {step === 'generating' && (
          <View style={styles.centeredBlock}>
            <ActivityIndicator size="large" color="#3B7A57" />
            <Text style={styles.generatingText}>{GENERATING_MESSAGES[generatingMessage]}</Text>
            <Text style={styles.generatingSubtext}>This usually takes 20–40 seconds</Text>
          </View>
        )}

        {/* Error */}
        {step === 'error' && (
          <View style={styles.centeredBlock}>
            <Text style={styles.doneTitle}>Something went wrong</Text>
            <Text style={styles.doneBody}>{errorMessage}</Text>
            <TouchableOpacity style={[styles.primaryButton, styles.centeredButton]} onPress={() => setStep('week_ahead')}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Done */}
        {step === 'done' && (
          <View style={styles.centeredBlock}>
            <Text style={styles.doneTitle}>Plan ready</Text>
            <Text style={styles.doneBody}>
              {targetWeekOffset === 1
                ? "Next week's plan is ready. Check the shopping list — it's updated for next week."
                : "Your week is planned. Check the shopping list — it's organised by store and timing."}
            </Text>
            <TouchableOpacity style={[styles.primaryButton, styles.centeredButton]} onPress={() => router.replace('/(tabs)/plan')}>
              <Text style={styles.primaryButtonText}>See the plan →</Text>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cancel: { fontSize: 16, color: '#6B7280' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },

  content: { padding: 24, paddingTop: 28 },
  stepTitle: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 },
  stepBody: { fontSize: 15, color: '#6B7280', lineHeight: 22, marginBottom: 20 },
  question: { fontSize: 15, fontWeight: '500', color: '#374151', marginBottom: 10 },
  mutedText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },

  fridgeSummary: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  fridgeItem: { fontSize: 15, color: '#374151', lineHeight: 26 },

  input: {
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

  tapOption: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  tapOptionSelected: { borderColor: '#3B7A57', backgroundColor: '#D1FAE5' },
  tapOptionText: { fontSize: 15, color: '#374151' },
  tapOptionTextSelected: { color: '#065F46', fontWeight: '600' },

  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  dayChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  dayChipSelected: { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  dayChipHolly: { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' },
  dayChipText: { fontSize: 14, color: '#374151' },
  dayChipTextSelected: { color: '#B91C1C', fontWeight: '600' },
  dayChipTextHolly: { color: '#5B21B6', fontWeight: '600' },

  primaryButton: {
    backgroundColor: '#3B7A57',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  centeredBlock: { paddingTop: 60, gap: 20, alignItems: 'center' },
  generatingText: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  generatingSubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  doneTitle: { fontSize: 26, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },
  doneBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  centeredButton: { alignSelf: 'stretch' },

  carryForwardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  carryForwardToggleAll: { fontSize: 14, color: '#3B7A57', fontWeight: '600', paddingTop: 6 },
  carryForwardDesc: { fontSize: 13, color: '#9CA3AF', marginTop: 3, lineHeight: 18 },
  carryForwardButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  carryForwardDone: { flex: 1, marginTop: 0 },
  skipButton: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  skipButtonText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
});
