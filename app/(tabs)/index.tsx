// Today screen — the home screen of EatWell.
// Shows tonight's chosen meal (or the pick-your-meal prompt),
// any morning check-in that needs completing, and quick fridge notes.

import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';

export default function TodayScreen() {
  const router = useRouter();
  const { plannedMeals, todayCheckin } = useAppStore();

  const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
  const tonightsMeal = plannedMeals.find((m) => m.day_of_week === todayIndex);

  const checkinPending = !todayCheckin?.completed_at;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Good morning.</Text>

      {checkinPending && (
        <TouchableOpacity
          style={styles.checkinCard}
          onPress={() => router.push('/checkin')}
        >
          <Text style={styles.checkinTitle}>Morning check-in</Text>
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
            <Text style={styles.mealName}>{tonightsMeal.meal_name}</Text>
            {tonightsMeal.description ? (
              <Text style={styles.mealDesc}>{tonightsMeal.description}</Text>
            ) : null}
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
        <Text style={styles.sectionLabel}>This week</Text>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/(tabs)/plan')}>
          <Text style={styles.linkText}>See the full week →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { padding: 20, paddingTop: 60 },
  greeting: { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 24 },

  checkinCard: {
    backgroundColor: '#3B7A57',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  checkinTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  checkinSub: { fontSize: 14, color: '#D1FAE5', lineHeight: 20, marginBottom: 12 },
  checkinCta: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

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
});
