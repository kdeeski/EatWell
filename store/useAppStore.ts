import { create } from 'zustand';
import type {
  FridgeItem,
  MealPlan,
  PlannedMeal,
  ShoppingList,
  ShoppingListItem,
  GardenPlant,
  CheckIn,
} from '../types';

interface AppState {
  // ── Auth ──────────────────────────────────────────────────────────────────
  userId: string | null;
  setUserId: (id: string | null) => void;

  // ── Current week ──────────────────────────────────────────────────────────
  currentMealPlan: MealPlan | null;
  plannedMeals: PlannedMeal[];
  setMealPlan: (plan: MealPlan, meals: PlannedMeal[]) => void;

  // ── Fridge ────────────────────────────────────────────────────────────────
  fridgeItems: FridgeItem[];
  setFridgeItems: (items: FridgeItem[]) => void;
  upsertFridgeItem: (item: FridgeItem) => void;
  removeFridgeItem: (id: string) => void;

  // ── Shopping ──────────────────────────────────────────────────────────────
  shoppingList: ShoppingList | null;
  shoppingItems: ShoppingListItem[];
  setShoppingList: (list: ShoppingList, items: ShoppingListItem[]) => void;
  toggleShoppingItem: (id: string) => void;

  // ── Garden ────────────────────────────────────────────────────────────────
  gardenPlants: GardenPlant[];
  setGardenPlants: (plants: GardenPlant[]) => void;

  // ── Today's check-in ──────────────────────────────────────────────────────
  todayCheckin: CheckIn | null;
  setTodayCheckin: (checkin: CheckIn | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  userId: null,
  setUserId: (id) => set({ userId: id }),

  // Meal plan
  currentMealPlan: null,
  plannedMeals: [],
  setMealPlan: (plan, meals) => set({ currentMealPlan: plan, plannedMeals: meals }),

  // Fridge
  fridgeItems: [],
  setFridgeItems: (items) => set({ fridgeItems: items }),
  upsertFridgeItem: (item) =>
    set((state) => {
      const idx = state.fridgeItems.findIndex((i) => i.id === item.id);
      if (idx === -1) return { fridgeItems: [...state.fridgeItems, item] };
      const updated = [...state.fridgeItems];
      updated[idx] = item;
      return { fridgeItems: updated };
    }),
  removeFridgeItem: (id) =>
    set((state) => ({ fridgeItems: state.fridgeItems.filter((i) => i.id !== id) })),

  // Shopping
  shoppingList: null,
  shoppingItems: [],
  setShoppingList: (list, items) => set({ shoppingList: list, shoppingItems: items }),
  toggleShoppingItem: (id) =>
    set((state) => ({
      shoppingItems: state.shoppingItems.map((i) =>
        i.id === id ? { ...i, checked: !i.checked } : i
      ),
    })),

  // Garden
  gardenPlants: [],
  setGardenPlants: (plants) => set({ gardenPlants: plants }),

  // Check-in
  todayCheckin: null,
  setTodayCheckin: (checkin) => set({ todayCheckin: checkin }),
}));
