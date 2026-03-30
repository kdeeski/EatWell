import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { bootstrapUserData } from '../lib/data';
import type { Session } from '@supabase/supabase-js';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const {
    setUserId, setInventoryItems, setGardenPlants,
    setMealPlan, setShoppingList, setTodayCheckin,
  } = useAppStore();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function checkForUpdate() {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setUpdating(true);
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Not in an EAS build environment — skip silently
      }
    }
    checkForUpdate();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;

    setUserId(session?.user?.id ?? null);

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (session) {
      bootstrapUserData(session.user.id, session.user.email ?? '').then(
        ({ inventoryItems, gardenPlants, mealPlanData, shoppingData, todayCheckin }) => {
          setInventoryItems(inventoryItems);
          setGardenPlants(gardenPlants);
          if (mealPlanData) setMealPlan(mealPlanData.plan, mealPlanData.meals);
          if (shoppingData) setShoppingList(shoppingData.list, shoppingData.items);
          setTodayCheckin(todayCheckin);
        }
      );
    }
  }, [session, segments]);

  if (session === undefined) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {updating && (
        <View style={styles.updateBanner}>
          <Text style={styles.updateText}>✦ Updating EatWell…</Text>
        </View>
      )}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="planning" options={{ presentation: 'modal' }} />
        <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  updateBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999,
    backgroundColor: '#3B7A57', paddingTop: 52, paddingBottom: 12,
    alignItems: 'center',
  },
  updateText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
});
