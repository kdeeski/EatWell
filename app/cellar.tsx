// Wine cellar — bottles, vintages, producers
// Grouped by country → flat list → tap row to edit/delete

import { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Platform, KeyboardAvoidingView,
  Animated, PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { saveCellarItem, updateCellarItem, removeCellarItem, addAdHocShoppingItem, updateShoppingItem } from '../lib/data';
import { normaliseIngredientName } from '../lib/recipes';
import type { CellarItem } from '../types';

const BOTTLE_SIZES = [375, 750, 1500, 3000];
const SIZE_LABELS: Record<number, string> = {
  375:  '375mL',
  750:  '750mL',
  1500: '1.5L',
  3000: '3L',
};

function metaLine(item: CellarItem): string {
  const parts: string[] = [];
  if (item.varietal) parts.push(item.varietal);
  if (item.vintage)  parts.push(String(item.vintage));
  if (item.region)   parts.push(item.region);
  if (item.size_ml && item.size_ml !== 750) parts.push(SIZE_LABELS[item.size_ml] ?? `${item.size_ml}mL`);
  return parts.join('  ·  ');
}

interface ModalState {
  visible: boolean;
  item: Partial<CellarItem> | null; // null = new
}

export default function CellarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    userId, cellarItems, addCellarItem, updateCellarItemInStore, removeCellarItemFromStore,
    shoppingList, shoppingItems, addShoppingItem, updateShoppingItemInStore,
  } = useAppStore();

  const [modal, setModal] = useState<ModalState>({ visible: false, item: null });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [name, setName]         = useState('');
  const [producer, setProducer] = useState('');
  const [varietal, setVarietal] = useState('');
  const [vintage, setVintage]   = useState('');
  const [region, setRegion]     = useState('');
  const [country, setCountry]   = useState('');
  const [sizeMl, setSizeMl]     = useState(750);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes]       = useState('');

  const openAdd = () => {
    setName(''); setProducer(''); setVarietal(''); setVintage('');
    setRegion(''); setCountry(''); setSizeMl(750); setQuantity('1'); setNotes('');
    setModal({ visible: true, item: null });
  };

  const openEdit = (item: CellarItem) => {
    setName(item.name);
    setProducer(item.producer ?? '');
    setVarietal(item.varietal ?? '');
    setVintage(item.vintage != null ? String(item.vintage) : '');
    setRegion(item.region ?? '');
    setCountry(item.country ?? '');
    setSizeMl(item.size_ml ?? 750);
    setQuantity(String(item.quantity));
    setNotes(item.notes ?? '');
    setModal({ visible: true, item });
  };

  const handleSave = async () => {
    if (!userId || !name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        producer: producer.trim() || null,
        varietal: varietal.trim() || null,
        vintage: vintage ? parseInt(vintage, 10) : null,
        region: region.trim() || null,
        country: country.trim() || null,
        size_ml: sizeMl,
        quantity: parseInt(quantity, 10) || 1,
        notes: notes.trim() || null,
      };
      if (modal.item?.id) {
        const updated = await updateCellarItem(modal.item.id, payload);
        updateCellarItemInStore(modal.item.id, updated);
      } else {
        const saved = await saveCellarItem(userId, payload);
        addCellarItem(saved);
      }
      setModal({ visible: false, item: null });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!modal.item?.id) return;
    Alert.alert('Remove', `Remove "${modal.item.name}" from your cellar?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await removeCellarItem(modal.item!.id!);
            removeCellarItemFromStore(modal.item!.id!);
            setModal({ visible: false, item: null });
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not remove');
          }
        },
      },
    ]);
  };

  const handleRestock = async (item: CellarItem) => {
    if (!shoppingList) {
      Alert.alert('No Shopping List', 'Plan the week first to create a shopping list.');
      return;
    }
    const normName = normaliseIngredientName(item.name);
    const existing = shoppingItems.find(
      (s) => normaliseIngredientName(s.name) === normName && !s.checked
    );
    if (existing) {
      Alert.alert(
        `${item.name} is already on your list`,
        `Quantity: ${existing.quantity}. Increase to ${existing.quantity + 1}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Increase',
            onPress: async () => {
              try {
                const updated = await updateShoppingItem(existing.id, { quantity: existing.quantity + 1 });
                updateShoppingItemInStore(existing.id, { quantity: updated.quantity });
              } catch (e: any) {
                Alert.alert('Could Not Update', e.message ?? 'Please try again.');
              }
            },
          },
        ]
      );
      return;
    }
    try {
      const saved = await addAdHocShoppingItem(shoppingList.id, item.name, 'alcohol');
      addShoppingItem(saved);
      Alert.alert('Added to Shopping List', `${item.name} added.`);
    } catch (e: any) {
      Alert.alert('Could Not Add', e.message ?? 'Please try again.');
    }
  };

  const handleRemove = async (item: CellarItem) => {
    try {
      await removeCellarItem(item.id);
      removeCellarItemFromStore(item.id);
    } catch {
      Alert.alert('Error', 'Could not remove item.');
    }
  };

  const filteredCellar = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cellarItems;
    return cellarItems.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.producer ?? '').toLowerCase().includes(q) ||
      (item.varietal ?? '').toLowerCase().includes(q) ||
      (item.country ?? '').toLowerCase().includes(q) ||
      (item.notes ?? '').toLowerCase().includes(q)
    );
  }, [cellarItems, searchQuery]);

  // Group by country; ungrouped items go to "Other"
  const countries = Array.from(
    new Set(filteredCellar.map((i) => i.country?.trim() || 'Other'))
  ).sort((a, b) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b));

  const grouped = countries.map((c) => ({
    country: c,
    items: filteredCellar
      .filter((i) => (i.country?.trim() || 'Other') === c)
      .sort((a, b) => {
        // Sort by vintage desc (newest first), then name
        if (b.vintage && a.vintage) return b.vintage - a.vintage;
        if (b.vintage) return 1;
        if (a.vintage) return -1;
        return a.name.localeCompare(b.name);
      }),
  }));

  const totalBottles = cellarItems.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <View style={styles.container}>
      {/* Pinned top section */}
      <View style={{ paddingTop: insets.top || 16 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.headerBtn}>Close</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Wine Cellar</Text>
            {totalBottles > 0 && (
              <Text style={styles.headerCount}>{totalBottles} bottle{totalBottles !== 1 ? 's' : ''}</Text>
            )}
          </View>
          <TouchableOpacity onPress={openAdd} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.headerAdd}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search cellar..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.searchClear} onPress={() => setSearchQuery('')}>
              <Text style={styles.searchClearText}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      {cellarItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Cellar is empty</Text>
          <Text style={styles.emptyBody}>Tap "+ Add" to log your first bottle.</Text>
        </View>
      ) : grouped.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptyBody}>Try a different search term.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={styles.swipeHint}>Swipe right to restock · Swipe left to remove</Text>
          {grouped.map((group) => (
            <View key={group.country} style={styles.group}>
              <Text style={styles.groupHeader}>{group.country}</Text>
              {group.items.map((item) => (
                <CellarRow
                  key={item.id}
                  item={item}
                  onRestock={() => handleRestock(item)}
                  onRemove={() => handleRemove(item)}
                  onEdit={() => openEdit(item)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modal.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal({ visible: false, item: null })}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalContainer, { paddingTop: insets.top || 16 }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModal({ visible: false, item: null })}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{modal.item?.id ? 'Edit Bottle' : 'Add Bottle'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving || !name.trim()}>
                <Text style={[styles.modalSave, (!name.trim() || saving) && styles.modalSaveDisabled]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 40 }]}>
              {/* Name */}
              <Text style={styles.fieldLabel}>Wine Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Sauvignon Blanc"
                placeholderTextColor="#9CA3AF"
                autoFocus={!modal.item?.id}
              />

              {/* Producer + Vintage row */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldGrow}>
                  <Text style={styles.fieldLabel}>Producer / Winery</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={producer}
                    onChangeText={setProducer}
                    placeholder="e.g. Cloudy Bay"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View style={[styles.fieldFixed, { width: 88 }]}>
                  <Text style={styles.fieldLabel}>Vintage</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={vintage}
                    onChangeText={setVintage}
                    placeholder="2022"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
              </View>

              {/* Varietal */}
              <Text style={styles.fieldLabel}>Varietal</Text>
              <TextInput
                style={styles.fieldInput}
                value={varietal}
                onChangeText={setVarietal}
                placeholder="e.g. Pinot Noir, Chardonnay"
                placeholderTextColor="#9CA3AF"
              />

              {/* Region + Country row */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldGrow}>
                  <Text style={styles.fieldLabel}>Region</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={region}
                    onChangeText={setRegion}
                    placeholder="e.g. Marlborough"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View style={styles.fieldGrow}>
                  <Text style={styles.fieldLabel}>Country</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={country}
                    onChangeText={setCountry}
                    placeholder="e.g. New Zealand"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Size */}
              <Text style={styles.fieldLabel}>Bottle Size</Text>
              <View style={styles.sizeRow}>
                {BOTTLE_SIZES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sizePill, sizeMl === s && styles.sizePillActive]}
                    onPress={() => setSizeMl(s)}
                  >
                    <Text style={[styles.sizePillText, sizeMl === s && styles.sizePillTextActive]}>
                      {SIZE_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Quantity */}
              <Text style={styles.fieldLabel}>Quantity</Text>
              <TextInput
                style={[styles.fieldInput, { width: 100 }]}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
              />

              {/* Notes */}
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldMultiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Tasting notes, occasion, food pairings…"
                placeholderTextColor="#9CA3AF"
                multiline
              />

              {/* Delete */}
              {modal.item?.id && (
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnText}>Remove from Cellar</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Swipeable cellar row ─────────────────────────────────────────────────────

function CellarRow({ item, onRestock, onRemove, onEdit }: {
  item: CellarItem;
  onRestock: () => void;
  onRemove: () => void;
  onEdit: () => void;
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
        if (dx > THRESHOLD) onRestock();
        else if (dx < -THRESHOLD) onRemove();
      },
    })
  ).current;

  const rightOpacity = translateX.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const leftOpacity  = translateX.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={{ overflow: 'hidden', marginBottom: 6 }}>
      <Animated.View style={[styles.swipeBg, styles.swipeBgRight, { opacity: rightOpacity }]}>
        <Text style={styles.swipeBgText}>Restock</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeBg, styles.swipeBgLeft, { opacity: leftOpacity }]}>
        <Text style={styles.swipeBgText}>Remove</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity style={styles.row} onPress={onEdit} activeOpacity={0.7}>
          <View style={styles.rowMain}>
            <View style={styles.rowTitleRow}>
              {item.producer ? (
                <>
                  <Text style={styles.rowProducer}>{item.producer}</Text>
                  <Text style={styles.rowName}> {item.name}</Text>
                </>
              ) : (
                <Text style={styles.rowName}>{item.name}</Text>
              )}
            </View>
            {metaLine(item) ? <Text style={styles.rowMeta}>{metaLine(item)}</Text> : null}
            {item.notes ? <Text style={styles.rowNotes}>{item.notes}</Text> : null}
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowQty}>{item.quantity}</Text>
            <Text style={styles.rowQtyLabel}>bottle{item.quantity !== 1 ? 's' : ''}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerBtn:    { fontSize: 16, color: '#6B7280', fontWeight: '500', minWidth: 48 },
  headerCenter: { alignItems: 'center' },
  headerTitle:  { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  headerCount:  { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  headerAdd:    { fontSize: 16, color: '#7C3AED', fontWeight: '700', minWidth: 48, textAlign: 'right' },

  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, height: 38, fontSize: 15, color: '#1C1C1E' },
  searchClear: { paddingLeft: 8, paddingVertical: 8 },
  searchClearText: { fontSize: 20, color: '#9CA3AF', lineHeight: 22 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  emptyBody:  { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  swipeHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 8 },
  swipeBg: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', borderRadius: 12 },
  swipeBgRight: { backgroundColor: '#7C3AED', alignItems: 'flex-start', paddingLeft: 20 },
  swipeBgLeft:  { backgroundColor: '#EF4444', alignItems: 'flex-end',   paddingRight: 20 },
  swipeBgText:  { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  listContent: { padding: 20, gap: 24 },
  group: { gap: 8 },
  groupHeader: {
    fontSize: 13, fontWeight: '600', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', padding: 14, gap: 12,
  },
  rowMain:      { flex: 1, gap: 2 },
  rowTitleRow:  { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  rowProducer:  { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  rowName:      { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  rowMeta:      { fontSize: 12, color: '#6B7280' },
  rowNotes:     { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  rowRight:     { alignItems: 'center' },
  rowQty:       { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  rowQtyLabel:  { fontSize: 11, color: '#9CA3AF' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalCancel: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  modalTitle:  { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  modalSave:   { fontSize: 16, color: '#7C3AED', fontWeight: '700' },
  modalSaveDisabled: { color: '#9CA3AF' },
  modalContent: { padding: 20, gap: 4 },

  fieldLabel:    { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  fieldInput:    { backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, fontSize: 15, color: '#1C1C1E' },
  fieldMultiline:{ minHeight: 80, textAlignVertical: 'top' },
  fieldRow:      { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  fieldGrow:     { flex: 1 },
  fieldFixed:    {},

  sizeRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  sizePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F3F4F6' },
  sizePillActive: { backgroundColor: '#7C3AED' },
  sizePillText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  sizePillTextActive: { color: '#FFFFFF' },

  deleteBtn: { marginTop: 24, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, alignItems: 'center' },
  deleteBtnText: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
});
