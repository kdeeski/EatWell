import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Image, StyleSheet } from 'react-native';
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
    setMealPlan, setShoppingList, setTodayCheckin, setUserPreferences, setRecipes,
  } = useAppStore();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [updateReady, setUpdateReady] = useState(false);
  const bootstrapped = useRef(false);

  useEffect(() => {
    async function checkForUpdate() {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return; // reloadAsync restarts — code below never runs
        }
      } catch {
        // Not in an EAS build environment — skip silently
      }
      setUpdateReady(true);
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
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) router.replace('/(auth)/login');
    else if (session && inAuthGroup) router.replace('/(tabs)');
  }, [session, segments]);

  useEffect(() => {
    if (!session || bootstrapped.current) return;
    bootstrapped.current = true;
    setUserId(session.user.id);
    // Explicitly set the session on the Supabase client before querying —
    // onAuthStateChange can fire before the client's JWT is ready for RLS.
    supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token!,
    }).then(() =>
      bootstrapUserData(session.user.id, session.user.email ?? '').then(
        ({ inventoryItems, gardenPlants, mealPlanData, shoppingData, todayCheckin, userPreferences, recipes }) => {
          setInventoryItems(inventoryItems);
          setGardenPlants(gardenPlants);
          if (mealPlanData) setMealPlan(mealPlanData.plan, mealPlanData.meals);
          if (shoppingData) setShoppingList(shoppingData.list, shoppingData.items);
          setTodayCheckin(todayCheckin);
          setUserPreferences(userPreferences);
          setRecipes(recipes);
        }
      )
    ).catch((e) => console.error('Bootstrap chain failed:', e));
  }, [session?.user?.id]);

  if (!updateReady || session === undefined) {
    return (
      <View style={splashStyles.container}>
        <StatusBar style="light" />
        <Image source={require('../assets/splash-icon.png')} style={splashStyles.logo} resizeMode="contain" />
        <Text style={splashStyles.appName}>EatWell</Text>
        <Text style={splashStyles.status}>
          {!updateReady ? 'Checking for updates…' : 'Loading…'}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="planning" options={{ presentation: 'modal' }} />
        <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2D6A4F',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logo: {
    width: 96,
    height: 96,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  status: {
    fontSize: 14,
    color: '#A7F3D0',
    fontWeight: '500',
  },
});
