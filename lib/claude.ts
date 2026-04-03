// ─────────────────────────────────────────────────────────────────────────────
// Claude API — EatWell meal planning and check-in AI layer
//
// All Claude calls go through Supabase Edge Functions so the API key is never
// stored on-device. The mobile app calls the edge function endpoints; the edge
// functions call the Claude API server-side.
//
// This file defines:
//   1. The types for each AI prompt/response pair
//   2. Client-side functions that call the edge function endpoints
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import type { InventoryItem, ItemCategory, GardenPlant, GardenHarvest, GardenSuggestion, PlannedMeal, UserPreferences } from '../types';

// ─── Generate Weekly Meal Plan ────────────────────────────────────────────────

export interface MealPlanInput {
  fridgeItems: Pick<InventoryItem, 'name' | 'quantity' | 'unit'>[];
  gardenAvailable: string[];       // plant names available to harvest this week
  spontaneousAdditions: string[];  // market finds, neighbour gifts, etc.
  nightsAway: number[];            // day_of_week values (0=Mon) user is away
  hollyHomeNights: number[];       // day_of_week values Holly is home (Phase 2)
  preferences?: Pick<UserPreferences,
    | 'cuisine_likes'
    | 'cuisine_dislikes'
    | 'proteins_excluded'
    | 'spice_level'
    | 'weeknight_max_minutes'
    | 'weekend_cooking'
    | 'holly_joins_regularly'
    | 'cooking_notes'
  > | null;
}

export interface GeneratedMealPlan {
  meals: Array<{
    day_of_week: number;
    meal_name: string;
    description: string;
    is_fish: boolean;
    needs_recipe: boolean;
    estimated_prep_minutes: number;
    ingredients: Array<{
      name: string;
      quantity: number;
      unit: string;
      store: 'grocer' | 'butcher' | 'supermarket';
      buy_timing: 'weekend' | 'day_of' | 'sunday_default';
      from_fridge: boolean;
      from_garden: boolean;
      is_pantry_staple: boolean;
      ingredient_category: ItemCategory;
      herb_backup: string | null;
    }>;
    holly_included: boolean;
  }>;
  planning_notes: string; // AI's summary of why these meals were chosen
}

export async function generateMealPlan(input: MealPlanInput): Promise<GeneratedMealPlan> {
  const url = 'https://xjscuzizvxawfapmhdct.supabase.co/functions/v1/generate-meal-plan';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqc2N1eml6dnhhd2ZhcG1oZGN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODY1MDksImV4cCI6MjA5MDE2MjUwOX0.MzpYCE5ROSdMALHZMVYDJ0zBnk3lZbBG5Xwh2_HW1o0';

  const attempt = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Edge function error (${response.status})`);
      return data as GeneratedMealPlan;
    } finally {
      clearTimeout(timeout);
    }
  };

  // Retry up to 3 times on network failures
  let lastError: any;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt();
    } catch (e: any) {
      lastError = e;
      if (e?.name === 'AbortError') throw new Error('Meal plan timed out — please try again.');
      // Only retry on network errors, not function errors
      if (e?.message?.includes('Edge function error')) throw e;
    }
  }
  throw lastError;
}

// ─── Morning Check-in Message ─────────────────────────────────────────────────

export interface MorningCheckinContext {
  plannedMealLastNight: PlannedMeal | null;
  tonightOptions: PlannedMeal[];
  hollyEnabled: boolean;
  fridgeSummary: string; // short human-readable fridge status
}

export interface MorningCheckinMessages {
  debrief_prompt: string;   // "What did you end up cooking last night?"
  tonight_prompt: string;   // "Here are your options for tonight…"
  fridge_note: string | null; // e.g. "I think you've still got some parsley…"
}

export async function getMorningCheckinMessages(
  context: MorningCheckinContext
): Promise<MorningCheckinMessages> {
  const { data, error } = await supabase.functions.invoke('morning-checkin', {
    body: context,
  });
  if (error) throw error;
  return data as MorningCheckinMessages;
}

// ─── Fridge Confirmation Narrative ───────────────────────────────────────────
// Generates the natural-language fridge summary shown at weekly planning time.
// e.g. "I think you've still got some parsley, a bit of pork belly, and
//       half a bag of spinach — does that sound right?"

export async function getFridgeConfirmationNarrative(
  items: Pick<InventoryItem, 'name' | 'quantity' | 'unit'>[]
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('fridge-narrative', {
    body: { items },
  });
  if (error) throw error;
  return (data as { narrative: string }).narrative;
}

// ─── Categorise Pantry Items ──────────────────────────────────────────────────

export interface CategorisedItem {
  name: string;
  category: string;
  location: string;
}

// ─── Garden Suggestions ───────────────────────────────────────────────────────

export interface GardenSuggestionsInput {
  current_month: number;
  current_year: number;
  location: string;
  plants_in_ground: Array<{ plant_name: string; status: string }>;
  cooked_meal_ingredients: Array<{ name: string; meal_count: number }>;
  inventory: Array<{ name: string; location: string }>;
}

export async function generateGardenSuggestions(
  input: GardenSuggestionsInput
): Promise<GardenSuggestion[]> {
  const url = 'https://xjscuzizvxawfapmhdct.supabase.co/functions/v1/garden-suggestions';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqc2N1eml6dnhhd2ZhcG1oZGN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODY1MDksImV4cCI6MjA5MDE2MjUwOX0.MzpYCE5ROSdMALHZMVYDJ0zBnk3lZbBG5Xwh2_HW1o0';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? `Edge function error (${response.status})`);
    return (data as { suggestions: GardenSuggestion[] }).suggestions;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Garden suggestions timed out — please try again.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Cooking Guide ────────────────────────────────────────────────────────────

export interface CookingGuide {
  steps: string[];
  components: Array<{ name: string; description: string; steps: string[] }>;
  glossary: Array<{ term: string; definition: string }>;
}

const cookingGuideCache = new Map<string, CookingGuide>();

export async function getCookingGuide(mealName: string, description: string): Promise<CookingGuide> {
  const cacheKey = `${mealName}::${description}`;
  const cached = cookingGuideCache.get(cacheKey);
  if (cached) return cached;

  const url = 'https://xjscuzizvxawfapmhdct.supabase.co/functions/v1/cooking-guide';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqc2N1eml6dnhhd2ZhcG1oZGN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODY1MDksImV4cCI6MjA5MDE2MjUwOX0.MzpYCE5ROSdMALHZMVYDJ0zBnk3lZbBG5Xwh2_HW1o0';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ meal_name: mealName, description }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? `Edge function error (${response.status})`);
    const guide = data as CookingGuide;
    cookingGuideCache.set(cacheKey, guide);
    return guide;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Cooking guide timed out — please try again.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function categorisePantryItems(
  itemNames: string[]
): Promise<CategorisedItem[]> {
  const url = 'https://xjscuzizvxawfapmhdct.supabase.co/functions/v1/categorise-pantry-items';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqc2N1eml6dnhhd2ZhcG1oZGN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODY1MDksImV4cCI6MjA5MDE2MjUwOX0.MzpYCE5ROSdMALHZMVYDJ0zBnk3lZbBG5Xwh2_HW1o0';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({ items: itemNames }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? `Edge function error (${response.status})`);
  return data as CategorisedItem[];
}
