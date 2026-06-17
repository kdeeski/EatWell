// Settings screen — user cooking preferences that shape AI meal planning.
// Presented as a modal from the gear icon on the Today screen.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { saveUserPreferences } from '../lib/data';
import type { SpiceLevel, WeekendCooking, UserPreferences } from '../types';
type WineDetailLevel = NonNullable<UserPreferences['wine_detail_level']>;

const CUISINES = [
  'Asian', 'Mediterranean', 'Middle Eastern', 'French', 'Italian',
  'Japanese', 'Thai', 'Mexican', 'Indian', 'Greek', 'Spanish', 'American',
];

const PROTEINS = [
  'Pork', 'Lamb', 'Beef', 'Chicken', 'Fish', 'Shellfish', 'Game',
];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userPreferences, setUserPreferences, userId } = useAppStore();

  // Initialise from store, falling back to defaults
  const [cuisineLikes, setCuisineLikes]       = useState<string[]>(userPreferences?.cuisine_likes ?? []);
  const [cuisineDislikes, setCuisineDislikes] = useState<string[]>(userPreferences?.cuisine_dislikes ?? []);
  const [proteinsExcluded, setProteinsExcluded] = useState<string[]>(userPreferences?.proteins_excluded ?? []);
  const [spiceLevel, setSpiceLevel]           = useState<SpiceLevel>(userPreferences?.spice_level ?? 'medium');
  const [weeknightMins, setWeeknightMins]     = useState<number>(userPreferences?.weeknight_max_minutes ?? 45);
  const [weekendCooking, setWeekendCooking]   = useState<WeekendCooking>(userPreferences?.weekend_cooking ?? 'project');
  const [hollyJoins, setHollyJoins]           = useState<boolean>(userPreferences?.holly_joins_regularly ?? true);
  const [cookingNotes, setCookingNotes]       = useState<string>(userPreferences?.cooking_notes ?? '');
  const [standingOrders, setStandingOrders]   = useState<string>(userPreferences?.standing_orders ?? '');
  const [rotationRatio, setRotationRatio]     = useState<number>(userPreferences?.rotation_repeat_ratio ?? 0);
  const [rotationMinRated, setRotationMinRated] = useState<number>(userPreferences?.rotation_min_rated ?? 10);
  const [gardenLocation, setGardenLocation]   = useState<string>(userPreferences?.garden_location ?? 'Canterbury, New Zealand');
  const [wineDetailLevel, setWineDetailLevel] = useState<WineDetailLevel>(userPreferences?.wine_detail_level ?? 'simple');
  const [wineGuideSite, setWineGuideSite]     = useState<string>(userPreferences?.wine_guide_site ?? 'goodpairdays.com');
  const [recipeSearchSite, setRecipeSearchSite] = useState<string>(userPreferences?.recipe_search_site ?? 'recipetineats.com');
  const [saving, setSaving]                   = useState(false);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const saved = await saveUserPreferences(userId, {
        cuisine_likes: cuisineLikes,
        cuisine_dislikes: cuisineDislikes,
        proteins_excluded: proteinsExcluded,
        spice_level: spiceLevel,
        weeknight_max_minutes: weeknightMins,
        weekend_cooking: weekendCooking,
        holly_joins_regularly: hollyJoins,
        cooking_notes: cookingNotes.trim() || null,
        standing_orders: standingOrders.trim() || null,
        rotation_repeat_ratio: rotationRatio,
        rotation_min_rated: rotationMinRated,
        garden_location: gardenLocation.trim() || 'Canterbury, New Zealand',
        wine_detail_level: wineDetailLevel,
        wine_guide_site: wineGuideSite.trim() || 'goodpairdays.com',
        recipe_search_site: recipeSearchSite.trim() || 'recipetineats.com',
      });
      setUserPreferences(saved);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Preferences</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          {saving
            ? <ActivityIndicator color="#3B7A57" />
            : <Text style={styles.save}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 40 }]}>

        {/* ── Household ───────────────────────────────────────── */}
        <SectionHeader>Household</SectionHeader>

        <Row label="Holly joins regularly" hint="Scales portions and excludes fish on her nights">
          <Toggle value={hollyJoins} onToggle={() => setHollyJoins((v) => !v)} />
        </Row>

        {/* ── Meal planning ───────────────────────────────────── */}
        <SectionHeader>Meal Planning</SectionHeader>

        <FieldLabel>Cuisines I love</FieldLabel>
        <PillGroup
          items={CUISINES}
          selected={cuisineLikes}
          color="#3B7A57"
          onToggle={(item) => {
            toggleItem(cuisineLikes, setCuisineLikes, item);
            setCuisineDislikes(cuisineDislikes.filter((i) => i !== item));
          }}
        />

        <FieldLabel>Cuisines I'd rather avoid</FieldLabel>
        <PillGroup
          items={CUISINES}
          selected={cuisineDislikes}
          color="#DC2626"
          onToggle={(item) => {
            toggleItem(cuisineDislikes, setCuisineDislikes, item);
            setCuisineLikes(cuisineLikes.filter((i) => i !== item));
          }}
        />

        <FieldLabel>Proteins I don't eat</FieldLabel>
        <PillGroup
          items={PROTEINS}
          selected={proteinsExcluded}
          color="#DC2626"
          onToggle={(item) => toggleItem(proteinsExcluded, setProteinsExcluded, item)}
        />

        <FieldLabel>Spice level</FieldLabel>
        <View style={styles.pillRow}>
          {(['mild', 'medium', 'bold'] as SpiceLevel[]).map((level) => (
            <TouchableOpacity
              key={level}
              style={[styles.pill, spiceLevel === level && styles.pillSelectedGreen]}
              onPress={() => setSpiceLevel(level)}
            >
              <Text style={[styles.pillText, spiceLevel === level && styles.pillTextSelected]}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FieldLabel>Weeknight cooking time</FieldLabel>
        <View style={styles.pillRow}>
          {[{ val: 30, label: '30 min' }, { val: 45, label: '45 min' }, { val: 60, label: '1 hr+' }].map((opt) => (
            <TouchableOpacity
              key={opt.val}
              style={[styles.pill, weeknightMins === opt.val && styles.pillSelectedGreen]}
              onPress={() => setWeeknightMins(opt.val)}
            >
              <Text style={[styles.pillText, weeknightMins === opt.val && styles.pillTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FieldLabel>Weekend cooking</FieldLabel>
        <View style={styles.pillRow}>
          {([{ val: 'quick', label: 'Keep it simple' }, { val: 'project', label: 'Love a project' }] as { val: WeekendCooking; label: string }[]).map((opt) => (
            <TouchableOpacity
              key={opt.val}
              style={[styles.pill, weekendCooking === opt.val && styles.pillSelectedGreen]}
              onPress={() => setWeekendCooking(opt.val)}
            >
              <Text style={[styles.pillText, weekendCooking === opt.val && styles.pillTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FieldLabel>Cooking notes</FieldLabel>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={cookingNotes}
          onChangeText={setCookingNotes}
          placeholder="e.g. love umami, go easy on cream, always have anchovies…"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
        />

        <FieldLabel>Standing orders</FieldLabel>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={standingOrders}
          onChangeText={setStandingOrders}
          placeholder="Always apply to every meal plan — e.g. family of 4 (2 adults, 2 kids), one child is coeliac so no gluten."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
        />
        <Text style={styles.hint}>These instructions are always included when generating your meal plan.</Text>

        {/* ── Meal Rotation ────────────────────────────────────── */}
        <SectionHeader>Meal Rotation</SectionHeader>

        <FieldLabel>Repeat ratio</FieldLabel>
        <View style={styles.pillRow}>
          {([
            { val: 0,   label: 'Off' },
            { val: 0.2, label: '1 in 5' },
            { val: 0.4, label: '2 in 5' },
            { val: 0.6, label: '3 in 5' },
          ] as { val: number; label: string }[]).map((opt) => (
            <TouchableOpacity
              key={opt.val}
              style={[styles.pill, rotationRatio === opt.val && styles.pillSelectedGreen]}
              onPress={() => setRotationRatio(opt.val)}
            >
              <Text style={[styles.pillText, rotationRatio === opt.val && styles.pillTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>How many meals per week to repeat from your highly-rated stash.</Text>

        {rotationRatio > 0 && (
          <>
            <FieldLabel>Activate after</FieldLabel>
            <View style={styles.pillRow}>
              {([5, 10, 20] as number[]).map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.pill, rotationMinRated === n && styles.pillSelectedGreen]}
                  onPress={() => setRotationMinRated(n)}
                >
                  <Text style={[styles.pillText, rotationMinRated === n && styles.pillTextSelected]}>
                    {n} rated
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>Rotation only kicks in once you've rated this many meals.</Text>
          </>
        )}

        {/* ── Garden ──────────────────────────────────────────── */}
        <SectionHeader>Garden</SectionHeader>

        <FieldLabel>Garden location</FieldLabel>
        <TextInput
          style={styles.input}
          value={gardenLocation}
          onChangeText={setGardenLocation}
          placeholder="Canterbury, New Zealand"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="words"
        />
        <Text style={styles.hint}>Used to tailor planting suggestions to your climate.</Text>

        {/* ── Drink Pairing ───────────────────────────────────── */}
        <SectionHeader>Drink Pairing</SectionHeader>

        <FieldLabel>Pairing detail</FieldLabel>
        <View style={styles.pillRow}>
          {([{ val: 'simple', label: 'Simple' }, { val: 'detailed', label: 'Detailed' }] as { val: WineDetailLevel; label: string }[]).map((opt) => (
            <TouchableOpacity
              key={opt.val}
              style={[styles.pill, wineDetailLevel === opt.val && styles.pillSelectedGreen]}
              onPress={() => setWineDetailLevel(opt.val)}
            >
              <Text style={[styles.pillText, wineDetailLevel === opt.val && styles.pillTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>Simple shows varietal + one-line reason. Detailed adds food-wine interaction notes.</Text>

        <FieldLabel>Wine guide site</FieldLabel>
        <TextInput
          style={styles.input}
          value={wineGuideSite}
          onChangeText={setWineGuideSite}
          placeholder="goodpairdays.com"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>Tapping a varietal in drink pairing searches this site via Google.</Text>

        {/* ── Recipes ────────────────────────────────────────── */}
        <SectionHeader>Recipes</SectionHeader>

        <FieldLabel>Recipe search site</FieldLabel>
        <TextInput
          style={styles.input}
          value={recipeSearchSite}
          onChangeText={setRecipeSearchSite}
          placeholder="recipetineats.com"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>The "Find →" recipe browser searches this site by default.</Text>

      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: string }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity style={[styles.toggle, value && styles.toggleOn]} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
    </TouchableOpacity>
  );
}

function PillGroup({ items, selected, color, onToggle }: {
  items: string[];
  selected: string[];
  color: string;
  onToggle: (item: string) => void;
}) {
  return (
    <View style={styles.pillWrap}>
      {items.map((item) => {
        const active = selected.includes(item);
        return (
          <TouchableOpacity
            key={item}
            style={[styles.pill, active && { backgroundColor: color, borderColor: color }]}
            onPress={() => onToggle(item)}
          >
            <Text style={[styles.pillText, active && styles.pillTextSelected]}>{item}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  cancel: { fontSize: 16, color: '#6B7280', width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  save: { fontSize: 16, color: '#3B7A57', fontWeight: '600', width: 60, textAlign: 'right' },

  body: { flex: 1 },
  bodyContent: { padding: 20, gap: 4 },

  sectionHeader: {
    fontSize: 13, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 28, marginBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 6,
  },
  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: '#374151',
    marginTop: 16, marginBottom: 6,
  },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, padding: 14, gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowHint: { fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 16 },

  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
    flexShrink: 0,
  },
  pillSelectedGreen: { backgroundColor: '#3B7A57', borderColor: '#3B7A57' },
  pillText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  pillTextSelected: { color: '#fff' },

  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: '#E5E7EB', justifyContent: 'center', padding: 2,
  },
  toggleOn: { backgroundColor: '#3B7A57' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleThumbOn: { alignSelf: 'flex-end' },

  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#111827',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 11 },
});
