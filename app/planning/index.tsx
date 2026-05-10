// Weekly planning flow — modal presented from the plan tab or Today screen.
// Steps: fridge confirmation → garden → spontaneous additions → week ahead → generate plan.

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { generateMealPlan } from '../../lib/claude';
import { saveMealPlan, saveShoppingList, addGardenPlant, loadMealPlanForWeek, fetchWeekCookedMeals, upsertInventoryItem, depleteInventoryItems } from '../../lib/data';
import { getPlantsDueForHarvest } from '../../constants/gardenCalendar';

type Step = 'week_picker' | 'fridge' | 'garden' | 'spontaneous' | 'week_ahead' | 'carry_forward' | 'generating' | 'done' | 'error';

export default function PlanningFlow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { weekOffset: weekOffsetParam, pinnedIds: pinnedIdsParam } = useLocalSearchParams<{ weekOffset?: string; pinnedIds?: string }>();
  // IDs of meals the user pinned on the plan tab — these days are locked from regeneration
  const pinnedIds: string[] = pinnedIdsParam ? pinnedIdsParam.split(',').filter(Boolean) : [];
  const { inventoryItems, gardenPlants, setMealPlan, setShoppingList, setGardenPlants, addGardenPlantsToStore, userId, userPreferences, recipes, plannedMeals, upsertInventoryItem: upsertInventoryInStore } = useAppStore();
  const fridgeItems = inventoryItems.filter(
    (i) => i.location === 'fridge' && !i.depleted && (i.quantity == null || i.quantity > 0)
  );

  // Items that are always assumed on hand — don't send to Claude as "plan around" items.
  // Uses the DB is_staple flag first; falls back to a name regex for items added before
  // the flag existed or items not yet manually classified.
  const FRIDGE_STAPLE_RE = /^(butter|eggs?|milk|cream|crème fraîche|creme fraiche|greek yogh?urt|parmesan|cheddar|mozzarella|feta|ricotta|halloumi|standard cheese|olive oil|vegetable oil|canola oil|coconut oil|soy sauce|fish sauce|oyster sauce|miso|dijon|mustard|mayonnaise|mayo|ketchup|tomato paste|tomato pur[eé]e|worcestershire|hot sauce|sriracha|capers|anchovies|stock|chicken stock|beef stock|vegetable stock|broth)$/i;
  const isStaple = (item: { name: string; is_staple?: boolean }) =>
    item.is_staple === true || FRIDGE_STAPLE_RE.test(item.name.toLowerCase().trim());

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

  // Belt-and-suspenders: Expo Router may resolve params after the first render,
  // so the useState initializer can see weekOffsetParam as undefined even when a
  // param was passed. This effect corrects the state as soon as params arrive.
  useEffect(() => {
    if (weekOffsetParam === '0') {
      setTargetWeekOffset(0);
      setStep((s) => s === 'week_picker' ? 'fridge' : s);
    } else if (weekOffsetParam === '1') {
      setTargetWeekOffset(1);
      setStep((s) => s === 'week_picker' ? 'fridge' : s);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffsetParam]);

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
  // IDs of fridge items the user taps to mark as already used up
  const [goneFridgeIds, setGoneFridgeIds] = useState<Set<string>>(new Set());
  const toggleGoneFridge = (id: string) =>
    setGoneFridgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const [gardenHarvesting, setGardenHarvesting] = useState<string[]>([]);
  const plantsDue = getPlantsDueForHarvest(gardenPlants);

  const [gardenExtras, setGardenExtras] = useState('');

  const [spontaneous, setSpontaneous] = useState('');
  const [nightsAway, setNightsAway] = useState<number[]>([]);
  const [hollyHomeNights, setHollyHomeNights] = useState<number[]>([]);
  const [carryForwardIds, setCarryForwardIds] = useState<string[]>([]);
  const [cookedThisWeekIds, setCookedThisWeekIds] = useState<Set<string>>(new Set());

  // Load this week's cooked meals so already-cooked planned meals are hidden from carry-forward
  useEffect(() => {
    if (!userId || plannedMeals.length === 0) return;
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStart = [mon.getFullYear(), String(mon.getMonth() + 1).padStart(2, '0'), String(mon.getDate()).padStart(2, '0')].join('-');
    fetchWeekCookedMeals(userId, weekStart)
      .then((cooked) => {
        const ids = new Set(cooked.map((c) => c.planned_meal_id).filter(Boolean) as string[]);
        setCookedThisWeekIds(ids);
      })
      .catch(() => {});
  }, [userId, plannedMeals.length]);

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
    // Items the user hasn't crossed off on the fridge step
    const activeFridgeItems = fridgeItems.filter((i) => !goneFridgeIds.has(i.id));
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

      // ── Compute target week dates and locked days BEFORE generating ──────────
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
      // Also lock any days the user explicitly pinned on the plan tab.
      // Claude skips these days (via nightsAway) and saveMealPlan preserves their
      // planned_meal rows, keeping cooked_meals.planned_meal_id FK links intact.
      let lockedDays: number[] = [];
      let previousMealNames: string[] = [];
      let pinnedMealsList: Array<{ name: string; day_of_week: number }> = [];
      if (userId) {
        // Calculate previous week's start date (one week before target week)
        const prevMonday = new Date(monday);
        prevMonday.setDate(prevMonday.getDate() - 7);
        const prevWeekStartDate = localDate(prevMonday);

        const [existingPlan, cookedList, prevPlan] = await Promise.all([
          loadMealPlanForWeek(userId, weekStartDate),
          fetchWeekCookedMeals(userId, weekStartDate),
          loadMealPlanForWeek(userId, prevWeekStartDate),
        ]);
        // Cooked-day locks — also add to pinnedMealsList so Claude knows what's on
        // those days (for pasta uniqueness, protein rotation, and variety rules),
        // and add their names to previousMealNames so Rule 23 blocks the same base dish.
        if (existingPlan && cookedList.length > 0) {
          const cookedMeals = existingPlan.meals.filter((m) =>
            cookedList.some(
              (c) =>
                c.planned_meal_id === m.id ||
                (c.actual_meal_name?.toLowerCase() ?? '') === m.meal_name.toLowerCase()
            )
          );
          lockedDays = cookedMeals.map((m) => m.day_of_week);
          pinnedMealsList = [
            ...pinnedMealsList,
            ...cookedMeals.map((m) => ({ name: m.meal_name, day_of_week: m.day_of_week })),
          ];
          previousMealNames = [
            ...previousMealNames,
            ...cookedMeals.map((m) => m.meal_name),
          ];
        }
        // Pinned-meal locks — days the user explicitly wants to keep
        if (pinnedIds.length > 0 && existingPlan) {
          const pinnedMealsInPlan = existingPlan.meals.filter((m) => pinnedIds.includes(m.id));
          const pinnedDays = pinnedMealsInPlan.map((m) => m.day_of_week);
          lockedDays = [...new Set([...lockedDays, ...pinnedDays])];
          pinnedMealsList = pinnedMealsInPlan.map((m) => ({
            name: m.meal_name,
            day_of_week: m.day_of_week,
          }));
        }
        // Previous week's meals — pass to Claude to avoid repetition
        if (prevPlan) {
          previousMealNames = prevPlan.meals.map((m) => m.meal_name);
        }
      }
      const effectiveNightsAway = [...new Set([...nightsAway, ...lockedDays])];

      const freezerItems = inventoryItems.filter((i) => i.location === 'freezer' && !i.depleted);

      // Claude only sees items worth planning meals around — not background staples.
      // Fridge and freezer are sent separately so the prompt can apply different urgency rules.
      const claudeFridgeItems = activeFridgeItems.filter((i) => !isStaple(i));
      const claudeFreezerItems = freezerItems.filter((i) => !isStaple(i));

      const rawResult = await generateMealPlan({
        fridgeItems: claudeFridgeItems,
        freezerItems: claudeFreezerItems.length > 0 ? claudeFreezerItems : undefined,
        gardenAvailable: [
          ...gardenHarvesting,
          ...gardenExtras.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        ],
        spontaneousAdditions: spontaneous
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        nightsAway: effectiveNightsAway,
        hollyHomeNights,
        carryForwardMeals,
        repeatMeals: repeatMeals.length > 0 ? repeatMeals : undefined,
        previousMeals: previousMealNames.length > 0 ? previousMealNames : undefined,
        pinnedMeals: pinnedMealsList.length > 0 ? pinnedMealsList : undefined,
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
        ...gardenExtras.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
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

      // Save garden extras to garden_plants if not already tracked
      const extraNames = gardenExtras.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
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
              variety: null,
              location_note: null,
              is_cut_and_come_again: false,
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

      // Build known-items lists so saveShoppingList can fix any missed from_fridge /
      // is_pantry_staple flags from Claude.
      // Split on commas only — user enters as a comma-separated list
      const parseList = (text: string) =>
        text.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length > 1);

      const pantryItems = inventoryItems.filter((i) => i.location === 'pantry' && !i.depleted);
      const knownItems = {
        fridge: [
          ...activeFridgeItems.map((i) => i.name),   // all fridge items (incl. staples)
          ...freezerItems.map((i) => i.name),          // all freezer items
          ...parseList(fridgeExtras),
          ...parseList(spontaneous),
        ],
        pantry: pantryItems.map((i) => i.name),
      };
      const shoppingData = await saveShoppingList(userId!, plan.id, weekStartDate, result, knownItems);
      setShoppingList(shoppingData.list, shoppingData.items);

      // Save fridge extras and spontaneous additions to inventory so they
      // appear in future planning sessions and pantry views.
      const extraFridgeNames = [
        ...parseList(fridgeExtras),
        ...parseList(spontaneous),
      ];
      const existingFridgeNames = new Set(
        inventoryItems
          .filter((i) => i.location === 'fridge' && !i.depleted)
          .map((i) => i.name.toLowerCase())
      );
      await Promise.all(
        extraFridgeNames
          .filter((name) => !existingFridgeNames.has(name.toLowerCase()))
          .map(async (name) => {
            const saved = await upsertInventoryItem({
              user_id: userId!,
              name,
              category: 'produce',
              location: 'fridge',
              quantity: 1,
              unit: 'item',
              min_quantity: 0,
              notes: 'Added during meal planning',
              added_date: todayStr,
              depleted: false,
            });
            upsertInventoryInStore(saved);
          })
      );

      // Mark crossed-off fridge items as depleted in inventory so they
      // don't reappear in the next planning session's fridge list.
      if (goneFridgeIds.size > 0) {
        await depleteInventoryItems([...goneFridgeIds]);
        fridgeItems
          .filter((i) => goneFridgeIds.has(i.id))
          .forEach((i) => upsertInventoryInStore({ ...i, depleted: true }));
      }

      setStep('done');
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e?.message ?? 'Something went wrong. Please try again.');
      setStep('error');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plan the week</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

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
              Tap anything you've already used up:
            </Text>
            <View style={styles.fridgeSummary}>
              {fridgeItems.length === 0 ? (
                <Text style={styles.mutedText}>Nothing on record yet.</Text>
              ) : (
                <>
                  {fridgeItems.filter((i) => !isStaple(i)).map((item) => {
                    const gone = goneFridgeIds.has(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.fridgeItemRow}
                        onPress={() => toggleGoneFridge(item.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.fridgeItemTick, gone && styles.fridgeItemTickGone]}>
                          {gone ? '✗' : '✓'}
                        </Text>
                        <Text style={[styles.fridgeItem, gone && styles.fridgeItemGone]}>
                          {item.quantity} {item.unit} {item.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {fridgeItems.some((i) => isStaple(i)) && (
                    <Text style={styles.fridgeStapleNote}>
                      Staples (butter, eggs, cream etc.) are assumed on hand and won't affect meal choices.
                    </Text>
                  )}
                </>
              )}
            </View>
            <Text style={styles.question}>Anything extra I don't know about?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. crème fraîche, bacon, parmesan (comma separated)"
              value={fridgeExtras}
              onChangeText={setFridgeExtras}
              multiline
            />
            <TouchableOpacity style={styles.primaryButton} onPress={() => { setFridgeConfirmed(true); setStep('garden'); }}>
              <Text style={styles.primaryButtonText}>
                {goneFridgeIds.size > 0 ? `Done (${goneFridgeIds.size} removed) →` : 'Looks right →'}
              </Text>
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
              placeholder="e.g. salmon fillet, feijoas (comma separated)"
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
              <TouchableOpacity onPress={() => {
                const uncooked = plannedMeals.filter((m) => !cookedThisWeekIds.has(m.id)).map((m) => m.id);
                setCarryForwardIds(carryForwardIds.length === uncooked.length ? [] : uncooked);
              }}>
                <Text style={styles.carryForwardToggleAll}>
                  {carryForwardIds.length === plannedMeals.filter((m) => !cookedThisWeekIds.has(m.id)).length && carryForwardIds.length > 0 ? 'Clear' : 'Select all'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.stepBody}>Meals from this week you didn't get to — tap any to include in next week's plan.</Text>
            {plannedMeals.filter((m) => !cookedThisWeekIds.has(m.id)).map((meal) => {
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
            {plannedMeals.every((m) => cookedThisWeekIds.has(m.id)) && (
              <Text style={styles.mutedText}>You cooked everything this week! Nothing to carry forward.</Text>
            )}
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
            <TouchableOpacity
              style={[styles.primaryButton, styles.centeredButton]}
              onPress={() => router.replace({
                pathname: '/(tabs)/plan',
                params: { showWeek: String(targetWeekOffset) },
              })}
            >
              <Text style={styles.primaryButtonText}>See the plan →</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8', flexShrink: 1 },
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
    gap: 2,
  },
  fridgeItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 10 },
  fridgeItemTick: { fontSize: 14, color: '#3B7A57', fontWeight: '700', width: 16 },
  fridgeItemTickGone: { color: '#EF4444' },
  fridgeItem: { fontSize: 15, color: '#374151', lineHeight: 22, flex: 1 },
  fridgeItemGone: { color: '#D1D5DB', textDecorationLine: 'line-through' },
  fridgeStapleNote: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 8, lineHeight: 16 },

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
