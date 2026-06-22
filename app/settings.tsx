// Settings screen — user cooking preferences that shape AI meal planning.
// Presented as a modal from the gear icon on the Today screen.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { Alert } from '../lib/alert';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../lib/supabase';
import { saveUserPreferences, loadHouseholdMembers, saveHouseholdMember, updateHouseholdMember, deleteHouseholdMember } from '../lib/data';
import type { SpiceLevel, WeekendCooking, UserPreferences, HouseholdMember } from '../types';
type WineDetailLevel = NonNullable<UserPreferences['wine_detail_level']>;
import { colors } from '../constants/theme';
import { shared } from '../constants/styles';

const CUISINES = [
  'Asian', 'Mediterranean', 'Middle Eastern', 'French', 'Italian',
  'Japanese', 'Thai', 'Mexican', 'Indian', 'Greek', 'Spanish', 'American',
];

const PROTEINS = [
  'Pork', 'Lamb', 'Beef', 'Chicken', 'Fish', 'Shellfish', 'Game', 'All Meat (Vegetarian)',
];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userPreferences, setUserPreferences, userId, householdMembers, setHouseholdMembers, addHouseholdMember: addMemberToStore, updateHouseholdMemberInStore, removeHouseholdMember: removeMemberFromStore } = useAppStore();

  // Initialise from store, falling back to defaults
  const [cuisineLikes, setCuisineLikes]       = useState<string[]>(userPreferences?.cuisine_likes ?? []);
  const [cuisineDislikes, setCuisineDislikes] = useState<string[]>(userPreferences?.cuisine_dislikes ?? []);
  const [proteinsExcluded, setProteinsExcluded] = useState<string[]>(userPreferences?.proteins_excluded ?? []);
  const [spiceLevel, setSpiceLevel]           = useState<SpiceLevel>(userPreferences?.spice_level ?? 'medium');
  const [weeknightMins, setWeeknightMins]     = useState<number>(userPreferences?.weeknight_max_minutes ?? 45);
  const [weekendCooking, setWeekendCooking]   = useState<WeekendCooking>(userPreferences?.weekend_cooking ?? 'project');
  const [cookingNotes, setCookingNotes]       = useState<string>(userPreferences?.cooking_notes ?? '');
  const [standingOrders, setStandingOrders]   = useState<string>(userPreferences?.standing_orders ?? '');
  const [rotationRatio, setRotationRatio]     = useState<number>(userPreferences?.rotation_repeat_ratio ?? 0);
  const [rotationMinRated, setRotationMinRated] = useState<number>(userPreferences?.rotation_min_rated ?? 10);
  const [gardenLocation, setGardenLocation]   = useState<string>(userPreferences?.garden_location ?? 'Canterbury, New Zealand');
  const [wineDetailLevel, setWineDetailLevel] = useState<WineDetailLevel>(userPreferences?.wine_detail_level ?? 'simple');
  const [wineGuideSite, setWineGuideSite]     = useState<string>(userPreferences?.wine_guide_site ?? 'goodpairdays.com');
  const [recipeSearchSite, setRecipeSearchSite] = useState<string>(userPreferences?.recipe_search_site ?? 'recipetineats.com');
  const [saving, setSaving]                   = useState(false);

  // ── Household member form state ──
  const [showAddMember, setShowAddMember]     = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberName, setMemberName]           = useState('');
  const [memberFrequency, setMemberFrequency] = useState('');
  const [memberDietary, setMemberDietary]     = useState('');
  const [memberSaving, setMemberSaving]       = useState(false);

  const resetMemberForm = () => {
    setMemberName('');
    setMemberFrequency('');
    setMemberDietary('');
    setShowAddMember(false);
    setEditingMemberId(null);
  };

  const startEditMember = (member: HouseholdMember) => {
    setEditingMemberId(member.id);
    setMemberName(member.name);
    setMemberFrequency(member.frequency_hint ?? '');
    setMemberDietary(member.dietary_notes ?? '');
    setShowAddMember(false);
  };

  const handleSaveMember = async () => {
    if (!userId || !memberName.trim()) return;
    setMemberSaving(true);
    try {
      if (editingMemberId) {
        const updated = await updateHouseholdMember(editingMemberId, {
          name: memberName.trim(),
          frequency_hint: memberFrequency.trim() || null,
          dietary_notes: memberDietary.trim() || null,
        });
        updateHouseholdMemberInStore(editingMemberId, updated);
      } else {
        const saved = await saveHouseholdMember({
          user_id: userId,
          name: memberName.trim(),
          frequency_hint: memberFrequency.trim() || null,
          dietary_notes: memberDietary.trim() || null,
          sort_order: householdMembers.length,
        });
        addMemberToStore(saved);
      }
      resetMemberForm();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save member.');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    try {
      await deleteHouseholdMember(id);
      removeMemberFromStore(id);
      if (editingMemberId === id) resetMemberForm();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not delete member.');
    }
  };

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
        holly_joins_regularly: false,
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
            ? <ActivityIndicator color={colors.brand.primary} />
            : <Text style={styles.save}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 40 }]}>

        {/* ── Household ───────────────────────────────────────── */}
        <SectionHeader>Household</SectionHeader>

        {householdMembers.map((member) => (
          <View key={member.id} style={{ marginBottom: 8 }}>
            {editingMemberId === member.id ? (
              <View style={styles.memberCard}>
                <FieldLabel>Name</FieldLabel>
                <TextInput
                  style={styles.memberInput}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder="Name"
                  placeholderTextColor={colors.text.placeholder}
                  autoFocus
                />
                <FieldLabel>Frequency</FieldLabel>
                <TextInput
                  style={styles.memberInput}
                  value={memberFrequency}
                  onChangeText={setMemberFrequency}
                  placeholder="e.g. every second week, most nights"
                  placeholderTextColor={colors.text.placeholder}
                />
                <FieldLabel>Dietary notes</FieldLabel>
                <TextInput
                  style={styles.memberInput}
                  value={memberDietary}
                  onChangeText={setMemberDietary}
                  placeholder="e.g. no fish, vegetarian"
                  placeholderTextColor={colors.text.placeholder}
                />
                <View style={styles.memberFormButtons}>
                  <TouchableOpacity onPress={resetMemberForm}>
                    <Text style={styles.memberCancelBtn}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveMember} disabled={memberSaving || !memberName.trim()}>
                    <Text style={[styles.memberSaveBtn, (!memberName.trim() || memberSaving) && { opacity: 0.4 }]}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.memberCard} onPress={() => startEditMember(member)} activeOpacity={0.7}>
                <View style={styles.memberCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberCardName}>{member.name}</Text>
                    {member.frequency_hint ? <Text style={styles.memberCardMuted}>{member.frequency_hint}</Text> : null}
                    {member.dietary_notes ? <Text style={styles.memberCardMuted}>{member.dietary_notes}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteMember(member.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={styles.memberDeleteBtn}>x</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {showAddMember ? (
          <View style={styles.memberCard}>
            <FieldLabel>Name</FieldLabel>
            <TextInput
              style={styles.memberInput}
              value={memberName}
              onChangeText={setMemberName}
              placeholder="Name"
              placeholderTextColor={colors.text.placeholder}
              autoFocus
            />
            <FieldLabel>Frequency</FieldLabel>
            <TextInput
              style={styles.memberInput}
              value={memberFrequency}
              onChangeText={setMemberFrequency}
              placeholder="e.g. every second week, most nights"
              placeholderTextColor={colors.text.placeholder}
            />
            <FieldLabel>Dietary notes</FieldLabel>
            <TextInput
              style={styles.memberInput}
              value={memberDietary}
              onChangeText={setMemberDietary}
              placeholder="e.g. no fish, vegetarian"
              placeholderTextColor={colors.text.placeholder}
            />
            <View style={styles.memberFormButtons}>
              <TouchableOpacity onPress={resetMemberForm}>
                <Text style={styles.memberCancelBtn}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveMember} disabled={memberSaving || !memberName.trim()}>
                <Text style={[styles.memberSaveBtn, (!memberName.trim() || memberSaving) && { opacity: 0.4 }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => { resetMemberForm(); setShowAddMember(true); }} style={styles.addMemberBtn}>
            <Text style={styles.addMemberBtnText}>+ Add member</Text>
          </TouchableOpacity>
        )}

        {/* ── Meal planning ───────────────────────────────────── */}
        <SectionHeader>Meal Planning</SectionHeader>

        <FieldLabel>Cuisines I love</FieldLabel>
        <PillGroup
          items={CUISINES}
          selected={cuisineLikes}
          color={colors.brand.primary}
          onToggle={(item) => {
            toggleItem(cuisineLikes, setCuisineLikes, item);
            setCuisineDislikes(cuisineDislikes.filter((i) => i !== item));
          }}
        />

        <FieldLabel>Cuisines I'd rather avoid</FieldLabel>
        <PillGroup
          items={CUISINES}
          selected={cuisineDislikes}
          color={colors.state.danger}
          onToggle={(item) => {
            toggleItem(cuisineDislikes, setCuisineDislikes, item);
            setCuisineLikes(cuisineLikes.filter((i) => i !== item));
          }}
        />

        <FieldLabel>Proteins I don't eat</FieldLabel>
        <PillGroup
          items={PROTEINS}
          selected={proteinsExcluded}
          color={colors.state.danger}
          onToggle={(item) => toggleItem(proteinsExcluded, setProteinsExcluded, item)}
        />

        <FieldLabel>Spice level</FieldLabel>
        <View style={styles.pillRow}>
          {(['mild', 'medium', 'bold'] as SpiceLevel[]).map((level) => (
            <TouchableOpacity
              key={level}
              style={[styles.pill, spiceLevel === level && styles.pillSelected]}
              onPress={() => setSpiceLevel(level)}
            >
              <Text style={[styles.pillText, spiceLevel === level && styles.pillTextActive]}>
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
              style={[styles.pill, weeknightMins === opt.val && styles.pillSelected]}
              onPress={() => setWeeknightMins(opt.val)}
            >
              <Text style={[styles.pillText, weeknightMins === opt.val && styles.pillTextActive]}>
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
              style={[styles.pill, weekendCooking === opt.val && styles.pillSelected]}
              onPress={() => setWeekendCooking(opt.val)}
            >
              <Text style={[styles.pillText, weekendCooking === opt.val && styles.pillTextActive]}>
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
          placeholderTextColor={colors.text.placeholder}
          multiline
          numberOfLines={3}
        />

        <FieldLabel>Standing orders</FieldLabel>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={standingOrders}
          onChangeText={setStandingOrders}
          placeholder="Always apply to every meal plan — e.g. family of 4 (2 adults, 2 kids), one child is coeliac so no gluten."
          placeholderTextColor={colors.text.placeholder}
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
              style={[styles.pill, rotationRatio === opt.val && styles.pillSelected]}
              onPress={() => setRotationRatio(opt.val)}
            >
              <Text style={[styles.pillText, rotationRatio === opt.val && styles.pillTextActive]}>
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
                  style={[styles.pill, rotationMinRated === n && styles.pillSelected]}
                  onPress={() => setRotationMinRated(n)}
                >
                  <Text style={[styles.pillText, rotationMinRated === n && styles.pillTextActive]}>
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
          placeholderTextColor={colors.text.placeholder}
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
              style={[styles.pill, wineDetailLevel === opt.val && styles.pillSelected]}
              onPress={() => setWineDetailLevel(opt.val)}
            >
              <Text style={[styles.pillText, wineDetailLevel === opt.val && styles.pillTextActive]}>
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
          placeholderTextColor={colors.text.placeholder}
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
          placeholderTextColor={colors.text.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>The "Find →" recipe browser searches this site by default.</Text>

        {/* ── Sign out ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={() => {
            Alert.alert('Sign out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
            ]);
          }}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

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
            style={[styles.pill, active && { backgroundColor: color + '22', borderColor: color }]}
            onPress={() => onToggle(item)}
          >
            <Text style={[styles.pillText, active && { color }]}>{item}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border.hairline,
  },
  cancel: { fontSize: 16, color: colors.text.muted, width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text.primary },
  save: { fontSize: 16, color: colors.text.link, fontWeight: '600', width: 60, textAlign: 'right' },

  body: { flex: 1 },
  bodyContent: { padding: 20, gap: 4 },

  sectionHeader: {
    ...shared.sectionLabel,
    marginTop: 28, marginBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border.hairline, paddingBottom: 6,
  },
  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: colors.text.secondary,
    marginTop: 16, marginBottom: 6,
  },
  hint: { fontSize: 12, color: colors.text.placeholder, marginTop: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background.surface, borderRadius: 12,
    padding: 14, gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  rowHint: { fontSize: 12, color: colors.text.muted, marginTop: 2, lineHeight: 16 },

  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.background.surface, borderWidth: 1, borderColor: colors.border.default,
    flexShrink: 0,
  },
  pillSelected: { backgroundColor: colors.brand.primary + '22', borderColor: colors.brand.primary },
  pillText: { fontSize: 14, fontWeight: '500', color: colors.text.secondary },
  pillTextActive: { color: colors.brand.primary },

  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: colors.border.default, justifyContent: 'center', padding: 2,
  },
  toggleOn: { backgroundColor: colors.brand.primary },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background.surface },
  toggleThumbOn: { alignSelf: 'flex-end' },

  input: {
    backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text.primary,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 11 },

  // Household member styles
  memberCard: {
    backgroundColor: colors.background.surface, borderRadius: 12, padding: 14,
  },
  memberCardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  memberCardName: {
    fontSize: 15, fontWeight: '600', color: colors.text.primary,
  },
  memberCardMuted: {
    fontSize: 13, color: colors.text.placeholder, marginTop: 2,
  },
  memberDeleteBtn: {
    fontSize: 16, color: colors.state.danger, fontWeight: '600', paddingHorizontal: 4,
  },
  memberInput: {
    backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text.primary, marginBottom: 8,
  },
  memberFormButtons: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 4,
  },
  memberCancelBtn: {
    fontSize: 15, color: colors.text.muted, fontWeight: '500',
  },
  memberSaveBtn: {
    fontSize: 15, color: colors.text.link, fontWeight: '600',
  },
  addMemberBtn: {
    paddingVertical: 12, alignItems: 'center',
  },
  addMemberBtnText: {
    fontSize: 15, color: colors.text.link, fontWeight: '600',
  },
  signOutBtn: {
    marginTop: 32, paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: colors.state.dangerBorder,
  },
  signOutText: {
    fontSize: 15, fontWeight: '600', color: colors.state.danger,
  },
});
