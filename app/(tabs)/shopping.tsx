// Shopping screen — category-based grocery list.
// Garden items are pre-confirmed from the garden tracker (source of truth).
// Dried spices/herbs not from the garden use the pantry "Have it" flow.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, PanResponder, ActivityIndicator, Modal, Alert,
  TextInput, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { upsertInventoryItem, toggleShoppingItemChecked, loadInventoryItems, loadGardenPlants, addAdHocShoppingItems, updateShoppingItem, deleteShoppingItems } from '../../lib/data';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { categorisePantryItems } from '../../lib/claude';
import type { ShoppingListItem, ItemCategory, Store } from '../../types';
import { toTitleCase } from '../../lib/titleCase';
import { normaliseIngredientName, findStashMatch, parseRecipeIngredients } from '../../lib/recipes';

type IngredientCategory = ShoppingListItem['ingredient_category'];

const CATEGORY_ORDER: IngredientCategory[] = [
  'meat_fish', 'dairy_eggs', 'produce', 'herbs_spices', 'bread_bakery',
  'pantry_dry_goods', 'cans_preserves', 'oils_vinegars', 'condiments_sauces',
  'beverages', 'alcohol', 'household',
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
  beverages:          'Beverages',
  alcohol:            'Alcohol',
  household:          'Household',
};

function itemQuantityLabel(item: ShoppingListItem): string {
  const name = toTitleCase(item.name);
  if (item.ingredient_category === 'herbs_spices' || item.is_pantry_staple) return name;
  return `${name} × ${item.quantity} ${item.unit}`.trim();
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
    updateShoppingItemInStore,
    removeShoppingItems,
    recipes, shoppingList, addShoppingItem,
  } = useAppStore();
  const insets = useSafeAreaInsets();

  const buildConfirmed = (items: typeof shoppingItems, inv: typeof inventoryItems) => {
    const confirmed = new Set<string>();
    items.forEach((item) => {
      // Don't auto-confirm pantry staples — they're on the list to be replenished
      if (item.is_pantry_staple) return;
      const normItem = normaliseIngredientName(item.name.toLowerCase().trim());
      if (inv.some((p) => normaliseIngredientName(p.name.toLowerCase().trim()) === normItem && !p.depleted)) {
        confirmed.add(item.id);
      }
    });
    return confirmed;
  };

  const buildGardenConfirmed = (items: typeof shoppingItems, plants: typeof gardenPlants) => {
    // Ready plants are always available
    const readyNames = new Set(
      plants.filter((p) => p.status === 'ready').map((p) => p.plant_name.toLowerCase().trim())
    );
    // Cut-and-come-again plants are available even while growing (you can always pick some)
    const cutAndComeNames = new Set(
      plants
        .filter((p) => p.is_cut_and_come_again && (p.status === 'growing' || p.status === 'planted'))
        .map((p) => p.plant_name.toLowerCase().trim())
    );
    // "fresh mint" → "mint", "fresh dill" → "dill" — strip fresh prefix only.
    // Do NOT use substring matching or "dried oregano" would match garden "oregano".
    const normalise = (n: string) => n.replace(/^fresh\s+/, '').trim();
    const confirmed = new Set<string>();
    items.forEach((item) => {
      const name = normalise(item.name.toLowerCase().trim());
      if (item.from_garden || readyNames.has(name) || cutAndComeNames.has(name)) {
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
  const [bulkVisible, setBulkVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<ShoppingListItem | null>(null);
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [clearingDone, setClearingDone] = useState(false);
  const [shopMode, setShopMode] = useState(false);

  const toggleShopMode = async () => {
    if (shopMode) {
      deactivateKeepAwake();
      setShopMode(false);
    } else {
      await activateKeepAwakeAsync();
      setShopMode(true);
    }
  };

  const handleDoneShopping = () => {
    const doneIds = shoppingItems
      .filter((i) => i.checked || pantryConfirmed.has(i.id) || gardenConfirmed.has(i.id) || i.from_fridge)
      .map((i) => i.id);
    if (doneIds.length === 0) {
      Alert.alert('Nothing to clear', 'Tick off items as you shop, then come back here to clear them.');
      return;
    }
    Alert.alert(
      'Done Shopping?',
      `Remove ${doneIds.length} completed item${doneIds.length === 1 ? '' : 's'} from your list? Anything you couldn't get will stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Done',
          style: 'destructive',
          onPress: async () => {
            setClearingDone(true);
            try {
              await deleteShoppingItems(doneIds);
              removeShoppingItems(doneIds);
            } catch (e) {
              console.error('Failed to clear done items', e);
              Alert.alert('Error', 'Could not clear items. Try again.');
            } finally {
              setClearingDone(false);
            }
          },
        },
      ]
    );
  };

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
          location: item.ingredient_category === 'herbs_spices' && item.name.toLowerCase().startsWith('fresh ') ? 'fridge' : 'pantry',
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
    toggleShoppingItemChecked(id, false).catch(console.error);
    updateShoppingItemInStore(id, { checked: false });
  };

  const handleExpandToRecipe = async (item: ShoppingListItem, recipe: typeof recipes[0]) => {
    if (!shoppingList || !recipe.ingredients) return;
    setExpandingId(item.id);
    try {
      const parsed = parseRecipeIngredients(recipe.ingredients);
      if (parsed.length === 0) return;
      const added = await addAdHocShoppingItems(shoppingList.id, parsed);
      added.forEach((i) => addShoppingItem(i));
      // Mark the original item checked (you're making it, not buying it)
      await toggleShoppingItemChecked(item.id, true);
      updateShoppingItemInStore(item.id, { checked: true });
    } catch (e) {
      console.error('Failed to expand recipe ingredients', e);
    } finally {
      setExpandingId(null);
    }
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
    <View style={styles.screenWrapper}>
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Shopping</Text>
        <View style={styles.headingButtons}>
          <TouchableOpacity style={styles.addButton} onPress={() => {
            if (!useAppStore.getState().shoppingList) {
              Alert.alert('No Shopping List', 'Plan the week first to create a shopping list.');
              return;
            }
            setBulkVisible(true);
          }}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color="#3B7A57" />
              : <Text style={styles.refreshText}>Refresh</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      <ShoppingBulkAddModal
        visible={bulkVisible}
        shoppingListId={useAppStore.getState().shoppingList?.id ?? null}
        onClose={() => setBulkVisible(false)}
        onSaved={(items) => { items.forEach((i) => useAppStore.getState().addShoppingItem(i)); setBulkVisible(false); }}
      />


      <ShoppingEditModal
        visible={editTarget !== null}
        item={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(id, updates) => {
          updateShoppingItemInStore(id, updates);
          setEditTarget(null);
        }}
      />

      {CATEGORY_ORDER.map((cat) => {
        const items = itemsByCategory[cat];
        if (!items) return null;

        const hasPantrySwipe = ['pantry_dry_goods','cans_preserves','oils_vinegars','condiments_sauces','beverages'].includes(cat);

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
              const isPantryConfirmed = pantryConfirmed.has(item.id) || item.checked;
              const isPantrySwipeable = hasPantrySwipe || (cat === 'herbs_spices' && !isGardenConfirmed) || item.is_pantry_staple;
              const isChecked = item.checked || isPantryConfirmed || isGardenConfirmed || item.from_fridge;
              const recipeMatch = !isChecked
                ? findStashMatch(item.name, recipes.filter((r) => !!r.ingredients), { strict: true })
                : null;
              // Recipe exists in stash but has no parsed ingredients — show a softer nudge
              const recipeMatchNoIngredients = !isChecked && !recipeMatch
                ? findStashMatch(item.name, recipes, { strict: true })
                : null;

              const recipeNudge = recipeMatch ? (
                <TouchableOpacity
                  style={styles.recipeNudge}
                  onPress={() => handleExpandToRecipe(item, recipeMatch)}
                  disabled={expandingId === item.id}
                >
                  {expandingId === item.id
                    ? <ActivityIndicator size="small" color="#0369A1" />
                    : <Text style={styles.recipeNudgeText}>
                        You have a recipe for {toTitleCase(recipeMatch.name)} — use your ingredients?
                      </Text>
                  }
                </TouchableOpacity>
              ) : recipeMatchNoIngredients ? (
                <View style={styles.recipeNudge}>
                  <Text style={styles.recipeNudgeText}>
                    You have a recipe for {toTitleCase(recipeMatchNoIngredients.name)} — add ingredients to it to expand your shopping list
                  </Text>
                </View>
              ) : null;

              // Garden-confirmed herb — static badge, no swipe (garden is source of truth)
              if (isGardenConfirmed) {
                return (
                  <View key={item.id}>
                    <TouchableOpacity onLongPress={() => setEditTarget(item)} delayLongPress={400} activeOpacity={1} style={[styles.itemRow, styles.itemRowConfirmed]}>
                      <View style={[styles.leafBox, styles.leafBoxConfirmed]}>
                        <Text style={styles.leafIcon}>🌿</Text>
                      </View>
                      <View style={styles.itemTextBlock}>
                        <Text style={[styles.itemName, styles.itemNameMuted]}>{toTitleCase(item.name)}</Text>
                        <Text style={styles.herbGardenNote}>From Your Garden</Text>
                      </View>
                    </TouchableOpacity>
                    {recipeNudge}
                  </View>
                );
              }

              // Fridge item — static badge, no interaction
              if (item.from_fridge) {
                return (
                  <View key={item.id}>
                    <TouchableOpacity onLongPress={() => setEditTarget(item)} delayLongPress={400} activeOpacity={1} style={[styles.itemRow, styles.itemRowFridge]}>
                      <View style={styles.fridgeBox}>
                        <Text style={styles.fridgeTick}>✓</Text>
                      </View>
                      <Text style={[styles.itemName, styles.itemNameMuted]}>
                        {itemQuantityLabel(item)}
                      </Text>
                      <Text style={styles.fridgeBadge}>In Fridge</Text>
                    </TouchableOpacity>
                    {recipeNudge}
                  </View>
                );
              }

              // Pantry-style swipeable (including dried herbs/spices not from garden)
              if (isPantrySwipeable) {
                return (
                  <View key={item.id}>
                    <SwipeableRow
                      item={item}
                      rightLabel="✓ Have It"
                      rightColor="#3B7A57"
                      onSwipeRight={() => handlePantryHaveIt(item)}
                      onSwipeLeft={() => handlePantryNeedToBuy(item.id)}
                    >
                      <TouchableOpacity
                        onPress={() => isPantryConfirmed ? handlePantryNeedToBuy(item.id) : handlePantryHaveIt(item)}
                        onLongPress={() => setEditTarget(item)}
                        delayLongPress={400}
                        activeOpacity={0.7}
                        style={[styles.itemRow, isPantryConfirmed && styles.itemRowConfirmed]}
                      >
                        <View style={[styles.pantryBox, isPantryConfirmed && styles.pantryBoxConfirmed]}>
                          {isPantryConfirmed && <Text style={styles.confirmTick}>✓</Text>}
                        </View>
                        <View style={styles.itemTextBlock}>
                          <Text style={[styles.itemName, isPantryConfirmed && styles.itemNameMuted]}>
                            {toTitleCase(item.name)}
                          </Text>
                          {isPantryConfirmed && (
                            <Text style={styles.pantryNote}>
                              {item.name.toLowerCase().startsWith('fresh ') ? 'In Your Fridge' : 'In Your Pantry'}
                            </Text>
                          )}
                          {cat === 'herbs_spices' && item.herb_backup && !isPantryConfirmed && (
                            <Text style={styles.herbBackup}>If Unavailable: {item.herb_backup}</Text>
                          )}
                        </View>
                        {item.buy_timing === 'day_of' && !isPantryConfirmed && (
                          <Text style={styles.dayOfBadge}>Buy Fresh</Text>
                        )}
                      </TouchableOpacity>
                    </SwipeableRow>
                    {recipeNudge}
                  </View>
                );
              }

              // Regular item — checkbox
              return (
                <View key={item.id}>
                  <TouchableOpacity
                    style={styles.itemRow}
                    onPress={() => toggleShoppingItem(item.id)}
                    onLongPress={() => setEditTarget(item)}
                    delayLongPress={400}
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
                  {recipeNudge}
                </View>
              );
            })}
          </View>
        );
      })}

      <View style={styles.bottomActions}>
        <TouchableOpacity style={[styles.shopModeBtn, shopMode && styles.shopModeBtnActive]} onPress={toggleShopMode}>
          <Text style={styles.shopModeBtnText}>{shopMode ? 'Shop Mode On ✓' : 'Shop Mode'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearDoneLink} onPress={handleDoneShopping} disabled={clearingDone}>
          {clearingDone
            ? <ActivityIndicator size="small" color="#EF4444" />
            : <Text style={styles.clearDoneLinkText}>Clear completed items</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  );
}

// ── Shopping bulk add modal ───────────────────────────────────────────────────

const CATEGORY_LABELS_SHORT: Record<ItemCategory, string> = {
  meat_fish: 'Meat & Fish', dairy_eggs: 'Dairy & Eggs', produce: 'Produce',
  bread_bakery: 'Bread & Bakery', pantry_dry_goods: 'Pantry & Dry Goods',
  herbs_spices: 'Herbs & Spices', cans_preserves: 'Cans & Preserves',
  oils_vinegars: 'Oils & Vinegars', condiments_sauces: 'Condiments & Sauces',
  beverages: 'Beverages', alcohol: 'Alcohol', household: 'Household',
};

const STORE_LABELS: Record<Store, string> = {
  grocer:       'Grocer',
  butcher:      'Butcher',
  supermarket:  'Supermarket',
  liquor_store: 'Liquor Store',
};

// ── Shopping edit modal ───────────────────────────────────────────────────────

function ShoppingEditModal({ visible, item, onClose, onSaved }: {
  visible: boolean;
  item: ShoppingListItem | null;
  onClose: () => void;
  onSaved: (id: string, updates: Partial<ShoppingListItem>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [store, setStore] = useState<Store>('supermarket');
  const [category, setCategory] = useState<ItemCategory>('produce');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setQuantity(String(item.quantity));
      setUnit(item.unit);
      setStore(item.store);
      setCategory(item.ingredient_category);
    }
  }, [item?.id]);

  const handleSave = async () => {
    if (!item || !name.trim()) return;
    setSaving(true);
    try {
      const updates: Partial<ShoppingListItem> = {
        name: name.trim(),
        quantity: parseFloat(quantity) || item.quantity,
        unit: unit.trim() || item.unit,
        store,
        ingredient_category: category,
      };
      await updateShoppingItem(item.id, updates);
      onSaved(item.id, updates);
    } catch (e) {
      Alert.alert('Save Failed', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={modalStyles.container}>
          <View style={[modalStyles.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={onClose}><Text style={modalStyles.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={modalStyles.title}>Edit Item</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[modalStyles.cancel, { color: '#3B7A57', fontWeight: '700' }]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={editStyles.label}>Name</Text>
              <TextInput
                style={editStyles.input}
                value={name}
                onChangeText={setName}
                autoCapitalize="none"
                returnKeyType="done"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={editStyles.label}>Quantity</Text>
                <TextInput
                  style={editStyles.input}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={editStyles.label}>Unit</Text>
                <TextInput
                  style={editStyles.input}
                  value={unit}
                  onChangeText={setUnit}
                  autoCapitalize="none"
                  returnKeyType="done"
                />
              </View>
            </View>
            <View>
              <Text style={editStyles.label}>Store</Text>
              <View style={editStyles.pillRow}>
                {(Object.entries(STORE_LABELS) as [Store, string][]).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[editStyles.pill, store === key && editStyles.pillActive]}
                    onPress={() => setStore(key)}
                  >
                    <Text style={[editStyles.pillText, store === key && editStyles.pillTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={editStyles.label}>Category</Text>
              <View style={editStyles.pillRow}>
                {(Object.entries(CATEGORY_LABELS_SHORT) as [ItemCategory, string][])
                  .filter(([key]) => key !== 'dairy_eggs')
                  .map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[editStyles.pill, category === key && editStyles.pillActive]}
                      onPress={() => setCategory(key)}
                    >
                      <Text style={[editStyles.pillText, category === key && editStyles.pillTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  pillActive: { backgroundColor: '#F0FDF4', borderColor: '#3B7A57' },
  pillText: { fontSize: 13, color: '#374151' },
  pillTextActive: { color: '#3B7A57', fontWeight: '600' },
});

// ── Shopping bulk add modal ───────────────────────────────────────────────────

function ShoppingBulkAddModal({ visible, shoppingListId, onClose, onSaved }: {
  visible: boolean;
  shoppingListId: string | null;
  onClose: () => void;
  onSaved: (items: ShoppingListItem[]) => void;
}) {
  const insets = useSafeAreaInsets();
  type Step = 'input' | 'categorising' | 'review';
  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [pending, setPending] = useState<{ id: string; name: string; category: ItemCategory }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setStep('input'); setText(''); setPending([]); setError(null); setSaving(false); };
  const handleClose = () => { reset(); onClose(); };

  const categorise = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setError('Enter at least one item.'); return; }
    setError(null);
    setStep('categorising');
    try {
      const results = await categorisePantryItems(lines);
      setPending(results.map((r, i) => ({
        id: `${i}-${Date.now()}`,
        name: r.name,
        category: (Object.keys(CATEGORY_LABELS_SHORT).includes(r.category) ? r.category : 'pantry_dry_goods') as ItemCategory,
      })));
      setStep('review');
    } catch (e: any) {
      setError(e?.message ?? 'Categorisation failed. Try again.');
      setStep('input');
    }
  };

  const saveAll = async () => {
    const valid = pending.filter((i) => i.name.trim());
    if (!valid.length || !shoppingListId) return;
    setSaving(true);
    try {
      const saved = await addAdHocShoppingItems(shoppingListId, valid.map((i) => ({ name: i.name, category: i.category })));
      onSaved(saved);
      reset();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message ?? 'Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={modalStyles.container}>
        <View style={[modalStyles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={handleClose}><Text style={modalStyles.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={modalStyles.title}>
            {step === 'input' ? 'Add Items' : step === 'categorising' ? 'Categorising…' : 'Review Items'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {step === 'input' && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'android' ? 80 : 0}>
            <ScrollView contentContainerStyle={modalStyles.inputStep} keyboardShouldPersistTaps="handled">
              <Text style={modalStyles.hint}>One item per line. AI will assign categories.</Text>
              <TextInput
                style={modalStyles.textArea}
                value={text}
                onChangeText={setText}
                multiline
                autoFocus
                placeholder={'olive oil\nchicken thighs\nsourdough bread'}
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                textAlignVertical="top"
              />
              {error && <Text style={modalStyles.error}>{error}</Text>}
              <TouchableOpacity
                style={[modalStyles.primaryButton, !text.trim() && { opacity: 0.4 }]}
                onPress={categorise}
                disabled={!text.trim()}
              >
                <Text style={modalStyles.primaryButtonText}>Categorise</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {step === 'categorising' && (
          <View style={modalStyles.centred}>
            <ActivityIndicator size="large" color="#3B7A57" />
            <Text style={modalStyles.hint}>Categorising your items…</Text>
          </View>
        )}

        {step === 'review' && (
          <>
            <Text style={modalStyles.reviewHint}>Adjust any categories before adding to your list.</Text>
            <FlatList
              data={pending}
              keyExtractor={(i) => i.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              renderItem={({ item }) => (
                <ShoppingPendingRow
                  item={item}
                  onChange={(cat) => setPending((prev) => prev.map((i) => i.id === item.id ? { ...i, category: cat } : i))}
                  onRemove={() => setPending((prev) => prev.filter((i) => i.id !== item.id))}
                />
              )}
              ListFooterComponent={
                <TouchableOpacity style={modalStyles.addManual}
                  onPress={() => setPending((prev) => [...prev, { id: `m-${Date.now()}`, name: '', category: 'pantry_dry_goods' }])}>
                  <Text style={modalStyles.addManualText}>+ Add Item</Text>
                </TouchableOpacity>
              }
            />
            <View style={modalStyles.saveRow}>
              <TouchableOpacity style={[modalStyles.primaryButton, saving && { opacity: 0.6 }]} onPress={saveAll} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={modalStyles.primaryButtonText}>Add {pending.filter((i) => i.name.trim()).length} Items to List</Text>
                }
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function ShoppingPendingRow({ item, onChange, onRemove }: {
  item: { id: string; name: string; category: ItemCategory };
  onChange: (cat: ItemCategory) => void;
  onRemove: () => void;
}) {
  const [catOpen, setCatOpen] = useState(false);
  return (
    <View style={modalStyles.pendingRow}>
      <Text style={modalStyles.pendingName}>{toTitleCase(item.name)}</Text>
      <View style={modalStyles.pendingMeta}>
        <TouchableOpacity style={[modalStyles.catPill, { flex: 1 }]} onPress={() => setCatOpen(!catOpen)}>
          <Text style={modalStyles.catPillText}>{CATEGORY_LABELS_SHORT[item.category]} ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove} style={modalStyles.removeButton}>
          <Text style={modalStyles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
      {catOpen && (
        <View style={modalStyles.dropdown}>
          {(Object.entries(CATEGORY_LABELS_SHORT) as [ItemCategory, string][]).map(([key, label]) => (
            <TouchableOpacity key={key} style={[modalStyles.dropdownOption, item.category === key && modalStyles.dropdownOptionActive]}
              onPress={() => { onChange(key); setCatOpen(false); }}>
              <Text style={[modalStyles.dropdownText, item.category === key && modalStyles.dropdownTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  cancel: { fontSize: 16, color: '#6B7280', width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  inputStep: { padding: 20, paddingBottom: 40 },
  hint: { fontSize: 15, color: '#6B7280', lineHeight: 22, marginBottom: 16 },
  textArea: { height: 260, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 15, color: '#111827' },
  error: { fontSize: 14, color: '#DC2626', marginTop: 12, textAlign: 'center' },
  primaryButton: { backgroundColor: '#3B7A57', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  reviewHint: { fontSize: 14, color: '#6B7280', paddingHorizontal: 16, paddingVertical: 12 },
  pendingRow: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  pendingName: { fontSize: 15, color: '#111827', fontWeight: '500', marginBottom: 8, textTransform: 'capitalize' },
  pendingMeta: { flexDirection: 'row', alignItems: 'center' },
  catPill: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  catPillText: { fontSize: 12, color: '#374151' },
  removeButton: { padding: 4, marginLeft: 8 },
  removeButtonText: { fontSize: 16, color: '#9CA3AF' },
  dropdown: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', marginTop: 4 },
  dropdownOption: { paddingHorizontal: 14, paddingVertical: 11 },
  dropdownOptionActive: { backgroundColor: '#F0FDF4' },
  dropdownText: { fontSize: 14, color: '#374151' },
  dropdownTextActive: { color: '#3B7A57', fontWeight: '600' },
  addManual: { borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  addManualText: { fontSize: 15, color: '#6B7280' },
  saveRow: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingBottom: 32 },
});

const styles = StyleSheet.create({
  screenWrapper: { flex: 1, backgroundColor: '#FAFAF8' },
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  content: { padding: 20 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1C1C1E' },
  headingButtons: { flexDirection: 'row', gap: 8 },
  addButton: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#3B7A57', alignItems: 'center' },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  bottomActions: { paddingTop: 24, paddingBottom: 8, gap: 12 },
  shopModeBtn: { backgroundColor: '#1C1C1E', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  shopModeBtnActive: { backgroundColor: '#3B7A57' },
  shopModeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  clearDoneLink: { alignItems: 'center', paddingVertical: 4 },
  clearDoneLinkText: { fontSize: 13, color: '#EF4444', fontWeight: '500' },
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
  leafIcon: { fontSize: 13 },

  itemTextBlock: { flex: 1 },
  itemName: { fontSize: 15, color: '#1C1C1E' },
  itemNameChecked: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  itemNameMuted: { color: '#6B7280' },

  herbBackup: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  recipeNudge: { paddingHorizontal: 14, paddingVertical: 8, marginBottom: 4 },
  recipeNudgeText: { fontSize: 13, color: '#0369A1', fontWeight: '500' },
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
