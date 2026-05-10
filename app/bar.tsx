// Bar inventory — spirits, liqueurs, bitters, syrups
// Spirit type tabs → grouped list → tap row to edit/delete

import { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Platform, KeyboardAvoidingView,
  Animated, PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { saveBarItem, updateBarItem, removeBarItem, addAdHocShoppingItem, updateShoppingItem } from '../lib/data';
import { normaliseIngredientName } from '../lib/recipes';
import type { BarItem, SpiritType } from '../types';
import ImportBarItemModal from '../components/bar/ImportBarItemModal';

const SPIRIT_TYPES: { key: SpiritType; label: string; emoji: string }[] = [
  { key: 'whiskey',            label: 'Whiskey',           emoji: '🥃' },
  { key: 'cognac_brandy',      label: 'Cognac & Brandy',   emoji: '🍶' },
  { key: 'gin',                label: 'Gin',               emoji: '🌿' },
  { key: 'vodka',              label: 'Vodka',             emoji: '🫙' },
  { key: 'rum',                label: 'Rum',               emoji: '🍹' },
  { key: 'tequila_mezcal',     label: 'Tequila & Mezcal',  emoji: '🌵' },
  { key: 'vermouth_fortified', label: 'Vermouth & Fortified', emoji: '🍾' },
  { key: 'liqueur_aperitif',   label: 'Liqueurs & Aperitifs', emoji: '🍷' },
  { key: 'bitters',            label: 'Bitters',           emoji: '🧪' },
  { key: 'syrup_mixer',        label: 'Syrups & Mixers',   emoji: '🍯' },
  { key: 'other',              label: 'Other',             emoji: '📦' },
];

const BOTTLE_SIZES = [50, 200, 350, 500, 700, 750, 1000];

type FilterKey = 'all' | SpiritType;

function spiritLabel(key: SpiritType) {
  return SPIRIT_TYPES.find((s) => s.key === key)?.label ?? key;
}

function metaLine(item: BarItem): string {
  const parts: string[] = [];
  if (item.abv != null) parts.push(`${item.abv}% ABV`);
  if (item.size_ml != null) parts.push(`${item.size_ml}mL`);
  if (item.country) parts.push(item.country);
  return parts.join('  ·  ');
}

interface ModalState {
  visible: boolean;
  item: Partial<BarItem> | null; // null = new
}

export default function BarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    userId, barItems, addBarItem, updateBarItemInStore, removeBarItemFromStore,
    shoppingList, shoppingItems, addShoppingItem, updateShoppingItemInStore,
  } = useAppStore();

  const [activeType, setActiveType] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<ModalState>({ visible: false, item: null });
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Form state
  const [name, setName]       = useState('');
  const [spiritType, setSpiritType] = useState<SpiritType>('whiskey');
  const [abv, setAbv]         = useState('');
  const [sizeMl, setSizeMl]   = useState<number | null>(700);
  const [country, setCountry] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes]     = useState('');

  const openAdd = () => {
    setName(''); setSpiritType('whiskey'); setAbv('');
    setSizeMl(700); setCountry(''); setQuantity('1'); setNotes('');
    setModal({ visible: true, item: null });
  };

  const handleImportPrefill = (data: Pick<BarItem, 'name' | 'spirit_type' | 'abv' | 'size_ml' | 'country' | 'notes'>) => {
    setName(data.name);
    setSpiritType(data.spirit_type);
    setAbv(data.abv != null ? String(data.abv) : '');
    setSizeMl(data.size_ml ?? 700);
    setCountry(data.country ?? '');
    setQuantity('1');
    setNotes(data.notes ?? '');
    setModal({ visible: true, item: null });
  };

  const openEdit = (item: BarItem) => {
    setName(item.name);
    setSpiritType(item.spirit_type);
    setAbv(item.abv != null ? String(item.abv) : '');
    setSizeMl(item.size_ml ?? 700);
    setCountry(item.country ?? '');
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
        spirit_type: spiritType,
        abv: abv ? parseFloat(abv) : null,
        size_ml: sizeMl,
        country: country.trim() || null,
        quantity: parseFloat(quantity) || 1,
        notes: notes.trim() || null,
      };
      if (modal.item?.id) {
        const updated = await updateBarItem(modal.item.id, payload);
        updateBarItemInStore(modal.item.id, updated);
      } else {
        const saved = await saveBarItem(userId, payload);
        addBarItem(saved);
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
    Alert.alert('Remove', `Remove "${modal.item.name}" from your bar?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await removeBarItem(modal.item!.id!);
            removeBarItemFromStore(modal.item!.id!);
            setModal({ visible: false, item: null });
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not remove');
          }
        },
      },
    ]);
  };

  const handleRestock = async (item: BarItem) => {
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

  const handleRemove = async (item: BarItem) => {
    try {
      await removeBarItem(item.id);
      removeBarItemFromStore(item.id);
    } catch {
      Alert.alert('Error', 'Could not remove item.');
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return barItems.filter((item) => {
      const matchesType = activeType === 'all' || item.spirit_type === activeType;
      if (!matchesType) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.notes ?? '').toLowerCase().includes(q) ||
        (item.country ?? '').toLowerCase().includes(q)
      );
    });
  }, [barItems, activeType, searchQuery]);

  const grouped = SPIRIT_TYPES.map((t) => ({
    ...t,
    items: filtered.filter((i) => i.spirit_type === t.key),
  })).filter((g) => g.items.length > 0);

  return (
    <View style={styles.container}>
      {/* Pinned top section — header + filter bar never move */}
      <View style={{ paddingTop: insets.top || 16 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.headerBtn}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bar</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setImportOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.headerImport}>Claude</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openAdd} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.headerAdd}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search bar..."
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

        {/* Spirit type filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
          <TouchableOpacity
            style={[styles.filterPill, activeType === 'all' && styles.filterPillActive]}
            onPress={() => setActiveType('all')}
          >
            <Text style={[styles.filterPillText, activeType === 'all' && styles.filterPillTextActive]}>All</Text>
          </TouchableOpacity>
          {SPIRIT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.filterPill, activeType === t.key && styles.filterPillActive]}
              onPress={() => setActiveType(t.key)}
            >
              <Text style={[styles.filterPillText, activeType === t.key && styles.filterPillTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List — flex:1 so it fills all remaining space */}
      {grouped.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>Tap "+ Add" to add your first bottle.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={styles.swipeHint}>Swipe right to restock · Swipe left to remove</Text>
          {grouped.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.groupHeader}>{group.label}</Text>
              {group.items.map((item) => (
                <BarRow
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
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Wild Turkey Rare Breed"
                placeholderTextColor="#9CA3AF"
                autoFocus={!modal.item?.id}
              />

              {/* Spirit type */}
              <Text style={styles.fieldLabel}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeBar} contentContainerStyle={styles.typeBarContent}>
                {SPIRIT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typePill, spiritType === t.key && styles.typePillActive]}
                    onPress={() => setSpiritType(t.key)}
                  >
                    <Text style={[styles.typePillText, spiritType === t.key && styles.typePillTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* ABV + Size row */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>ABV %</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={abv}
                    onChangeText={setAbv}
                    placeholder="e.g. 40.5"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Size (mL)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.sizeRow}>
                      {BOTTLE_SIZES.map((s) => (
                        <TouchableOpacity
                          key={s}
                          style={[styles.sizePill, sizeMl === s && styles.sizePillActive]}
                          onPress={() => setSizeMl(s)}
                        >
                          <Text style={[styles.sizePillText, sizeMl === s && styles.sizePillTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>

              {/* Country + Quantity row */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Country</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={country}
                    onChangeText={setCountry}
                    placeholder="e.g. Scotland"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View style={[styles.fieldHalf, { maxWidth: 100 }]}>
                  <Text style={styles.fieldLabel}>Bottles</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Notes */}
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldMultiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Age, style, tasting notes…"
                placeholderTextColor="#9CA3AF"
                multiline
              />

              {/* Delete */}
              {modal.item?.id && (
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnText}>Remove from Bar</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ImportBarItemModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onPrefill={handleImportPrefill}
      />
    </View>
  );
}

// ─── Swipeable bar row ────────────────────────────────────────────────────────

function BarRow({ item, onRestock, onRemove, onEdit }: {
  item: BarItem;
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
            <Text style={styles.rowName}>{item.name}</Text>
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
  headerTitle:  { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerImport: { fontSize: 14, color: '#7C3AED', fontWeight: '600' },
  headerAdd:    { fontSize: 16, color: '#3B7A57', fontWeight: '700' },

  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, height: 38, fontSize: 15, color: '#1C1C1E' },
  searchClear: { paddingLeft: 8, paddingVertical: 8 },
  searchClearText: { fontSize: 20, color: '#9CA3AF', lineHeight: 22 },

  filterBar: { height: 52, backgroundColor: '#FAFAF8', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filterBarContent: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3F4F6', flexShrink: 0, marginRight: 8 },
  filterPillActive: { backgroundColor: '#3B7A57' },
  filterPillText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  filterPillTextActive: { color: '#FFFFFF' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  emptyBody:  { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  swipeHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 8 },
  swipeBg: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', borderRadius: 12 },
  swipeBgRight: { backgroundColor: '#3B7A57', alignItems: 'flex-start', paddingLeft: 20 },
  swipeBgLeft:  { backgroundColor: '#EF4444', alignItems: 'flex-end',   paddingRight: 20 },
  swipeBgText:  { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  listContent: { padding: 20, gap: 24 },
  group: { gap: 8 },
  groupHeader: { fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', padding: 14, gap: 12,
  },
  rowMain:    { flex: 1, gap: 2 },
  rowName:    { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  rowMeta:    { fontSize: 12, color: '#6B7280' },
  rowNotes:   { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  rowRight:   { alignItems: 'center' },
  rowQty:     { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  rowQtyLabel:{ fontSize: 11, color: '#9CA3AF' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalCancel: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  modalTitle:  { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  modalSave:   { fontSize: 16, color: '#3B7A57', fontWeight: '700' },
  modalSaveDisabled: { color: '#9CA3AF' },
  modalContent: { padding: 20, gap: 4 },

  fieldLabel:    { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  fieldInput:    { backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, fontSize: 15, color: '#1C1C1E' },
  fieldMultiline:{ minHeight: 80, textAlignVertical: 'top' },
  fieldRow:      { flexDirection: 'row', gap: 12 },
  fieldHalf:     { flex: 1 },

  typeBar: { flexGrow: 0, marginBottom: 4 },
  typeBarContent: { gap: 8, flexDirection: 'row', paddingVertical: 4 },
  typePill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#F3F4F6', flexShrink: 0 },
  typePillActive: { backgroundColor: '#1C1C1E' },
  typePillText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  typePillTextActive: { color: '#FFFFFF' },

  sizeRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  sizePill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F3F4F6' },
  sizePillActive: { backgroundColor: '#3B7A57' },
  sizePillText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  sizePillTextActive: { color: '#FFFFFF' },

  deleteBtn: { marginTop: 24, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, alignItems: 'center' },
  deleteBtnText: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
});
