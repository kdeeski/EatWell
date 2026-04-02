// Pantry screen — unified inventory. Location separates WHERE from WHAT.
// Swipe right to replenish (→ shopping list). Swipe left to remove.

import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, TextInput, Alert,
  KeyboardAvoidingView, Platform, FlatList,
  Animated, PanResponder, StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../../store/useAppStore';
import { analysePantryPhotos } from '../../lib/claude';
import { upsertInventoryItem, saveStocktakeItems, removeInventoryItem, addAdHocShoppingItem } from '../../lib/data';
import type { ItemCategory, ItemLocation, InventoryItem } from '../../types';

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORIES: { key: ItemCategory; label: string; emoji: string }[] = [
  { key: 'meat_fish',        label: 'Meat & Fish',         emoji: '🥩' },
  { key: 'dairy_eggs',       label: 'Dairy & Eggs',        emoji: '🥛' },
  { key: 'produce',          label: 'Produce',             emoji: '🥦' },
  { key: 'bread_bakery',     label: 'Bread & Bakery',      emoji: '🍞' },
  { key: 'pantry_dry_goods', label: 'Pantry & Dry Goods',  emoji: '🫙' },
  { key: 'herbs_spices',     label: 'Herbs & Spices',      emoji: '🌿' },
  { key: 'cans_preserves',   label: 'Cans & Preserves',    emoji: '🥫' },
  { key: 'oils_vinegars',    label: 'Oils & Vinegars',     emoji: '🫒' },
  { key: 'condiments_sauces',label: 'Condiments & Sauces', emoji: '🧴' },
];

const LOCATIONS: { key: ItemLocation; label: string; emoji: string }[] = [
  { key: 'fridge',  label: 'Fridge',  emoji: '❄️' },
  { key: 'freezer', label: 'Freezer', emoji: '🧊' },
  { key: 'pantry',  label: 'Pantry',  emoji: '🗄️' },
  { key: 'garden',  label: 'Garden',  emoji: '🌿' },
];

const UNITS = ['g', 'kg', 'ml', 'l', 'bunch', 'pack', 'piece', 'jar', 'can'];

const CAT_LABEL: Record<ItemCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label])
) as Record<ItemCategory, string>;

const CAT_EMOJI: Record<ItemCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.emoji])
) as Record<ItemCategory, string>;

const LOC_LABEL: Record<ItemLocation, string> = Object.fromEntries(
  LOCATIONS.map((l) => [l.key, l.label])
) as Record<ItemLocation, string>;

const LOC_EMOJI: Record<ItemLocation, string> = Object.fromEntries(
  LOCATIONS.map((l) => [l.key, l.emoji])
) as Record<ItemLocation, string>;

// ─── Pending item (stocktake review) ─────────────────────────────────────────

interface PendingItem {
  id: string;
  name: string;
  category: ItemCategory;
  location: ItemLocation;
  notes: string | null;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type LocationFilter = 'all' | ItemLocation;

export default function PantryScreen() {
  const { userId, inventoryItems, upsertInventoryItem: upsertStore, removeInventoryItem: removeFromStore,
          shoppingList, addShoppingItem } = useAppStore();

  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [addVisible, setAddVisible] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [stocktakeVisible, setStocktakeVisible] = useState(false);

  const filtered = inventoryItems.filter(
    (i) => !i.depleted && (locationFilter === 'all' || i.location === locationFilter)
  );

  const grouped = CATEGORIES.map((c) => ({
    ...c,
    items: filtered.filter((i) => i.category === c.key),
  })).filter((g) => g.items.length > 0);

  const handleReplenish = async (item: InventoryItem) => {
    if (!shoppingList) {
      Alert.alert('No Shopping List', 'Plan the week first to create a shopping list.');
      return;
    }
    try {
      const saved = await addAdHocShoppingItem(shoppingList.id, item.name, item.category);
      addShoppingItem(saved);
      Alert.alert('Added to Shopping List', `${item.name} added.`);
    } catch (e: any) {
      Alert.alert('Could Not Add', e.message ?? 'Please try again.');
    }
  };

  const handleRemove = async (item: InventoryItem) => {
    try {
      await removeInventoryItem(item.id);
      removeFromStore(item.id);
    } catch {
      Alert.alert('Error', 'Could not remove item.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Pantry</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.addButton} onPress={() => { setEditItem(null); setAddVisible(true); }}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stocktakeButton} onPress={() => setStocktakeVisible(true)}>
            <Text style={styles.stocktakeButtonText}>Stocktake</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Location filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        {[{ key: 'all', label: 'All', emoji: '📋' }, ...LOCATIONS].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterPill, locationFilter === f.key && styles.filterPillActive]}
            onPress={() => setLocationFilter(f.key as LocationFilter)}
          >
            <Text style={[styles.filterPillText, locationFilter === f.key && styles.filterPillTextActive]}>
              {f.emoji}  {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>
            Tap "+ Add" to add items manually, or use Stocktake to photograph your shelves.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.swipeHint}>Swipe right to replenish · Swipe left to remove</Text>
          {grouped.map(({ key, label, emoji, items }) => (
            <View key={key} style={styles.section}>
              <Text style={styles.sectionHeader}>{emoji}  {label}</Text>
              {items.map((item) => (
                <InventoryRow
                  key={item.id}
                  item={item}
                  onReplenish={() => handleReplenish(item)}
                  onRemove={() => handleRemove(item)}
                  onEdit={() => { setEditItem(item); setAddVisible(true); }}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add / Edit modal */}
      <AddEditModal
        key={editItem?.id ?? 'new'}
        visible={addVisible}
        userId={userId!}
        existingItem={editItem}
        onClose={() => { setAddVisible(false); setEditItem(null); }}
        onSaved={(item) => { upsertStore(item); setAddVisible(false); setEditItem(null); }}
      />

      {/* Stocktake modal */}
      <StocktakeModal
        visible={stocktakeVisible}
        userId={userId!}
        onClose={() => setStocktakeVisible(false)}
        onSaved={(saved) => { saved.forEach((i) => upsertStore(i)); setStocktakeVisible(false); }}
      />
    </View>
  );
}

// ─── Swipeable inventory row ──────────────────────────────────────────────────

function InventoryRow({ item, onReplenish, onRemove, onEdit }: {
  item: InventoryItem;
  onReplenish: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const THRESHOLD = 80;
  const isLowStock = item.min_quantity > 0 && item.quantity < item.min_quantity;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8,
      onPanResponderMove: (_, { dx }) => translateX.setValue(dx),
      onPanResponderRelease: (_, { dx }) => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        if (dx > THRESHOLD) onReplenish();
        else if (dx < -THRESHOLD) onRemove();
      },
    })
  ).current;

  const rightOpacity = translateX.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const leftOpacity  = translateX.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={{ overflow: 'hidden', marginBottom: 6 }}>
      <Animated.View style={[styles.swipeBg, styles.swipeBgRight, { opacity: rightOpacity }]}>
        <Text style={styles.swipeBgText}>Replenish</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeBg, styles.swipeBgLeft, { opacity: leftOpacity }]}>
        <Text style={styles.swipeBgText}>Remove</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity style={[styles.itemRow, isLowStock && styles.itemRowLowStock]} onPress={onEdit} activeOpacity={0.7}>
          <View style={styles.itemLeft}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemMeta}>
              {item.quantity} {item.unit}
              {isLowStock && <Text style={styles.lowStockText}>  · Low stock</Text>}
            </Text>
          </View>
          <View style={styles.locationBadge}>
            <Text style={styles.locationBadgeText}>
              {LOC_EMOJI[item.location]}  {LOC_LABEL[item.location]}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

function AddEditModal({ visible, userId, existingItem, onClose, onSaved }: {
  visible: boolean;
  userId: string;
  existingItem: InventoryItem | null;
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
}) {
  const defaultLocation = (cat: ItemCategory): ItemLocation => {
    if (cat === 'meat_fish' || cat === 'dairy_eggs' || cat === 'produce') return 'fridge';
    return 'pantry';
  };

  const [name, setName]           = useState(existingItem?.name ?? '');
  const [category, setCategory]   = useState<ItemCategory>(existingItem?.category ?? 'pantry_dry_goods');
  const [location, setLocation]   = useState<ItemLocation>(
    existingItem?.location ?? defaultLocation(existingItem?.category ?? 'pantry_dry_goods')
  );
  const [quantity, setQuantity]   = useState(String(existingItem?.quantity ?? '1'));
  const [unit, setUnit]           = useState(existingItem?.unit ?? 'piece');
  const [minQty, setMinQty]       = useState(String(existingItem?.min_quantity ?? '0'));
  const [notes, setNotes]         = useState(existingItem?.notes ?? '');
  const [saving, setSaving]       = useState(false);
  const [catOpen, setCatOpen]     = useState(false);
  const [locOpen, setLocOpen]     = useState(false);
  const [unitOpen, setUnitOpen]   = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const saved = await upsertInventoryItem({
        ...(existingItem ? { id: existingItem.id } : {}),
        user_id: userId,
        name: name.trim().toLowerCase(),
        category,
        location,
        quantity: parseFloat(quantity) || 0,
        unit,
        min_quantity: parseFloat(minQty) || 0,
        notes: notes.trim() || null,
        added_date: new Date().toISOString().split('T')[0],
        depleted: false,
      });
      onSaved(saved);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save item.');
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.modalContainer} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{existingItem ? 'Edit Item' : 'Add Item'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={!name.trim() || saving}>
              <Text style={[styles.modalSave, (!name.trim() || saving) && { opacity: 0.4 }]}>
                {saving ? '…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formBody}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. chicken breast, cumin"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoFocus={!existingItem}
            />

            <Text style={styles.fieldLabel}>Category</Text>
            <TouchableOpacity style={styles.picker} onPress={() => { setCatOpen(!catOpen); setLocOpen(false); setUnitOpen(false); }}>
              <Text style={styles.pickerText}>{CAT_EMOJI[category]}  {CAT_LABEL[category]} ▾</Text>
            </TouchableOpacity>
            {catOpen && (
              <View style={styles.dropdown}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c.key} style={[styles.dropdownOption, category === c.key && styles.dropdownOptionActive]}
                    onPress={() => {
                      setCategory(c.key);
                      // Only auto-update location if user hasn't manually changed it
                      if (!existingItem) setLocation(defaultLocation(c.key));
                      setCatOpen(false);
                    }}>
                    <Text style={[styles.dropdownText, category === c.key && styles.dropdownTextActive]}>
                      {c.emoji}  {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>Location</Text>
            <TouchableOpacity style={styles.picker} onPress={() => { setLocOpen(!locOpen); setCatOpen(false); setUnitOpen(false); }}>
              <Text style={styles.pickerText}>{LOC_EMOJI[location]}  {LOC_LABEL[location]} ▾</Text>
            </TouchableOpacity>
            {locOpen && (
              <View style={styles.dropdown}>
                {LOCATIONS.map((l) => (
                  <TouchableOpacity key={l.key} style={[styles.dropdownOption, location === l.key && styles.dropdownOptionActive]}
                    onPress={() => { setLocation(l.key); setLocOpen(false); }}>
                    <Text style={[styles.dropdownText, location === l.key && styles.dropdownTextActive]}>
                      {l.emoji}  {l.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Quantity</Text>
                <TextInput
                  style={styles.textInput}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Unit</Text>
                <TouchableOpacity style={styles.picker} onPress={() => { setUnitOpen(!unitOpen); setCatOpen(false); setLocOpen(false); }}>
                  <Text style={styles.pickerText}>{unit} ▾</Text>
                </TouchableOpacity>
                {unitOpen && (
                  <View style={styles.dropdown}>
                    {UNITS.map((u) => (
                      <TouchableOpacity key={u} style={[styles.dropdownOption, unit === u && styles.dropdownOptionActive]}
                        onPress={() => { setUnit(u); setUnitOpen(false); }}>
                        <Text style={[styles.dropdownText, unit === u && styles.dropdownTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <Text style={styles.fieldLabel}>Low Stock Alert (min quantity)</Text>
            <TextInput
              style={styles.textInput}
              value={minQty}
              onChangeText={setMinQty}
              keyboardType="decimal-pad"
              placeholder="0 = no alert"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.textInput, { height: 72 }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="e.g. almost empty, two jars"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Stocktake modal ──────────────────────────────────────────────────────────

type StocktakeStep = 'pick' | 'analysing' | 'review';

function StocktakeModal({ visible, userId, onClose, onSaved }: {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSaved: (items: InventoryItem[]) => void;
}) {
  const [step, setStep]                   = useState<StocktakeStep>('pick');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [pendingItems, setPendingItems]   = useState<PendingItem[]>([]);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const reset = () => { setStep('pick'); setSelectedImages([]); setPendingItems([]); setError(null); setSaving(false); };
  const handleClose = () => { reset(); onClose(); };

  const pickImage = async (useCamera: boolean) => {
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, quality: 0.3, base64: true, exif: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsMultipleSelection: false, quality: 0.3, base64: true, exif: false });
    if (result.canceled) return;
    const uris = result.assets.filter((a: any) => a.base64).map((a: any) => `data:image/jpeg;base64,${a.base64}`);
    if (uris.length) setSelectedImages((prev) => [...prev, ...uris]);
  };

  const analyse = async () => {
    if (!selectedImages.length) { setError('Add at least one photo first.'); return; }
    setError(null);
    setStep('analysing');
    try {
      const found = await analysePantryPhotos(selectedImages.slice(-1));
      setPendingItems(found.map((f, i) => ({
        id: `${i}-${Date.now()}`,
        name: f.name,
        category: mapStocktakeCategory(f.category),
        location: 'pantry' as ItemLocation,
        notes: f.notes ?? null,
      })));
      setStep('review');
    } catch (e: any) {
      setError(e?.message ?? e?.error ?? 'Analysis failed. Try again.');
      setStep('pick');
    }
  };

  const saveAll = async () => {
    const valid = pendingItems.filter((i) => i.name.trim().length > 0);
    if (!valid.length) { Alert.alert('Nothing to Save', 'Add at least one item.'); return; }
    setSaving(true);
    try {
      const saved = await saveStocktakeItems(userId, valid.map((i) => ({
        name: i.name.trim(),
        category: i.category,
        location: i.location,
        notes: i.notes,
      })));
      onSaved(saved);
      reset();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message ?? 'Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={handleClose}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>
            {step === 'pick' ? 'Photograph Pantry' : step === 'analysing' ? 'Analysing…' : 'Review Items'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {step === 'pick' && (
          <View style={styles.pickStep}>
            <Text style={styles.pickHint}>
              Photograph one shelf at a time. Claude will read the labels and build a list to review.
            </Text>
            <View style={styles.pickButtons}>
              <TouchableOpacity style={styles.pickButton} onPress={() => pickImage(true)}>
                <Text style={styles.pickButtonText}>📷  Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickButton} onPress={() => pickImage(false)}>
                <Text style={styles.pickButtonText}>🖼  Library</Text>
              </TouchableOpacity>
            </View>
            {selectedImages.length > 0 && (
              <Text style={styles.imageCount}>{selectedImages.length} photo{selectedImages.length > 1 ? 's' : ''} ready</Text>
            )}
            {error && <Text style={styles.errorText}>{error}</Text>}
            {selectedImages.length > 0 && (
              <TouchableOpacity style={styles.analyseButton} onPress={analyse}>
                <Text style={styles.analyseButtonText}>Analyse Photos</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {step === 'analysing' && (
          <View style={styles.analysingStep}>
            <ActivityIndicator size="large" color="#3B7A57" />
            <Text style={styles.analysingText}>Reading your labels…</Text>
          </View>
        )}

        {step === 'review' && (
          <>
            <Text style={styles.reviewHint}>Edit names, adjust categories and locations, remove anything wrong.</Text>
            <FlatList
              data={pendingItems}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              renderItem={({ item }) => (
                <StocktakePendingRow
                  item={item}
                  onChange={(updates) => setPendingItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...updates } : i))}
                  onRemove={() => setPendingItems((prev) => prev.filter((i) => i.id !== item.id))}
                />
              )}
              ListFooterComponent={
                <TouchableOpacity style={styles.addManualButton}
                  onPress={() => setPendingItems((prev) => [...prev, { id: `m-${Date.now()}`, name: '', category: 'pantry_dry_goods', location: 'pantry', notes: null }])}>
                  <Text style={styles.addManualText}>+ Add Item Manually</Text>
                </TouchableOpacity>
              }
            />
            <View style={styles.saveRow}>
              <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={saveAll} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveButtonText}>Save {pendingItems.filter((i) => i.name.trim().length > 0).length} Items to Pantry</Text>
                }
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Stocktake pending row ────────────────────────────────────────────────────

function StocktakePendingRow({ item, onChange, onRemove }: {
  item: PendingItem;
  onChange: (u: Partial<PendingItem>) => void;
  onRemove: () => void;
}) {
  const [catOpen, setCatOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

  return (
    <View style={styles.pendingRow}>
      <TextInput style={styles.pendingNameInput} value={item.name} onChangeText={(v) => onChange({ name: v })}
        placeholder="Item name" placeholderTextColor="#9CA3AF" autoCapitalize="none" />
      <View style={styles.pendingRowMeta}>
        <TouchableOpacity style={[styles.catPill, { flex: 1 }]} onPress={() => { setCatOpen(!catOpen); setLocOpen(false); }}>
          <Text style={styles.catPillText}>{CAT_EMOJI[item.category]}  {CAT_LABEL[item.category]} ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.catPill, { marginLeft: 8 }]} onPress={() => { setLocOpen(!locOpen); setCatOpen(false); }}>
          <Text style={styles.catPillText}>{LOC_EMOJI[item.location]} ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
          <Text style={styles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
      {catOpen && (
        <View style={styles.dropdown}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity key={c.key} style={[styles.dropdownOption, item.category === c.key && styles.dropdownOptionActive]}
              onPress={() => { onChange({ category: c.key }); setCatOpen(false); }}>
              <Text style={[styles.dropdownText, item.category === c.key && styles.dropdownTextActive]}>
                {c.emoji}  {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {locOpen && (
        <View style={styles.dropdown}>
          {LOCATIONS.map((l) => (
            <TouchableOpacity key={l.key} style={[styles.dropdownOption, item.location === l.key && styles.dropdownOptionActive]}
              onPress={() => { onChange({ location: l.key }); setLocOpen(false); }}>
              <Text style={[styles.dropdownText, item.location === l.key && styles.dropdownTextActive]}>
                {l.emoji}  {l.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapStocktakeCategory(raw: string): ItemCategory {
  const map: Record<string, ItemCategory> = {
    spices_herbs: 'herbs_spices',
    herbs_spices: 'herbs_spices',
    oils_vinegars: 'oils_vinegars',
    canned_jarred: 'cans_preserves',
    cans_preserves: 'cans_preserves',
    dry_goods: 'pantry_dry_goods',
    pantry_dry_goods: 'pantry_dry_goods',
    condiments: 'condiments_sauces',
    condiments_sauces: 'condiments_sauces',
    baking: 'pantry_dry_goods',
    produce: 'produce',
    meat_fish: 'meat_fish',
    dairy_eggs: 'dairy_eggs',
    bread_bakery: 'bread_bakery',
  };
  return map[raw.toLowerCase()] ?? 'pantry_dry_goods';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  headerButtons: { flexDirection: 'row', gap: 8 },
  addButton: { backgroundColor: '#F3F4F6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  stocktakeButton: { backgroundColor: '#3B7A57', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  stocktakeButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filterBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3F4F6' },
  filterPillActive: { backgroundColor: '#3B7A57' },
  filterPillText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  filterPillTextActive: { color: '#fff' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },

  list: { paddingBottom: 40 },
  swipeHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 8 },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },

  swipeBg: { position: 'absolute', top: 0, bottom: 0, width: 120, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  swipeBgRight: { left: 0, backgroundColor: '#3B7A57' },
  swipeBgLeft: { right: 0, backgroundColor: '#DC2626' },
  swipeBgText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  itemRowLowStock: { borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, color: '#111827', fontWeight: '500', textTransform: 'capitalize' },
  itemMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  lowStockText: { color: '#F59E0B', fontWeight: '600' },
  locationBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  locationBadgeText: { fontSize: 11, color: '#374151', fontWeight: '500' },

  // Modal shared
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 16,
    paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalCancel: { fontSize: 16, color: '#6B7280', width: 60 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalSave: { fontSize: 16, color: '#3B7A57', fontWeight: '700', width: 60, textAlign: 'right' },

  // Add/Edit form
  formBody: { padding: 20, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  textInput: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  picker: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
  },
  pickerText: { fontSize: 15, color: '#111827' },
  row: { flexDirection: 'row', marginTop: 4 },
  dropdown: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', marginTop: 4 },
  dropdownOption: { paddingHorizontal: 14, paddingVertical: 11 },
  dropdownOptionActive: { backgroundColor: '#F0FDF4' },
  dropdownText: { fontSize: 14, color: '#374151' },
  dropdownTextActive: { color: '#3B7A57', fontWeight: '600' },

  // Stocktake
  pickStep: { flex: 1, padding: 24 },
  pickHint: { fontSize: 15, color: '#6B7280', lineHeight: 22, marginBottom: 28 },
  pickButtons: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  pickButton: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  pickButtonText: { fontSize: 16, color: '#111827', fontWeight: '600' },
  imageCount: { fontSize: 14, color: '#3B7A57', fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  errorText: { fontSize: 14, color: '#DC2626', textAlign: 'center', marginBottom: 12 },
  analyseButton: { backgroundColor: '#3B7A57', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  analyseButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  analysingStep: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  analysingText: { fontSize: 16, color: '#6B7280' },
  reviewHint: { fontSize: 14, color: '#6B7280', paddingHorizontal: 16, paddingVertical: 12 },

  pendingRow: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  pendingNameInput: { fontSize: 15, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 8, marginBottom: 8 },
  pendingRowMeta: { flexDirection: 'row', alignItems: 'center' },
  catPill: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  catPillText: { fontSize: 12, color: '#374151' },
  removeButton: { padding: 4, marginLeft: 8 },
  removeButtonText: { fontSize: 16, color: '#9CA3AF' },

  addManualButton: { borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  addManualText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
  saveRow: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  saveButton: { backgroundColor: '#3B7A57', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
