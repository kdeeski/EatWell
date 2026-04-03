// Weekly planning flow — modal presented from the plan tab or Today screen.
// Steps: fridge confirmation → garden → spontaneous additions → week ahead → generate plan.

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { generateMealPlan } from '../../lib/claude';
import { saveMealPlan, saveShoppingList, addGardenPlant } from '../../lib/data';
import { getPlantsDueForHarvest } from '../../constants/gardenCalendar';

type Step = 'fridge' | 'garden' | 'spontaneous' | 'week_ahead' | 'generating' | 'done' | 'error';

export default function PlanningFlow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inventoryItems, gardenPlants, setMealPlan, setShoppingList, setGardenPlants, addGardenPlantsToStore, userId, userPreferences } = useAppStore();
  const fridgeItems = inventoryItems.filter((i) => i.location === 'fridge' && !i.depleted);

  const [step, setStep] = useState<Step>('fridge');
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
        nightsAway,
        hollyHomeNights,
        preferences: userPreferences ? {
          cuisine_likes: userPreferences.cuisine_likes,
          cuisine_dislikes: userPreferences.cuisine_dislikes,
          proteins_excluded: userPreferences.proteins_excluded,
          spice_level: userPreferences.spice_level,
          weeknight_max_minutes: userPreferences.weeknight_max_minutes,
          weekend_cooking: userPreferences.weekend_cooking,
          holly_joins_regularly: userPreferences.holly_joins_regularly,
          cooking_notes: userPreferences.cooking_notes,
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
          // Safety net: remove meals on nights-away days
          .filter((m) => !nightsAway.includes(m.day_of_week))
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

      // Get Monday of the current week as the week start date
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const localDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const weekStartDate = localDate(monday);
      const todayStr = localDate(now);

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
      const { plan, meals } = await saveMealPlan(userId!, weekStartDate, result);
      setMealPlan(plan, meals);

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
            <TouchableOpacity style={styles.primaryButton} onPress={handleGenerate}>
              <Text style={styles.primaryButtonText}>Generate my meal plan</Text>
            </TouchableOpacity>
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
            <Text style={styles.doneBody}>Your week is planned. Check the shopping list — it's organised by store and timing.</Text>
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
});
