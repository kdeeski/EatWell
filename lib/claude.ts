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

import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';
import type { InventoryItem, ItemCategory, GardenPlant, GardenHarvest, PlannedMeal } from '../types';

// ─── Generate Weekly Meal Plan ────────────────────────────────────────────────

export interface MealPlanInput {
  fridgeItems: Pick<InventoryItem, 'name' | 'quantity' | 'unit'>[];
  gardenAvailable: string[];       // plant names available to harvest this week
  spontaneousAdditions: string[];  // market finds, neighbour gifts, etc.
  nightsAway: number[];            // day_of_week values (0=Mon) user is away
  hollyHomeNights: number[];       // day_of_week values Holly is home (Phase 2)
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
  const url = `${supabaseUrl}/functions/v1/generate-meal-plan`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error ?? `Edge function error (${response.status})`);
  }
  return data as GeneratedMealPlan;
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

// ─── Analyse Pantry Photo ─────────────────────────────────────────────────────

export interface StocktakeItem {
  name: string;
  category: string;
  notes: string | null;
}

export async function analysePantryPhotos(
  imageDataUris: string[]
): Promise<StocktakeItem[]> {
  const { data, error } = await supabase.functions.invoke('analyse-pantry-photo', {
    body: { images: imageDataUris },
  });
  if (error) throw error;
  return (data as { items: StocktakeItem[] }).items ?? [];
}
