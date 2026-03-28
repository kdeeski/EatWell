// Shopping screen — the weekly shopping list, organised by store and timing.

import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import type { ShoppingListItem } from '../../types';

const STORE_LABELS: Record<string, string> = {
  grocer: 'Grocer',
  butcher: 'Butcher',
  supermarket: 'Supermarket',
};

const STORE_ORDER = ['grocer', 'butcher', 'supermarket'];

function itemLabel(item: ShoppingListItem) {
  if (item.is_pantry_staple) return item.name;
  return `${item.quantity} ${item.unit} ${item.name}`.trim();
}

export default function ShoppingScreen() {
  const { shoppingItems, toggleShoppingItem } = useAppStore();

  const freshItems = shoppingItems.filter((i) => !i.is_pantry_staple);
  const pantryItems = shoppingItems.filter((i) => i.is_pantry_staple);

  const weekendItems = freshItems.filter((i) => i.buy_timing === 'weekend');
  const dayOfItems = freshItems.filter((i) => i.buy_timing === 'day_of');

  const groupByStore = (items: ShoppingListItem[]) =>
    STORE_ORDER.reduce<Record<string, ShoppingListItem[]>>((acc, store) => {
      const group = items.filter((i) => i.store === store);
      if (group.length > 0) acc[store] = group;
      return acc;
    }, {});

  const weekendByStore = groupByStore(weekendItems);
  const dayOfByStore = groupByStore(dayOfItems);

  if (shoppingItems.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyTitle}>No shopping list yet</Text>
        <Text style={styles.emptyBody}>
          Plan the week first and your shopping list will appear here, organised by store.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Shopping</Text>

      {/* Weekend shop */}
      {Object.keys(weekendByStore).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekend shop</Text>
          {Object.entries(weekendByStore).map(([store, items]) => (
            <View key={store} style={styles.storeGroup}>
              <Text style={styles.storeLabel}>{STORE_LABELS[store]}</Text>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => toggleShoppingItem(item.id)}
                >
                  <View style={[styles.checkbox, item.checked && styles.checkboxChecked]} />
                  <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                    {itemLabel(item)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Buy on the day */}
      {Object.keys(dayOfByStore).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Buy on the day</Text>
          <Text style={styles.sectionNote}>
            These are not in your weekend shop — pick them up fresh on the day you cook them.
          </Text>
          {Object.entries(dayOfByStore).map(([store, items]) => (
            <View key={store} style={styles.storeGroup}>
              <Text style={styles.storeLabel}>{STORE_LABELS[store]}</Text>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => toggleShoppingItem(item.id)}
                >
                  <View style={[styles.checkbox, item.checked && styles.checkboxChecked]} />
                  <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                    {itemLabel(item)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Pantry staples */}
      {pantryItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pantry staples</Text>
          <Text style={styles.sectionNote}>
            Tap to mark ones you already have — the rest go on your list.
          </Text>
          {pantryItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.itemRow}
              onPress={() => toggleShoppingItem(item.id)}
            >
              <View style={[styles.pantryBox, item.checked && styles.pantryBoxChecked]}>
                {item.checked && <Text style={styles.pantryTick}>✓</Text>}
              </View>
              <Text style={[styles.itemName, item.checked && styles.pantryNameChecked]}>
                {item.name}
              </Text>
              {item.checked && <Text style={styles.haveItBadge}>have it</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
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
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 },
  sectionNote: { fontSize: 13, color: '#9CA3AF', marginBottom: 12, lineHeight: 18 },

  storeGroup: { marginBottom: 16 },
  storeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B7A57',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  checkboxChecked: {
    backgroundColor: '#3B7A57',
    borderColor: '#3B7A57',
  },
  itemName: { fontSize: 15, color: '#1C1C1E', flex: 1 },
  itemNameChecked: { color: '#9CA3AF', textDecorationLine: 'line-through' },

  pantryBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pantryBoxChecked: {
    backgroundColor: '#D1FAE5',
    borderColor: '#3B7A57',
  },
  pantryTick: { fontSize: 12, color: '#3B7A57', fontWeight: '700' },
  pantryNameChecked: { color: '#9CA3AF' },
  haveItBadge: {
    fontSize: 11,
    color: '#3B7A57',
    fontWeight: '600',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
});
