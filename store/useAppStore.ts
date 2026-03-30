import { create } from 'zustand';
import type {
  InventoryItem,
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

  // ── Inventory ─────────────────────────────────────────────────────────────
  inventoryItems: InventoryItem[];
  setInventoryItems: (items: InventoryItem[]) => void;
  upsertInventoryItem: (item: InventoryItem) => void;
  removeInventoryItem: (id: string) => void;

  // ── Shopping ──────────────────────────────────────────────────────────────
  shoppingList: ShoppingList | null;
  shoppingItems: ShoppingListItem[];
  setShoppingList: (list: ShoppingList, items: ShoppingListItem[]) => void;
  toggleShoppingItem: (id: string) => void;
  addShoppingItem: (item: ShoppingListItem) => void;

  // ── Garden ────────────────────────────────────────────────────────────────
  gardenPlants: GardenPlant[];
  setGardenPlants: (plants: GardenPlant[]) => void;
  updateGardenPlant: (id: string, updates: Partial<GardenPlant>) => void;

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

  // Inventory
  inventoryItems: [],
  setInventoryItems: (items) => set({ inventoryItems: items }),
  upsertInventoryItem: (item) =>
    set((state) => {
      const idx = state.inventoryItems.findIndex((i) => i.id === item.id);
      if (idx === -1) return { inventoryItems: [...state.inventoryItems, item] };
      const updated = [...state.inventoryItems];
      updated[idx] = item;
      return { inventoryItems: updated };
    }),
  removeInventoryItem: (id) =>
    set((state) => ({ inventoryItems: state.inventoryItems.filter((i) => i.id !== id) })),

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
  addShoppingItem: (item) =>
    set((state) => ({ shoppingItems: [...state.shoppingItems, item] })),

  // Garden
  gardenPlants: [],
  setGardenPlants: (plants) => set({ gardenPlants: plants }),
  updateGardenPlant: (id, updates) =>
    set((state) => ({
      gardenPlants: state.gardenPlants.map((p) => p.id === id ? { ...p, ...updates } : p),
    })),

  // Check-in
  todayCheckin: null,
  setTodayCheckin: (checkin) => set({ todayCheckin: checkin }),
}));
