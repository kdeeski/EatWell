// Shopping screen — category-based grocery list.
// Garden items are pre-confirmed from the garden tracker (source of truth).
// Dried spices/herbs not from the garden use the pantry "Have it" flow.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, PanResponder, ActivityIndicator, Modal,
  TextInput, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { upsertInventoryItem, toggleShoppingItemChecked, loadInventoryItems, loadGardenPlants, addAdHocShoppingItems, updateShoppingItem, deleteShoppingItems, refreshConditionalItems } from '../../lib/data';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { categorisePantryItems } from '../../lib/claude';
import type { ShoppingListItem, ItemCategory, Store } from '../../types';
import { toTitleCase } from '../../lib/titleCase';
import { normaliseIngredientName, findStashMatch, parseRecipeIngredients } from '../../lib/recipes';
import { colors } from '../../constants/theme';
import { shared } from '../../constants/styles';
import FloatingModePill from '../../components/FloatingModePill';

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

// Correct category mistakes Claude makes on existing list items (applied at display
// time so old lists benefit without needing a replan).
const FORCE_MEAT_FISH_RE = /\b(fillet|steak|breast|thigh|mince|chicken|beef|lamb|pork|salmon|tuna|snapper|barramundi|cod|hake|prawn|shrimp|scallop|mussel|squid|octopus|anchov|sardine|mackerel|trout|bream|flathead|whiting)\b/i;
const FORCE_HERBS_SPICES_RE = /^(ground|smoked)\s+(cumin|coriander|turmeric|cardamom|nutmeg|allspice|paprika|fenugreek|mace|ginger|cinnamon|cloves?|black pepper|white pepper|chilli|chili)\b|^dried\s+(basil|parsley|mint|chives|dill|tarragon|chervil|sage|thyme|rosemary|oregano|marjoram|lemongrass|coriander|cilantro|bay\s+leaves?|mixed\s+herbs?|chilli|chili)\b|^fresh\s+(basil|parsley|mint|chives|dill|tarragon|chervil|sage|thyme|rosemary|oregano|marjoram|lemongrass|coriander|cilantro|kaffir|bay\s+leaf|bay\s+leaves)\b|^(cumin|coriander|turmeric|cardamom|nutmeg|allspice|paprika|fenugreek|mace|chilli|chili|ginger|cinnamon|sumac|star anise|fennel seeds|mustard seeds|caraway seeds|ras el hanout|za'atar|harissa|cloves|bay leaves|bay leaf|mixed spice|five spice|curry powder|garam masala|cajun seasoning|chinese five spice)$/i;

function correctedCategory(item: ShoppingListItem): IngredientCategory {
  const cat = item.ingredient_category ?? 'produce';
  const name = item.name.toLowerCase();
  if (FORCE_MEAT_FISH_RE.test(name)) return 'meat_fish';
  if (FORCE_HERBS_SPICES_RE.test(name)) return 'herbs_spices';
  return cat;
}

// Units that carry meaningful information even at qty=1 (measurements).
// Everything else at qty=1 (bottle, jar, bunch, pack, each, …) → just show name.
const MEASURED_UNITS = new Set(['g', 'kg', 'ml', 'l', 'oz', 'lb', 'cup', 'tsp', 'tbsp']);

function itemQuantityLabel(item: ShoppingListItem): string {
  const name = toTitleCase(item.name);
  if (item.ingredient_category === 'herbs_spices' || item.is_pantry_staple) return name;

  const unit = (item.unit ?? '').toLowerCase().trim();
  const isMeasured = MEASURED_UNITS.has(unit);

  // qty=1 with a container/count unit → just the name
  if (item.quantity === 1 && !isMeasured) return name;

  // qty>1: drop unit if it's each/piece/item/blank (already countable)
  const unitless = !unit || ['each', 'piece', 'item'].includes(unit);
  const qty = unitless ? `${item.quantity}` : `${item.quantity} ${item.unit}`;
  return `${name} × ${qty}`;
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
      <Animated.View style={[styles.swipeAction, styles.swipeActionLeft, { opacity: leftOpacity, backgroundColor: colors.state.infoBright }]}>
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
    // Pre-build normalised inventory names once for efficiency
    const invNorms = inv
      .filter((p) => !p.depleted)
      .map((p) => normaliseIngredientName(p.name.toLowerCase().trim()));

    items.forEach((item) => {
      // Don't auto-confirm ad-hoc items — they were explicitly added to buy
      if (item.is_adhoc) return;
      const normItem = normaliseIngredientName(item.name.toLowerCase().trim());
      const match = invNorms.some((invName) => {
        if (invName === normItem) return true;
        // Substring match for compound names ("tinned chickpeas" vs "chickpeas"),
        // but only when both sides are long enough to avoid false positives
        // ("oil" matching "olive oil", "onion" matching "spring onion").
        if (invName.length < 6 || normItem.length < 4) return false;
        return invName.includes(normItem) || normItem.includes(invName);
      });
      if (match) confirmed.add(item.id);
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
  const pantryInFlight = useRef<Set<string>>(new Set());
  const [gardenConfirmed, setGardenConfirmed] = useState<Set<string>>(() =>
    buildGardenConfirmed(shoppingItems, gardenPlants)
  );

  // Rebuild confirmed sets whenever the shopping list or inventory changes
  // (e.g. after a replan, the new item IDs won't match the old confirmed sets)
  useEffect(() => {
    setPantryConfirmed(buildConfirmed(shoppingItems, inventoryItems));
    setGardenConfirmed(buildGardenConfirmed(shoppingItems, gardenPlants));
  }, [shoppingItems, inventoryItems, gardenPlants]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSummary, setRefreshSummary] = useState<string[] | null>(null);
  const [bulkVisible, setBulkVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<ShoppingListItem | null>(null);
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [clearingDone, setClearingDone] = useState(false);
  const [shopMode, setShopMode] = useState(false);

  const toggleShopMode = async () => {
    if (shopMode) {
      if (Platform.OS !== 'web') deactivateKeepAwake();
      setShopMode(false);
    } else {
      if (Platform.OS !== 'web') await activateKeepAwakeAsync();
      setShopMode(true);
    }
  };

  const handleDoneShopping = () => {
    const doneIds = shoppingItems
      .filter((i) => i.checked || pantryConfirmed.has(i.id) || gardenConfirmed.has(i.id) || i.from_fridge || i.from_freezer)
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
    setRefreshSummary(null);
    try {
      const [freshInv, freshPlants, conditionalResult] = await Promise.all([
        loadInventoryItems(userId),
        loadGardenPlants(userId),
        refreshConditionalItems(userId, shoppingItems),
      ]);
      setInventoryItems(freshInv);
      setGardenPlants(freshPlants);

      if (conditionalResult.updatedIds.length > 0) {
        conditionalResult.updatedIds.forEach((id) =>
          updateShoppingItemInStore(id, {
            from_fridge: false,
            from_freezer: false,
            is_pantry_staple: false,
            checked: false,
            conditional_note: null,
            conditional_meal_ids: null,
          })
        );
        setRefreshSummary(conditionalResult.summaries);
      }

      setPantryConfirmed(buildConfirmed(shoppingItems, freshInv));
      setGardenConfirmed(buildGardenConfirmed(shoppingItems, freshPlants));
    } catch (e) {
      console.error('Refresh failed', e);
    }
    setRefreshing(false);
  };

  const handlePantryHaveIt = async (item: ShoppingListItem) => {
    if (pantryInFlight.current.has(item.id)) return;
    pantryInFlight.current.add(item.id);
    setPantryConfirmed((prev) => new Set([...prev, item.id]));
    updateShoppingItemInStore(item.id, { checked: true }); // keeps item confirmed if useEffect rebuilds pantryConfirmed
    toggleShoppingItemChecked(item.id, true).catch(console.error);
    if (userId) {
      try {
        const fridgeCats: ShoppingListItem['ingredient_category'][] = [
          'produce', 'meat_fish', 'dairy_eggs', 'bread_bakery',
        ];
        const loc = fridgeCats.includes(item.ingredient_category) ||
          item.name.toLowerCase().startsWith('fresh ')
          ? 'fridge' : 'pantry';
        const saved = await upsertInventoryItem({
          user_id: userId,
          name: item.name.trim(),
          category: item.ingredient_category ?? 'pantry_dry_goods',
          location: loc,
          quantity: item.quantity,
          unit: item.unit,
          min_quantity: 0,
          notes: null,
          added_date: new Date().toISOString().split('T')[0],
          depleted: false,
          is_staple: false,
        });
        upsertStore(saved);
      } catch (e) {
        console.error('Failed to save to inventory', e);
      } finally {
        pantryInFlight.current.delete(item.id);
      }
    } else {
      pantryInFlight.current.delete(item.id);
    }
  };

  const handlePantryNeedToBuy = (id: string) => {
    setPantryConfirmed((prev) => { const s = new Set(prev); s.delete(id); return s; });
    toggleShoppingItemChecked(id, false).catch(console.error);
    updateShoppingItemInStore(id, { checked: false });
  };

  // Handles checkbox tap for regular (non-pantry) items — produce, meat, dairy, etc.
  // Persists to DB and adds to fridge inventory when checking off.
  const handleBoughtItem = async (item: ShoppingListItem) => {
    const nowChecked = !item.checked;
    toggleShoppingItem(item.id); // immediate local feedback
    toggleShoppingItemChecked(item.id, nowChecked).catch(console.error);
    if (nowChecked && userId) {
      const fridgeCats: ShoppingListItem['ingredient_category'][] = [
        'produce', 'meat_fish', 'dairy_eggs', 'bread_bakery',
      ];
      const loc = fridgeCats.includes(item.ingredient_category) ||
        item.name.toLowerCase().startsWith('fresh ')
        ? 'fridge' : 'pantry';
      try {
        const saved = await upsertInventoryItem({
          user_id: userId,
          name: item.name.trim(),
          category: item.ingredient_category,
          location: loc,
          quantity: item.quantity,
          unit: item.unit,
          min_quantity: 0,
          notes: null,
          added_date: new Date().toISOString().split('T')[0],
          depleted: false,
          is_staple: false,
        });
        upsertStore(saved);
      } catch (e) {
        console.error('Failed to save bought item to inventory', e);
      }
    }
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
    const group = shoppingItems.filter((i) => correctedCategory(i) === cat);
    if (group.length > 0) acc[cat] = group;
    return acc;
  }, {});

  return (
    <View style={styles.screenWrapper}>
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}>
      <View style={[shared.headerBar, { marginBottom: 24, paddingHorizontal: 0, paddingTop: 0 }]}>
        <Text style={shared.headerTitle}>Shopping</Text>
        <View style={shared.headerButtons}>
          <TouchableOpacity style={shared.btnFilled} onPress={() => {
            if (!useAppStore.getState().shoppingList) {
              Alert.alert('No Shopping List', 'Plan the week first to create a shopping list.');
              return;
            }
            setBulkVisible(true);
          }}>
            <Text style={shared.btnFilledText}>+ Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={shared.btnOutline} onPress={handleRefresh} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color={colors.brand.primary} />
              : <Text style={shared.btnOutlineText}>Refresh</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {refreshSummary && refreshSummary.length > 0 && (
        <View style={styles.refreshBanner}>
          <View style={styles.refreshBannerHeader}>
            <Text style={styles.refreshBannerTitle}>Updated Items</Text>
            <TouchableOpacity onPress={() => setRefreshSummary(null)}>
              <Text style={styles.refreshBannerDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
          {refreshSummary.map((msg, i) => (
            <Text key={i} style={styles.refreshBannerText}>• {msg}</Text>
          ))}
        </View>
      )}

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
            {cat === 'herbs_spices' && items.some((i) => !gardenConfirmed.has(i.id) && !i.from_fridge && !i.from_freezer) && (
              <Text style={styles.sectionNote}>
                Swipe right if you already have it · Swipe left to buy
              </Text>
            )}

            <View style={styles.sectionCard}>
            {items.map((item) => {
              const isGardenConfirmed = gardenConfirmed.has(item.id);
              const isPantryConfirmed = pantryConfirmed.has(item.id) || item.checked;
              const isPantrySwipeable = hasPantrySwipe || (cat === 'herbs_spices' && !isGardenConfirmed) || item.is_pantry_staple;
              const isChecked = item.checked || isPantryConfirmed || isGardenConfirmed || item.from_fridge || item.from_freezer;
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
                    ? <ActivityIndicator size="small" color={colors.state.info} />
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

              // Fridge/freezer item — static badge, no interaction
              if (item.from_fridge || item.from_freezer) {
                return (
                  <View key={item.id}>
                    <TouchableOpacity onLongPress={() => setEditTarget(item)} delayLongPress={400} activeOpacity={1} style={[styles.itemRow, styles.itemRowFridge]}>
                      <View style={styles.fridgeBox}>
                        <Text style={styles.fridgeTick}>✓</Text>
                      </View>
                      <View style={styles.itemTextBlock}>
                        <Text style={[styles.itemName, styles.itemNameMuted]}>
                          {itemQuantityLabel(item)}
                        </Text>
                        {item.conditional_note && (
                          <Text style={styles.conditionalNote}>{item.conditional_note}</Text>
                        )}
                      </View>
                      <Text style={styles.fridgeBadge}>{item.from_freezer ? 'In Freezer' : 'In Fridge'}</Text>
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
                      rightColor={colors.brand.primary}
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
                          {item.conditional_note && !isPantryConfirmed && (
                            <Text style={styles.conditionalNote}>{item.conditional_note}</Text>
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
                    onPress={() => handleBoughtItem(item)}
                    onLongPress={() => setEditTarget(item)}
                    delayLongPress={400}
                  >
                    <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                      {item.checked && <Text style={styles.checkTick}>✓</Text>}
                    </View>
                    <View style={styles.itemTextBlock}>
                      <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                        {itemQuantityLabel(item)}
                      </Text>
                      {item.conditional_note && !item.checked && (
                        <Text style={styles.conditionalNote}>{item.conditional_note}</Text>
                      )}
                    </View>
                    {item.buy_timing === 'day_of' && !item.checked && (
                      <Text style={styles.dayOfBadge}>Buy fresh</Text>
                    )}
                  </TouchableOpacity>
                  {recipeNudge}
                </View>
              );
            })}
            </View>
          </View>
        );
      })}

      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.clearDoneLink} onPress={handleDoneShopping} disabled={clearingDone}>
          {clearingDone
            ? <ActivityIndicator size="small" color={colors.state.dangerBright} />
            : <Text style={styles.clearDoneLinkText}>Clear completed items</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
    <FloatingModePill
      label="Shop Mode"
      activeLabel="Shop Mode On"
      active={shopMode}
      onPress={toggleShopMode}
      bottom={24}
    />
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
      setName(toTitleCase(item.name));
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
          <View style={[modalStyles.header, { paddingTop: insets.top + 8 }]}>
            <View style={modalStyles.headerTopRow}>
              <TouchableOpacity onPress={onClose}><Text style={modalStyles.headerClose}>×</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[modalStyles.headerActionText, saving && { opacity: 0.5 }]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={modalStyles.title}>Edit Item</Text>
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
  label: { fontSize: 13, fontWeight: '600', color: colors.text.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.background.surface, borderWidth: 1, borderColor: colors.border.default, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text.primary },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.default },
  pillActive: { backgroundColor: colors.brand.primary + '22', borderColor: colors.brand.primary },
  pillText: { fontSize: 13, color: colors.text.secondary },
  pillTextActive: { color: colors.brand.primary, fontWeight: '600' },
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
        <View style={[modalStyles.header, { paddingTop: insets.top + 8 }]}>
          <View style={modalStyles.headerTopRow}>
            <TouchableOpacity onPress={handleClose}><Text style={modalStyles.headerClose}>×</Text></TouchableOpacity>
            {step === 'input' ? (
              <TouchableOpacity onPress={categorise} disabled={!text.trim()}>
                <Text style={[modalStyles.headerActionText, !text.trim() && { opacity: 0.4 }]}>Go</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
          </View>
          <Text style={modalStyles.title}>
            {step === 'input' ? 'Add Items' : step === 'categorising' ? 'Categorising…' : 'Review Items'}
          </Text>
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
                placeholderTextColor={colors.text.placeholder}
                autoCapitalize="none"
                textAlignVertical="top"
              />
              {error && <Text style={modalStyles.error}>{error}</Text>}
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {step === 'categorising' && (
          <View style={modalStyles.centred}>
            <ActivityIndicator size="large" color={colors.brand.primary} />
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
                  ? <ActivityIndicator color={colors.text.inverse} />
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
  container: { flex: 1, backgroundColor: colors.background.app },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerClose: { fontSize: 28, color: colors.text.muted, fontWeight: '300', lineHeight: 28 },
  headerActionText: { fontSize: 16, color: colors.text.link, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text.primary },
  inputStep: { padding: 20, paddingBottom: 40 },
  hint: { fontSize: 15, color: colors.text.muted, lineHeight: 22, marginBottom: 16 },
  textArea: { height: 260, backgroundColor: colors.background.surface, borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, padding: 14, fontSize: 15, color: colors.text.primary },
  error: { fontSize: 14, color: colors.state.danger, marginTop: 12, textAlign: 'center' },
  primaryButton: { backgroundColor: colors.brand.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  reviewHint: { fontSize: 14, color: colors.text.muted, paddingHorizontal: 16, paddingVertical: 12 },
  pendingRow: { backgroundColor: colors.background.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border.default },
  pendingName: { fontSize: 15, color: colors.text.primary, fontWeight: '500', marginBottom: 8, textTransform: 'capitalize' },
  pendingMeta: { flexDirection: 'row', alignItems: 'center' },
  catPill: { backgroundColor: colors.background.elevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  catPillText: { fontSize: 12, color: colors.text.secondary },
  removeButton: { padding: 4, marginLeft: 8 },
  removeButtonText: { fontSize: 16, color: colors.text.placeholder },
  dropdown: { backgroundColor: colors.background.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, overflow: 'hidden', marginTop: 4 },
  dropdownOption: { paddingHorizontal: 14, paddingVertical: 11 },
  dropdownOptionActive: { backgroundColor: colors.brand.primaryLighter },
  dropdownText: { fontSize: 14, color: colors.text.secondary },
  dropdownTextActive: { color: colors.text.link, fontWeight: '600' },
  addManual: { borderWidth: 1, borderColor: colors.border.default, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  addManualText: { fontSize: 15, color: colors.text.muted },
  saveRow: { padding: 16, backgroundColor: colors.background.surface, borderTopWidth: 1, borderTopColor: colors.border.hairline, paddingBottom: 32 },
});

const styles = StyleSheet.create({
  screenWrapper: { flex: 1, backgroundColor: colors.background.app },
  container: { flex: 1, backgroundColor: colors.background.app },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  content: { padding: 20 },
  bottomActions: { paddingTop: 24, paddingBottom: 8, gap: 12 },
  clearDoneLink: { alignItems: 'center', paddingVertical: 4 },
  clearDoneLinkText: { fontSize: 13, color: colors.state.dangerBright, fontWeight: '500' },

  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text.primary, marginBottom: 10, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: colors.text.muted, textAlign: 'center', lineHeight: 22 },

  section: { marginBottom: 28 },
  sectionCard: {
    backgroundColor: colors.background.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.hairline,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text.primary, marginBottom: 4 },
  sectionNote: { fontSize: 12, color: colors.text.placeholder, marginBottom: 10, lineHeight: 17 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.hairline,
    gap: 12,
    backgroundColor: colors.background.surface,
  },
  itemRowConfirmed: { backgroundColor: colors.brand.primaryLighter },

  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  checkTick: { fontSize: 12, color: colors.text.inverse, fontWeight: '700' },

  leafBox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  leafBoxConfirmed: { backgroundColor: colors.brand.primaryLight, borderColor: colors.brand.olive },

  pantryBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: colors.border.default,
    alignItems: 'center', justifyContent: 'center',
  },
  pantryBoxConfirmed: { backgroundColor: colors.brand.primaryLight, borderColor: colors.brand.primary },
  confirmTick: { fontSize: 11 },
  leafIcon: { fontSize: 13 },

  itemTextBlock: { flex: 1 },
  itemName: { fontSize: 15, color: colors.text.primary },
  itemNameChecked: { color: colors.text.placeholder, textDecorationLine: 'line-through' },
  itemNameMuted: { color: colors.text.muted },

  herbBackup: { fontSize: 12, color: colors.text.placeholder, marginTop: 2 },
  conditionalNote: { fontSize: 12, color: colors.state.warningDark, marginTop: 2, fontStyle: 'italic' },

  refreshBanner: { backgroundColor: colors.state.warningLighter, borderWidth: 1, borderColor: colors.state.warningBorder, borderRadius: 10, padding: 14, marginBottom: 20 },
  refreshBannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  refreshBannerTitle: { fontSize: 14, fontWeight: '700', color: colors.state.warningDark },
  refreshBannerDismiss: { fontSize: 16, color: colors.text.placeholder, paddingLeft: 8 },
  refreshBannerText: { fontSize: 13, color: colors.state.warningDark, lineHeight: 20 },

  recipeNudge: { paddingHorizontal: 14, paddingVertical: 8, marginBottom: 4 },
  recipeNudgeText: { fontSize: 13, color: colors.state.info, fontWeight: '500' },
  herbGardenNote: { fontSize: 12, color: colors.brand.olive, marginTop: 2, fontWeight: '500' },
  pantryNote: { fontSize: 12, color: colors.text.link, marginTop: 2, fontWeight: '500' },

  dayOfBadge: {
    fontSize: 11, fontWeight: '600', color: colors.state.warningDark,
    backgroundColor: colors.state.warningSoft, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 6,
  },

  itemRowFridge: { backgroundColor: colors.background.elevated },
  fridgeBox: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: colors.border.default, borderWidth: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  fridgeTick: { fontSize: 12, color: colors.text.placeholder, fontWeight: '700' },
  fridgeBadge: {
    fontSize: 11, fontWeight: '600', color: colors.text.muted,
    backgroundColor: colors.border.default, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 6,
  },

  swipeAction: {
    position: 'absolute', top: 0, bottom: 0,
    width: 120, justifyContent: 'center', alignItems: 'center',
  },
  swipeActionRight: { left: 0 },
  swipeActionLeft: { right: 0 },
  swipeActionText: { color: colors.text.inverse, fontWeight: '700', fontSize: 13 },
});
