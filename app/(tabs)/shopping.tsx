// Shopping screen — category-based grocery list with swipe-to-confirm for herbs and pantry items.

import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, PanResponder,
} from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { addPantryItem, toggleShoppingItemChecked } from '../../lib/data';
import type { ShoppingListItem } from '../../types';

type IngredientCategory = ShoppingListItem['ingredient_category'];

const CATEGORY_ORDER: IngredientCategory[] = [
  'meat_fish', 'produce', 'fresh_herbs', 'pantry_dry_goods', 'bread_bakery',
];

const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  meat_fish: 'Meat & Fish',
  produce: 'Produce',
  fresh_herbs: 'Fresh Herbs',
  pantry_dry_goods: 'Pantry & Dry Goods',
  bread_bakery: 'Bread & Bakery',
};

function itemQuantityLabel(item: ShoppingListItem): string {
  if (item.ingredient_category === 'fresh_herbs' || item.is_pantry_staple) return item.name;
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
  const { shoppingItems, toggleShoppingItem, userId, pantryItems, addPantryItemToStore } = useAppStore();
  // Track herb "from garden" state locally
  const [gardenHerbs, setGardenHerbs] = useState<Set<string>>(() => {
    const fromGarden = new Set<string>();
    shoppingItems.forEach((item) => {
      if (item.ingredient_category === 'fresh_herbs' && item.from_garden) {
        fromGarden.add(item.id);
      }
    });
    return fromGarden;
  });
  // Pre-confirm any pantry/herb items whose names match saved pantry inventory
  const [pantryConfirmed, setPantryConfirmed] = useState<Set<string>>(() => {
    const confirmed = new Set<string>();
    shoppingItems.forEach((item) => {
      if (pantryItems.some((p) => p.name === item.name.toLowerCase().trim())) {
        confirmed.add(item.id);
      }
    });
    return confirmed;
  });

  const handleHerbFromGarden = (id: string) => {
    setGardenHerbs((prev) => new Set([...prev, id]));
    // Mark as checked in DB
    toggleShoppingItemChecked(id, true).catch(console.error);
    toggleShoppingItem(id);
  };

  const handleHerbNeedToBuy = (id: string) => {
    setGardenHerbs((prev) => { const s = new Set(prev); s.delete(id); return s; });
    toggleShoppingItemChecked(id, false).catch(console.error);
  };

  const handlePantryHaveIt = async (item: ShoppingListItem) => {
    setPantryConfirmed((prev) => new Set([...prev, item.id]));
    toggleShoppingItemChecked(item.id, true).catch(console.error);
    if (userId) {
      try {
        const saved = await addPantryItem(userId, item.name, 'dry_goods', 'shopping');
        addPantryItemToStore(saved);
      } catch (e) {
        console.error('Failed to save pantry item', e);
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
      <Text style={styles.heading}>Shopping</Text>

      {CATEGORY_ORDER.map((cat) => {
        const items = itemsByCategory[cat];
        if (!items) return null;

        return (
          <View key={cat} style={styles.section}>
            <Text style={styles.sectionTitle}>{CATEGORY_LABELS[cat]}</Text>

            {cat === 'fresh_herbs' && (
              <Text style={styles.sectionNote}>
                Swipe right if growing in your garden · Swipe left to buy
              </Text>
            )}
{cat === 'pantry_dry_goods' && (
              <Text style={styles.sectionNote}>
                Swipe right if you already have it · Swipe left to buy
              </Text>
            )}

            {items.map((item) => {
              const isHerb = cat === 'fresh_herbs';
              const isPantry = cat === 'pantry_dry_goods' || item.is_pantry_staple;
              const isFromGarden = gardenHerbs.has(item.id);
              const isPantryConfirmed = pantryConfirmed.has(item.id);
              const isHaveIt = isFromGarden || isPantryConfirmed;

              if (isHerb || isPantry) {
                return (
                  <SwipeableRow
                    key={item.id}
                    item={item}
                    rightLabel={isHerb ? '🌿 From Garden' : '✓ Have It'}
                    rightColor={isHerb ? '#059669' : '#3B7A57'}
                    onSwipeRight={() => isHerb ? handleHerbFromGarden(item.id) : handlePantryHaveIt(item)}
                    onSwipeLeft={() => isHerb ? handleHerbNeedToBuy(item.id) : handlePantryNeedToBuy(item.id)}
                  >
                    <View style={[styles.itemRow, isHaveIt && styles.itemRowConfirmed]}>
                      <View style={[
                        isHerb ? styles.leafBox : styles.pantryBox,
                        isHaveIt && (isHerb ? styles.leafBoxConfirmed : styles.pantryBoxConfirmed),
                      ]}>
                        {isHaveIt && <Text style={styles.confirmTick}>{isHerb ? '🌿' : '✓'}</Text>}
                      </View>
                      <View style={styles.itemTextBlock}>
                        <Text style={[styles.itemName, isHaveIt && styles.itemNameMuted]}>
                          {item.name}
                        </Text>
                        {isHerb && item.herb_backup && !isFromGarden && (
                          <Text style={styles.herbBackup}>If Unavailable: {item.herb_backup}</Text>
                        )}
                        {isHerb && isFromGarden && (
                          <Text style={styles.herbGardenNote}>From Your Garden</Text>
                        )}
                        {isPantry && isPantryConfirmed && (
                          <Text style={styles.pantryNote}>In Your Pantry</Text>
                        )}
                      </View>
                      {item.buy_timing === 'day_of' && !isHaveIt && (
                        <Text style={styles.dayOfBadge}>Buy Fresh</Text>
                      )}
                    </View>
                  </SwipeableRow>
                );
              }

              // Fridge item — shown greyed with "In fridge" badge, no tap needed
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

              // Regular item — just a checkbox
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
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E', marginBottom: 24 },

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
