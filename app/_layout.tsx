import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { bootstrapUserData } from '../lib/data';
import type { Session } from '@supabase/supabase-js';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const {
    setUserId, setFridgeItems, setGardenPlants,
    setMealPlan, setShoppingList, setTodayCheckin,
  } = useAppStore();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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
      // Load all user data into the app store
      bootstrapUserData(session.user.id, session.user.email ?? '').then(
        ({ fridgeItems, gardenPlants, mealPlanData, shoppingData, todayCheckin }) => {
          setFridgeItems(fridgeItems);
          setGardenPlants(gardenPlants);
          if (mealPlanData) setMealPlan(mealPlanData.plan, mealPlanData.meals);
          if (shoppingData) setShoppingList(shoppingData.list, shoppingData.items);
          setTodayCheckin(todayCheckin);
        }
      );
    }
  }, [session, segments]);

  // Don't render anything until auth state is known
  if (session === undefined) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="planning" options={{ presentation: 'modal' }} />
        <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
