import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { bootstrapUserData, loadHouseholdMembers } from '../lib/data';
import type { Session } from '@supabase/supabase-js';

// Hold the native splash until we're ready to show the app (no-op on web)
if (Platform.OS !== 'web') SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const {
    setUserId, setInventoryItems, setGardenPlants,
    setMealPlan, setShoppingList, setTodayCheckin, setUserPreferences, setRecipes,
    setBarItems, setCellarItems, setHouseholdMembers,
  } = useAppStore();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // On web there are no OTA updates — skip the check entirely
  const [updateReady, setUpdateReady] = useState(Platform.OS === 'web');
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

  // Hide the native splash once both update check and session are resolved
  useEffect(() => {
    if (updateReady && session !== undefined && Platform.OS !== 'web') {
      SplashScreen.hideAsync();
    }
  }, [updateReady, session]);

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
        ({ inventoryItems, gardenPlants, mealPlanData, shoppingData, todayCheckin, userPreferences, recipes, barItems, cellarItems }) => {
          setInventoryItems(inventoryItems);
          setGardenPlants(gardenPlants);
          if (mealPlanData) setMealPlan(mealPlanData.plan, mealPlanData.meals);
          if (shoppingData) setShoppingList(shoppingData.list, shoppingData.items);
          setTodayCheckin(todayCheckin);
          setUserPreferences(userPreferences);
          setRecipes(recipes);
          setBarItems(barItems);
          setCellarItems(cellarItems);
          // Load household members alongside other data
          loadHouseholdMembers(session.user.id).then((members) => setHouseholdMembers(members)).catch(console.error);
        }
      )
    ).catch((e) => console.error('Bootstrap chain failed:', e));
  }, [session?.user?.id]);

  if (!updateReady || session === undefined) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFAF8' } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="planning" options={{ presentation: 'modal' }} />
        <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="bar" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cellar" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
