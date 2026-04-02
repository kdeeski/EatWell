// Shopping screen — category-based grocery list.
// Garden items are pre-confirmed from the garden tracker (source of truth).
// Dried spices/herbs not from the garden use the pantry "Have it" flow.

import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, PanResponder, ActivityIndicator,
} from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { upsertInventoryItem, toggleShoppingItemChecked, loadInventoryItems, loadGardenPlants } from '../../lib/data';
import type { ShoppingListItem } from '../../types';

type IngredientCategory = ShoppingListItem['ingredient_category'];

const CATEGORY_ORDER: IngredientCategory[] = [
  'meat_fish', 'produce', 'herbs_spices', 'bread_bakery',
  'pantry_dry_goods', 'cans_preserves', 'oils_vinegars', 'condiments_sauces',
];

const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  meat_fish:          'Meat & Fish',
  dairy_eggs:         'Dairy & Eggs',
  produce:            'Produce',
  bread_bakery:       'Bread & Bakery',
  pantry_dry_goods:   'Pantry & Dry Goods',
  herbs_spices:       'Herbs & Spices',
  cans_preserves:     'Cans & Preserves',
  oils_vinegars:      'Oils & Vinegars',
  condiments_sauces:  'Condiments & Sauces',
};

function itemQuantityLabel(item: ShoppingListItem): string {
  if (item.ingredient_category === 'herbs_spices' || item.is_pantry_staple) return item.name;
  return `${item.name} × ${item.quantity} ${item.unit}`.trim();
}

// ── Swipeable row (right = have it / from garden, left = need to buy) ─────────

interface SwipeableRowProps {
  item: ShoppingListItem;
  rightLabel: string;
  rightColor: string;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  children: React.ReactNode;
}

function SwipeableRow({ item, rightLabel, rightColor, onSwipeRight, onSwipeLeft, children }: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const THRESHOLD = 80;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8,
      onPanResponderMove: (_, { dx }) => translateX.setValue(dx),
      onPanResponderRelease: (_, { dx }) => {
        if (dx > THRESHOLD) {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          onSwipeRight();
        } else if (dx < -THRESHOLD) {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          onSwipeLeft();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const rightOpacity = translateX.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const leftOpacity = translateX.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Right action background */}
      <Animated.View style={[styles.swipeAction, styles.swipeActionRight, { opacity: rightOpacity, backgroundColor: rightColor }]}>
        <Text style={styles.swipeActionText}>{rightLabel}</Text>
      </Animated.View>
      {/* Left action background */}
      <Animated.View style={[styles.swipeAction, styles.swipeActionLeft, { opacity: leftOpacity, backgroundColor: '#3B82F6' }]}>
        <Text style={styles.swipeActionText}>Need to Buy</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ShoppingScreen() {
  const {
    shoppingItems, toggleShoppingItem, userId,
    inventoryItems, setInventoryItems,
    gardenPlants, setGardenPlants,
    upsertInventoryItem: upsertStore,
  } = useAppStore();

  const buildConfirmed = (items: typeof shoppingItems, inv: typeof inventoryItems) => {
    const confirmed = new Set<string>();
    items.forEach((item) => {
      if (inv.some((p) => p.name === item.name.toLowerCase().trim() && !p.depleted)) {
        confirmed.add(item.id);
      }
    });
    return confirmed;
  };

  const buildGardenConfirmed = (items: typeof shoppingItems, plants: typeof gardenPlants) => {
    const readyNames = new Set(
      plants.filter((p) => p.status === 'ready').map((p) => p.plant_name.toLowerCase().trim())
    );
    const confirmed = new Set<string>();
    items.forEach((item) => {
      if (item.from_garden || readyNames.has(item.name.toLowerCase().trim())) {
        confirmed.add(item.id);
      }
    });
    return confirmed;
  };

  const [pantryConfirmed, setPantryConfirmed] = useState<Set<string>>(() =>
    buildConfirmed(shoppingItems, inventoryItems)
  );
  const [gardenConfirmed, setGardenConfirmed] = useState<Set<string>>(() =>
    buildGardenConfirmed(shoppingItems, gardenPlants)
  );
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const [freshInv, freshPlants] = await Promise.all([
        loadInventoryItems(userId),
        loadGardenPlants(userId),
      ]);
      setInventoryItems(freshInv);
      setGardenPlants(freshPlants);
      setPantryConfirmed(buildConfirmed(shoppingItems, freshInv));
      setGardenConfirmed(buildGardenConfirmed(shoppingItems, freshPlants));
    } catch (e) {
      console.error('Refresh failed', e);
    }
    setRefreshing(false);
  };

  const handlePantryHaveIt = async (item: ShoppingListItem) => {
    setPantryConfirmed((prev) => new Set([...prev, item.id]));
    toggleShoppingItemChecked(item.id, true).catch(console.error);
    if (userId) {
      try {
        const saved = await upsertInventoryItem({
          user_id: userId,
          name: item.name.toLowerCase().trim(),
          category: item.ingredient_category === 'herbs_spices' ? 'herbs_spices' : 'pantry_dry_goods',
          location: 'pantry',
          quantity: item.quantity,
          unit: item.unit,
          min_quantity: 0,
          notes: null,
          added_date: new Date().toISOString().split('T')[0],
          depleted: false,
        });
        upsertStore(saved);
      } catch (e) {
        console.error('Failed to save to inventory', e);
      }
    }
  };

  const handlePantryNeedToBuy = (id: string) => {
    setPantryConfirmed((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };

  if (shoppingItems.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyTitle}>No shopping list yet</Text>
        <Text style={styles.emptyBody}>
          Plan the week first and your list will appear here, organised by category.
        </Text>
      </View>
    );
  }

  const itemsByCategory = CATEGORY_ORDER.reduce<Record<string, ShoppingListItem[]>>((acc, cat) => {
    const group = shoppingItems.filter((i) => (i.ingredient_category ?? 'produce') === cat);
    if (group.length > 0) acc[cat] = group;
    return acc;
  }, {});

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Shopping</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={refreshing}>
          {refreshing
            ? <ActivityIndicator size="small" color="#3B7A57" />
            : <Text style={styles.refreshText}>Refresh</Text>
          }
        </TouchableOpacity>
      </View>

      {CATEGORY_ORDER.map((cat) => {
        const items = itemsByCategory[cat];
        if (!items) return null;

        const hasPantrySwipe = cat === 'pantry_dry_goods' || cat === 'cans_preserves' || cat === 'oils_vinegars' || cat === 'condiments_sauces';

        return (
          <View key={cat} style={styles.section}>
            <Text style={styles.sectionTitle}>{CATEGORY_LABELS[cat]}</Text>

            {hasPantrySwipe && (
              <Text style={styles.sectionNote}>
                Swipe right if you already have it · Swipe left to buy
              </Text>
            )}
            {cat === 'herbs_spices' && items.some((i) => !gardenConfirmed.has(i.id) && !i.from_fridge) && (
              <Text style={styles.sectionNote}>
                Swipe right if you already have it · Swipe left to buy
              </Text>
            )}

            {items.map((item) => {
              const isGardenConfirmed = gardenConfirmed.has(item.id);
              const isPantryConfirmed = pantryConfirmed.has(item.id);
              const isPantrySwipeable = hasPantrySwipe || (cat === 'herbs_spices' && !isGardenConfirmed) || item.is_pantry_staple;

              // Garden-confirmed herb — static badge, no swipe (garden is source of truth)
              if (isGardenConfirmed) {
                return (
                  <View key={item.id} style={[styles.itemRow, styles.itemRowConfirmed]}>
                    <View style={[styles.leafBox, styles.leafBoxConfirmed]}>
                      <Text style={styles.confirmTick}>✓</Text>
                    </View>
                    <View style={styles.itemTextBlock}>
                      <Text style={[styles.itemName, styles.itemNameMuted]}>{item.name}</Text>
                      <Text style={styles.herbGardenNote}>From Your Garden</Text>
                    </View>
                  </View>
                );
              }

              // Fridge item — static badge, no interaction
              if (item.from_fridge) {
                return (
                  <View key={item.id} style={[styles.itemRow, styles.itemRowFridge]}>
                    <View style={styles.fridgeBox}>
                      <Text style={styles.fridgeTick}>✓</Text>
                    </View>
                    <Text style={[styles.itemName, styles.itemNameMuted]}>
                      {itemQuantityLabel(item)}
                    </Text>
                    <Text style={styles.fridgeBadge}>In Fridge</Text>
                  </View>
                );
              }

              // Pantry-style swipeable (including dried herbs/spices not from garden)
              if (isPantrySwipeable) {
                return (
                  <SwipeableRow
                    key={item.id}
                    item={item}
                    rightLabel="✓ Have It"
                    rightColor="#3B7A57"
                    onSwipeRight={() => handlePantryHaveIt(item)}
                    onSwipeLeft={() => handlePantryNeedToBuy(item.id)}
                  >
                    <View style={[styles.itemRow, isPantryConfirmed && styles.itemRowConfirmed]}>
                      <View style={[styles.pantryBox, isPantryConfirmed && styles.pantryBoxConfirmed]}>
                        {isPantryConfirmed && <Text style={styles.confirmTick}>✓</Text>}
                      </View>
                      <View style={styles.itemTextBlock}>
                        <Text style={[styles.itemName, isPantryConfirmed && styles.itemNameMuted]}>
                          {item.name}
                        </Text>
                        {isPantryConfirmed && (
                          <Text style={styles.pantryNote}>In Your Pantry</Text>
                        )}
                        {cat === 'herbs_spices' && item.herb_backup && !isPantryConfirmed && (
                          <Text style={styles.herbBackup}>If Unavailable: {item.herb_backup}</Text>
                        )}
                      </View>
                      {item.buy_timing === 'day_of' && !isPantryConfirmed && (
                        <Text style={styles.dayOfBadge}>Buy Fresh</Text>
                      )}
                    </View>
                  </SwipeableRow>
                );
              }

              // Regular item — checkbox
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => toggleShoppingItem(item.id)}
                >
                  <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                    {item.checked && <Text style={styles.checkTick}>✓</Text>}
                  </View>
                  <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                    {itemQuantityLabel(item)}
                  </Text>
                  {item.buy_timing === 'day_of' && !item.checked && (
                    <Text style={styles.dayOfBadge}>Buy fresh</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  content: { padding: 20, paddingTop: 60 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E' },
  refreshButton: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#F3F4F6', minWidth: 70, alignItems: 'center' },
  refreshText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 10, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },

  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  sectionNote: { fontSize: 12, color: '#9CA3AF', marginBottom: 10, lineHeight: 17 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
    backgroundColor: '#FAFAF8',
  },
  itemRowConfirmed: { backgroundColor: '#F0FDF4' },

  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#3B7A57', borderColor: '#3B7A57' },
  checkTick: { fontSize: 12, color: '#FFF', fontWeight: '700' },

  leafBox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  leafBoxConfirmed: { backgroundColor: '#D1FAE5', borderColor: '#059669' },

  pantryBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  pantryBoxConfirmed: { backgroundColor: '#D1FAE5', borderColor: '#3B7A57' },
  confirmTick: { fontSize: 11 },

  itemTextBlock: { flex: 1 },
  itemName: { fontSize: 15, color: '#1C1C1E' },
  itemNameChecked: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  itemNameMuted: { color: '#6B7280' },

  herbBackup: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  herbGardenNote: { fontSize: 12, color: '#059669', marginTop: 2, fontWeight: '500' },
  pantryNote: { fontSize: 12, color: '#3B7A57', marginTop: 2, fontWeight: '500' },

  dayOfBadge: {
    fontSize: 11, fontWeight: '600', color: '#92400E',
    backgroundColor: '#FEF3C7', paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 6,
  },

  itemRowFridge: { backgroundColor: '#F9FAFB' },
  fridgeBox: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: '#E5E7EB', borderWidth: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  fridgeTick: { fontSize: 12, color: '#9CA3AF', fontWeight: '700' },
  fridgeBadge: {
    fontSize: 11, fontWeight: '600', color: '#6B7280',
    backgroundColor: '#E5E7EB', paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 6,
  },

  swipeAction: {
    position: 'absolute', top: 0, bottom: 0,
    width: 120, justifyContent: 'center', alignItems: 'center',
  },
  swipeActionRight: { left: 0 },
  swipeActionLeft: { right: 0 },
  swipeActionText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});
