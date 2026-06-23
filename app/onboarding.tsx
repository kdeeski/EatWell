import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../lib/alert';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { saveUserPreferences, saveHouseholdMember } from '../lib/data';
import type { SpiceLevel, WeekendCooking, DietaryStyle } from '../types';
import { colors } from '../constants/theme';

const CUISINES = [
  'Asian', 'Mediterranean', 'Middle Eastern', 'French', 'Italian',
  'Japanese', 'Thai', 'Mexican', 'Indian', 'Greek', 'Spanish', 'American',
];

const PROTEINS = [
  'Pork', 'Lamb', 'Beef', 'Chicken', 'Fish', 'Shellfish', 'Game',
];

const DIETARY_STYLES: { value: DietaryStyle; label: string; hint: string }[] = [
  { value: 'omnivore', label: 'Omnivore', hint: 'Everything' },
  { value: 'pescatarian', label: 'Pescatarian', hint: 'Fish but no meat' },
  { value: 'vegetarian', label: 'Vegetarian', hint: 'No meat or fish' },
  { value: 'vegan', label: 'Vegan', hint: 'No animal products' },
];

const STEPS = ['welcome', 'location', 'household', 'cuisines', 'dietary', 'cooking'] as const;
type Step = typeof STEPS[number];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId, setUserPreferences, addHouseholdMember: addMemberToStore } = useAppStore();

  const [step, setStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);

  // Settings state
  const [location, setLocation] = useState('Canterbury, New Zealand');
  const [memberName, setMemberName] = useState('');
  const [members, setMembers] = useState<{ name: string; dietary: string }[]>([]);
  const [memberDietary, setMemberDietary] = useState('');
  const [cuisineLikes, setCuisineLikes] = useState<string[]>([]);
  const [dietaryStyle, setDietaryStyle] = useState<DietaryStyle>('omnivore');
  const [proteinsExcluded, setProteinsExcluded] = useState<string[]>([]);
  const [spiceLevel, setSpiceLevel] = useState<SpiceLevel>('medium');
  const [weeknightMins, setWeeknightMins] = useState(45);
  const [weekendCooking, setWeekendCooking] = useState<WeekendCooking>('project');

  const stepIndex = STEPS.indexOf(step);
  const isLast = stepIndex === STEPS.length - 1;

  const next = () => {
    if (isLast) return handleFinish();
    setStep(STEPS[stepIndex + 1]);
  };

  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  const addMember = () => {
    if (!memberName.trim()) return;
    setMembers([...members, { name: memberName.trim(), dietary: memberDietary.trim() }]);
    setMemberName('');
    setMemberDietary('');
  };

  const removeMember = (i: number) => {
    setMembers(members.filter((_, idx) => idx !== i));
  };

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  const handleFinish = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      // Save preferences
      const saved = await saveUserPreferences(userId, {
        dietary_style: dietaryStyle,
        cuisine_likes: cuisineLikes,
        cuisine_dislikes: [],
        proteins_excluded: proteinsExcluded,
        spice_level: spiceLevel,
        weeknight_max_minutes: weeknightMins,
        weekend_cooking: weekendCooking,
        holly_joins_regularly: false,
        cooking_notes: null,
        standing_orders: null,
        rotation_repeat_ratio: 0,
        rotation_min_rated: 10,
        garden_location: location.trim() || 'Canterbury, New Zealand',
        wine_detail_level: 'simple',
        wine_guide_site: 'goodpairdays.com',
        recipe_search_site: 'recipetineats.com',
      });
      setUserPreferences(saved);

      // Save household members
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        const saved = await saveHouseholdMember({
          user_id: userId,
          name: m.name,
          frequency_hint: null,
          dietary_notes: m.dietary || null,
          sort_order: i,
        });
        addMemberToStore(saved);
      }

      router.replace('/planning');
    } catch (e: any) {
      console.error('Onboarding save failed:', e?.message);
      Alert.alert('Error', e?.message ?? 'Could not save preferences. You can set them up later in Settings.');
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.appName}>EatWell</Text>
            <Text style={styles.welcomeText}>
              Let's set up your kitchen so meal plans feel like yours from day one.
            </Text>
            <Text style={styles.welcomeSub}>Takes about a minute.</Text>
          </View>
        );

      case 'location':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Where are you based?</Text>
            <Text style={styles.stepDescription}>
              This helps with seasonal produce and local shopping.
            </Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Canterbury, New Zealand"
              placeholderTextColor={colors.text.placeholder}
            />
          </View>
        );

      case 'household':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Who eats with you?</Text>
            <Text style={styles.stepDescription}>
              Add anyone who regularly joins for dinner. You can always change this later.
            </Text>
            {members.map((m, i) => (
              <View key={i} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  {m.dietary ? <Text style={styles.memberDiet}>{m.dietary}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => removeMember(i)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TextInput
              style={styles.input}
              value={memberName}
              onChangeText={setMemberName}
              placeholder="Name"
              placeholderTextColor={colors.text.placeholder}
            />
            <TextInput
              style={styles.input}
              value={memberDietary}
              onChangeText={setMemberDietary}
              placeholder="Dietary notes (optional)"
              placeholderTextColor={colors.text.placeholder}
            />
            <TouchableOpacity style={styles.addMemberBtn} onPress={addMember}>
              <Text style={styles.addMemberText}>+ Add person</Text>
            </TouchableOpacity>
          </View>
        );

      case 'cuisines':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Cuisines you love</Text>
            <Text style={styles.stepDescription}>
              Pick as many as you like — these shape your weekly meal plans.
            </Text>
            <View style={styles.pillGrid}>
              {CUISINES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pill, cuisineLikes.includes(c) && styles.pillActive]}
                  onPress={() => toggleItem(cuisineLikes, setCuisineLikes, c)}
                >
                  <Text style={[styles.pillText, cuisineLikes.includes(c) && styles.pillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'dietary':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>How do you eat?</Text>
            <Text style={styles.stepDescription}>
              This shapes every meal plan we generate.
            </Text>
            <View style={styles.pillGrid}>
              {DIETARY_STYLES.map((ds) => (
                <TouchableOpacity
                  key={ds.value}
                  style={[styles.pill, dietaryStyle === ds.value && styles.pillActive]}
                  onPress={() => setDietaryStyle(ds.value)}
                >
                  <View>
                    <Text style={[styles.pillText, dietaryStyle === ds.value && styles.pillTextActive]}>{ds.label}</Text>
                    <Text style={[styles.pillHint, dietaryStyle === ds.value && styles.pillHintActive]}>{ds.hint}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {(dietaryStyle === 'omnivore' || dietaryStyle === 'pescatarian') && (
              <>
                <Text style={[styles.stepTitle, { marginTop: 28 }]}>Any proteins to avoid?</Text>
                <View style={styles.pillGrid}>
                  {PROTEINS.map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.pill, proteinsExcluded.includes(p) && styles.pillExcluded]}
                      onPress={() => toggleItem(proteinsExcluded, setProteinsExcluded, p)}
                    >
                      <Text style={[styles.pillText, proteinsExcluded.includes(p) && styles.pillExcludedText]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.stepTitle, { marginTop: 28 }]}>Spice level</Text>
            <View style={styles.pillGrid}>
              {(['mild', 'medium', 'bold'] as SpiceLevel[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.pill, spiceLevel === s && styles.pillActive]}
                  onPress={() => setSpiceLevel(s)}
                >
                  <Text style={[styles.pillText, spiceLevel === s && styles.pillTextActive]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'cooking':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Weeknight time limit</Text>
            <Text style={styles.stepDescription}>
              Max minutes for a weeknight dinner.
            </Text>
            <View style={styles.pillGrid}>
              {[30, 45, 60, 90].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.pill, weeknightMins === m && styles.pillActive]}
                  onPress={() => setWeeknightMins(m)}
                >
                  <Text style={[styles.pillText, weeknightMins === m && styles.pillTextActive]}>{m} min</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.stepTitle, { marginTop: 28 }]}>Weekend cooking</Text>
            <View style={styles.pillGrid}>
              {([
                { value: 'project' as WeekendCooking, label: 'Love a project' },
                { value: 'simple' as WeekendCooking, label: 'Keep it simple' },
              ]).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.pill, weekendCooking === opt.value && styles.pillActive]}
                  onPress={() => setWeekendCooking(opt.value)}
                >
                  <Text style={[styles.pillText, weekendCooking === opt.value && styles.pillTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        {/* Progress dots */}
        <View style={styles.dots}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i <= stepIndex && styles.dotActive]} />
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {renderStep()}
        </ScrollView>

        {/* Navigation */}
        <View style={styles.nav}>
          {stepIndex > 0 ? (
            <TouchableOpacity onPress={back} style={styles.backBtn}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity
            style={[styles.nextBtn, saving && { opacity: 0.6 }]}
            onPress={next}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Text style={styles.nextText}>{isLast ? 'Get started' : 'Next'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app, paddingHorizontal: 24 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border.default },
  dotActive: { backgroundColor: colors.brand.primary },

  stepContent: { gap: 12 },
  appName: { fontSize: 44, fontWeight: '800', color: colors.brand.primary, letterSpacing: -1, textAlign: 'center' },
  welcomeText: { fontSize: 18, color: colors.text.primary, textAlign: 'center', lineHeight: 26 },
  welcomeSub: { fontSize: 14, color: colors.text.placeholder, textAlign: 'center' },

  stepTitle: { fontSize: 22, fontWeight: '700', color: colors.text.primary },
  stepDescription: { fontSize: 15, color: colors.text.muted, lineHeight: 22, marginBottom: 4 },

  input: {
    backgroundColor: colors.background.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border.default,
    padding: 14, fontSize: 16, color: colors.text.primary,
  },

  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.background.surface,
  },
  pillActive: { backgroundColor: colors.brand.primary + '22', borderColor: colors.brand.primary },
  pillText: { fontSize: 14, color: colors.text.secondary, fontWeight: '500' },
  pillTextActive: { color: colors.brand.primary, fontWeight: '600' },
  pillHint: { fontSize: 11, color: colors.text.placeholder, marginTop: 2 },
  pillHintActive: { color: colors.brand.primary },
  pillExcluded: { backgroundColor: colors.state.dangerLighter, borderColor: colors.state.dangerBorder },
  pillExcludedText: { color: colors.state.danger, fontWeight: '600' },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.surface,
    padding: 12, borderRadius: 10, gap: 8,
  },
  memberName: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  memberDiet: { fontSize: 13, color: colors.text.muted },
  removeText: { fontSize: 13, color: colors.state.danger, fontWeight: '600' },
  addMemberBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  addMemberText: { fontSize: 14, color: colors.brand.primary, fontWeight: '600' },

  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16 },
  backBtn: { paddingVertical: 14, paddingHorizontal: 4 },
  backText: { fontSize: 16, color: colors.text.muted, fontWeight: '500' },
  nextBtn: {
    backgroundColor: colors.brand.primary, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32,
  },
  nextText: { fontSize: 16, color: colors.text.inverse, fontWeight: '700' },
});
