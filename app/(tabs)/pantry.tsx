// Pantry screen — stocktake via camera/photos + manual management of in-stock items.

import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, TextInput, Alert,
  KeyboardAvoidingView, Platform, FlatList,
  Animated, PanResponder,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../../store/useAppStore';
import { analysePantryPhotos } from '../../lib/claude';
import { addPantryItem, saveStocktakeItems, markPantryItemDepleted, addAdHocShoppingItem } from '../../lib/data';
import type { PantryCategory, PantryItem } from '../../types';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: { key: PantryCategory; label: string }[] = [
  { key: 'spices_herbs',   label: 'Spices & Dried Herbs' },
  { key: 'oils_vinegars',  label: 'Oils & Vinegars' },
  { key: 'canned_jarred',  label: 'Canned & Jarred' },
  { key: 'dry_goods',      label: 'Dry Goods' },
  { key: 'condiments',     label: 'Condiments' },
  { key: 'baking',         label: 'Baking' },
  { key: 'other',          label: 'Other' },
];

const CATEGORY_LABEL: Record<PantryCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label])
) as Record<PantryCategory, string>;

// ─── Pending item (during review before saving) ───────────────────────────────

interface PendingItem {
  id: string; // local only
  name: string;
  category: PantryCategory;
  notes: string | null;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PantryScreen() {
  const {
    userId, pantryItems, addPantryItemToStore, removePantryItemFromStore,
    shoppingList, addShoppingItem,
  } = useAppStore();

  const [stocktakeVisible, setStocktakeVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCategory, setAddCategory] = useState<PantryCategory>('other');
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  // Group in-stock items by category
  const grouped = CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    items: pantryItems.filter((i) => i.category === key && !i.depleted),
  })).filter((g) => g.items.length > 0);

  const handleRemove = async (item: PantryItem) => {
    try {
      await markPantryItemDepleted(item.id);
      removePantryItemFromStore(item.id);
    } catch {
      Alert.alert('Error', 'Could not remove item.');
    }
  };

  const handleReplenish = async (item: PantryItem) => {
    if (!shoppingList) {
      Alert.alert('No Shopping List', 'Plan the week first to create a shopping list, then replenish from here.');
      return;
    }
    try {
      const saved = await addAdHocShoppingItem(shoppingList.id, item.name);
      addShoppingItem(saved);
      Alert.alert('Added to Shopping List', `${item.name} has been added to your list.`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not add to shopping list.');
    }
  };

  const handleManualAdd = async () => {
    if (!addName.trim() || !userId) return;
    setAddSaving(true);
    try {
      const saved = await addPantryItem(userId, addName.trim(), addCategory, 'manual');
      addPantryItemToStore(saved);
      setAddName('');
      setAddCategory('other');
      setAddVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not add item.');
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Pantry</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.addButton} onPress={() => setAddVisible(true)}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stocktakeButton} onPress={() => setStocktakeVisible(true)}>
            <Text style={styles.stocktakeButtonText}>Stocktake</Text>
          </TouchableOpacity>
        </View>
      </View>

      {pantryItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No pantry items yet</Text>
          <Text style={styles.emptyBody}>
            Tap "Stocktake" to photograph your pantry and spice rack. Claude will read the labels and build your inventory.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.swipeHint}>Swipe right to replenish · Swipe left to remove</Text>
          {grouped.map(({ key, label, items }) => (
            <View key={key} style={styles.section}>
              <Text style={styles.sectionHeader}>{label}</Text>
              {items.map((item) => (
                <PantryItemRow
                  key={item.id}
                  item={item}
                  onReplenish={() => handleReplenish(item)}
                  onRemove={() => handleRemove(item)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Manual add modal */}
      <Modal visible={addVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setAddVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setAddVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Item</Text>
              <View style={{ width: 60 }} />
            </View>

            <View style={{ padding: 20, gap: 16 }}>
              <TextInput
                style={styles.manualInput}
                value={addName}
                onChangeText={setAddName}
                placeholder="Item name (e.g. cumin, olive oil)"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoFocus
              />

              <TouchableOpacity style={styles.catPill} onPress={() => setAddCatOpen(!addCatOpen)}>
                <Text style={styles.catPillText}>{CATEGORY_LABEL[addCategory]} ▾</Text>
              </TouchableOpacity>

              {addCatOpen && (
                <View style={styles.catDropdown}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.catOption, addCategory === c.key && styles.catOptionActive]}
                      onPress={() => { setAddCategory(c.key); setAddCatOpen(false); }}
                    >
                      <Text style={[styles.catOptionText, addCategory === c.key && styles.catOptionTextActive]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveButton, (!addName.trim() || addSaving) && { opacity: 0.5 }]}
                onPress={handleManualAdd}
                disabled={!addName.trim() || addSaving}
              >
                {addSaving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveButtonText}>Add to Pantry</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Stocktake modal */}
      <StocktakeModal
        visible={stocktakeVisible}
        userId={userId!}
        onClose={() => setStocktakeVisible(false)}
        onSaved={(saved) => {
          saved.forEach((i) => addPantryItemToStore(i));
          setStocktakeVisible(false);
        }}
      />
    </View>
  );
}

// ─── Swipeable pantry item row ────────────────────────────────────────────────

function PantryItemRow({
  item,
  onReplenish,
  onRemove,
}: {
  item: PantryItem;
  onReplenish: () => void;
  onRemove: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const THRESHOLD = 80;

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
        <View style={styles.itemRow}>
          <View style={styles.itemLeft}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Stocktake modal ──────────────────────────────────────────────────────────

interface StocktakeModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSaved: (items: PantryItem[]) => void;
}

type StocktakeStep = 'pick' | 'analysing' | 'review';

function StocktakeModal({ visible, userId, onClose, onSaved }: StocktakeModalProps) {
  const [step, setStep] = useState<StocktakeStep>('pick');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('pick');
    setSelectedImages([]);
    setPendingItems([]);
    setError(null);
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickImages = async (useCamera: boolean) => {
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'] as any,
          quality: 0.3,
          base64: true,
          exif: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'] as any,
          allowsMultipleSelection: false,
          quality: 0.3,
          base64: true,
          exif: false,
        });

    if (result.canceled) return;

    const uris = result.assets
      .filter((a: any) => a.base64)
      .map((a: any) => `data:image/jpeg;base64,${a.base64}`);

    if (uris.length === 0) return;

    const combined = [...selectedImages, ...uris];
    setSelectedImages(combined);
  };

  const analyse = async () => {
    if (selectedImages.length === 0) {
      setError('Add at least one photo first.');
      return;
    }
    setError(null);
    setStep('analysing');
    try {
      const found = await analysePantryPhotos(selectedImages.slice(-1)); // send one at a time
      const items: PendingItem[] = found.map((f, i) => ({
        id: `${i}-${Date.now()}`,
        name: f.name,
        category: (f.category as PantryCategory) ?? 'other',
        notes: f.notes ?? null,
      }));
      setPendingItems(items);
      setStep('review');
    } catch (e: any) {
      const msg = e?.message ?? e?.error ?? 'Analysis failed. Try again.';
      setError(msg);
      setStep('pick');
    }
  };

  const addManual = () => {
    setPendingItems((prev) => [
      ...prev,
      { id: `manual-${Date.now()}`, name: '', category: 'other', notes: null },
    ]);
  };

  const updatePending = (id: string, field: keyof PendingItem, value: string) => {
    setPendingItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  };

  const removePending = (id: string) => {
    setPendingItems((prev) => prev.filter((i) => i.id !== id));
  };

  const saveAll = async () => {
    const valid = pendingItems.filter((i) => i.name.trim().length > 0);
    if (valid.length === 0) {
      Alert.alert('Nothing to save', 'Add at least one item before saving.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveStocktakeItems(
        userId,
        valid.map((i) => ({
          name: i.name.trim(),
          category: i.category,
          notes: i.notes,
        }))
      );
      onSaved(saved);
      reset();
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalContainer}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {step === 'pick' ? 'Photograph Pantry' : step === 'analysing' ? 'Analysing…' : 'Review Items'}
            </Text>
            <View style={{ width: 60 }} />
          </View>

          {/* ── Step: pick ── */}
          {step === 'pick' && (
            <View style={styles.pickStep}>
              <Text style={styles.pickHint}>
                Take a photo of one shelf or area at a time — spice rack, pantry shelf, etc. Claude will read the labels and build a list to review.
              </Text>

              <View style={styles.pickButtons}>
                <TouchableOpacity style={styles.pickButton} onPress={() => pickImages(true)}>
                  <Text style={styles.pickButtonText}>📷  Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickButton} onPress={() => pickImages(false)}>
                  <Text style={styles.pickButtonText}>🖼  Library</Text>
                </TouchableOpacity>
              </View>

              {selectedImages.length > 0 && (
                <Text style={styles.imageCount}>
                  {selectedImages.length} photo{selectedImages.length > 1 ? 's' : ''} ready
                </Text>
              )}

              {error && <Text style={styles.errorText}>{error}</Text>}

              {selectedImages.length > 0 && (
                <TouchableOpacity style={styles.analyseButton} onPress={analyse}>
                  <Text style={styles.analyseButtonText}>Analyse Photos</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Step: analysing ── */}
          {step === 'analysing' && (
            <View style={styles.analysingStep}>
              <ActivityIndicator size="large" color="#3B7A57" />
              <Text style={styles.analysingText}>Reading your labels…</Text>
            </View>
          )}

          {/* ── Step: review ── */}
          {step === 'review' && (
            <>
              <Text style={styles.reviewHint}>
                Edit names or categories, remove anything wrong, and add anything missed.
              </Text>
              <FlatList
                data={pendingItems}
                keyExtractor={(item) => item.id}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                renderItem={({ item }) => (
                  <PendingItemRow
                    item={item}
                    onChangeName={(v) => updatePending(item.id, 'name', v)}
                    onChangeCategory={(v) => updatePending(item.id, 'category', v)}
                    onRemove={() => removePending(item.id)}
                  />
                )}
                ListFooterComponent={
                  <TouchableOpacity style={styles.addManualButton} onPress={addManual}>
                    <Text style={styles.addManualText}>+ Add Item Manually</Text>
                  </TouchableOpacity>
                }
              />
              <View style={styles.saveRow}>
                <TouchableOpacity
                  style={[styles.saveButton, saving && { opacity: 0.6 }]}
                  onPress={saveAll}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      Save {pendingItems.filter((i) => i.name.trim().length > 0).length} Items to Pantry
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Pending item row ─────────────────────────────────────────────────────────

interface PendingItemRowProps {
  item: PendingItem;
  onChangeName: (v: string) => void;
  onChangeCategory: (v: string) => void;
  onRemove: () => void;
}

function PendingItemRow({ item, onChangeName, onChangeCategory, onRemove }: PendingItemRowProps) {
  const [catOpen, setCatOpen] = useState(false);

  return (
    <View style={styles.pendingRow}>
      <TextInput
        style={styles.pendingNameInput}
        value={item.name}
        onChangeText={onChangeName}
        placeholder="Item name"
        placeholderTextColor="#9CA3AF"
        autoCapitalize="none"
      />
      <View style={styles.pendingRowBottom}>
        <TouchableOpacity style={styles.catPill} onPress={() => setCatOpen(!catOpen)}>
          <Text style={styles.catPillText}>{CATEGORY_LABEL[item.category]} ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
          <Text style={styles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
      {catOpen && (
        <View style={styles.catDropdown}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.catOption, item.category === c.key && styles.catOptionActive]}
              onPress={() => {
                onChangeCategory(c.key);
                setCatOpen(false);
              }}
            >
              <Text style={[styles.catOptionText, item.category === c.key && styles.catOptionTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  addButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  stocktakeButton: {
    backgroundColor: '#3B7A57',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  stocktakeButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  manualInput: {
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },

  list: { paddingBottom: 40 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, color: '#111827', fontWeight: '500', textTransform: 'capitalize' },
  itemNotes: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  swipeHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 8 },
  swipeBg: {
    position: 'absolute', top: 0, bottom: 0,
    width: 120, justifyContent: 'center', alignItems: 'center',
    borderRadius: 10,
  },
  swipeBgRight: { left: 0, backgroundColor: '#3B7A57' },
  swipeBgLeft:  { right: 0, backgroundColor: '#DC2626' },
  swipeBgText:  { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalCancel: { fontSize: 16, color: '#6B7280', width: 60 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  // Pick step
  pickStep: { flex: 1, padding: 24 },
  pickHint: { fontSize: 15, color: '#6B7280', lineHeight: 22, marginBottom: 28 },
  pickButtons: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  pickButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickButtonText: { fontSize: 16, color: '#111827', fontWeight: '600' },
  imageCount: { fontSize: 14, color: '#3B7A57', fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  errorText: { fontSize: 14, color: '#DC2626', textAlign: 'center', marginBottom: 12 },
  analyseButton: {
    backgroundColor: '#3B7A57',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  analyseButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Analysing step
  analysingStep: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  analysingText: { fontSize: 16, color: '#6B7280' },

  // Review step
  reviewHint: { fontSize: 14, color: '#6B7280', paddingHorizontal: 16, paddingVertical: 12 },

  pendingRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pendingNameInput: {
    fontSize: 15,
    color: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 6,
    marginBottom: 8,
  },
  pendingRowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catPill: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  catPillText: { fontSize: 13, color: '#374151' },
  removeButton: { padding: 4 },
  removeButtonText: { fontSize: 16, color: '#9CA3AF' },
  catDropdown: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  catOption: { paddingHorizontal: 12, paddingVertical: 10 },
  catOptionActive: { backgroundColor: '#F0FDF4' },
  catOptionText: { fontSize: 14, color: '#374151' },
  catOptionTextActive: { color: '#3B7A57', fontWeight: '600' },

  addManualButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  addManualText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },

  saveRow: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  saveButton: {
    backgroundColor: '#3B7A57',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
