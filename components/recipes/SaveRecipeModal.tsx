import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recipe, RecipeCategory } from '../../types';
import { saveRecipe, updateRecipe } from '../../lib/data';
import { useAppStore } from '../../store/useAppStore';

const CATEGORIES: { key: RecipeCategory; label: string }[] = [
  { key: 'mains',          label: 'Mains' },
  { key: 'sauces_dressings', label: 'Sauces & Dressings' },
  { key: 'sides',          label: 'Sides' },
  { key: 'desserts',       label: 'Desserts' },
  { key: 'baking',         label: 'Baking' },
  { key: 'marinades_rubs', label: 'Marinades & Rubs' },
  { key: 'glossary',       label: 'Glossary' },
];

const CATEGORY_COLOURS: Record<RecipeCategory, string> = {
  mains: '#3B7A57',
  sauces_dressings: '#D97706',
  sides: '#6B7280',
  desserts: '#9333EA',
  baking: '#EA580C',
  marinades_rubs: '#0369A1',
  glossary: '#374151',
};

interface Props {
  visible: boolean;
  existingRecipe?: Recipe | null;
  prefill?: Partial<Pick<Recipe, 'name' | 'category' | 'description' | 'method'>>;
  onSave: (recipe: Recipe) => void;
  onClose: () => void;
}

export default function SaveRecipeModal({ visible, existingRecipe, prefill, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { userId, addRecipe, updateRecipeInStore } = useAppStore();

  const isEdit = !!existingRecipe;

  const [name, setName]               = useState(existingRecipe?.name ?? prefill?.name ?? '');
  const [category, setCategory]       = useState<RecipeCategory>(existingRecipe?.category ?? prefill?.category ?? 'mains');
  const [description, setDescription] = useState(existingRecipe?.description ?? prefill?.description ?? '');
  const [ingredients, setIngredients] = useState(existingRecipe?.ingredients ?? '');
  const [method, setMethod]           = useState(existingRecipe?.method ?? prefill?.method ?? '');
  const [sourceUrl, setSourceUrl]     = useState(existingRecipe?.source_url ?? '');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!userId) return;
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        ingredients: ingredients.trim() || null,
        method: method.trim() || null,
        source_url: sourceUrl.trim() || null,
        rating: existingRecipe?.rating ?? null,
        would_cook_again: existingRecipe?.would_cook_again ?? null,
        cooked_meal_id: existingRecipe?.cooked_meal_id ?? null,
        guide_json: existingRecipe?.guide_json ?? null,
      };

      if (isEdit && existingRecipe) {
        const updated = await updateRecipe(existingRecipe.id, payload);
        updateRecipeInStore(existingRecipe.id, updated);
        onSave(updated);
      } else {
        const created = await saveRecipe(userId, payload);
        addRecipe(created);
        onSave(created);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save recipe');
    } finally {
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.headerBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{isEdit ? 'Edit Recipe' : 'Add Recipe'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              {saving
                ? <ActivityIndicator size="small" color="#3B7A57" />
                : <Text style={styles.headerSaveBtn}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
          >
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="Recipe name"
                placeholderTextColor="#9CA3AF"
                returnKeyType="next"
              />
            </View>

            {/* Category pills */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                <View style={styles.pillRow}>
                  {CATEGORIES.map((cat) => {
                    const selected = category === cat.key;
                    const colour = CATEGORY_COLOURS[cat.key];
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        style={[
                          styles.pill,
                          selected && { backgroundColor: colour + '22', borderColor: colour },
                          !selected && styles.pillUnselected,
                        ]}
                        onPress={() => setCategory(cat.key)}
                      >
                        <Text style={[styles.pillText, selected && { color: colour, fontWeight: '600' }]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* Description */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Brief description..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Ingredients */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Ingredients</Text>
              <TextInput
                style={[styles.textInput, styles.multiline]}
                value={ingredients}
                onChangeText={setIngredients}
                placeholder="One item per line..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            {/* Method */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Method</Text>
              <TextInput
                style={[styles.textInput, styles.multilineMethod]}
                value={method}
                onChangeText={setMethod}
                placeholder="One step per line..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={14}
                textAlignVertical="top"
                scrollEnabled
              />
            </View>

            {/* Source URL */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Source URL</Text>
              <TextInput
                style={styles.textInput}
                value={sourceUrl}
                onChangeText={setSourceUrl}
                placeholder="https://..."
                placeholderTextColor="#9CA3AF"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerBtn: { fontSize: 16, color: '#6B7280', fontWeight: '500', minWidth: 56 },
  headerSaveBtn: { fontSize: 16, color: '#3B7A57', fontWeight: '700', minWidth: 56, textAlign: 'right' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 20 },

  errorText: { fontSize: 14, color: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12 },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  required: { color: '#EF4444' },

  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
  },
  multiline: {
    minHeight: 90,
    paddingTop: 12,
  },
  multilineMethod: {
    minHeight: 200,
    paddingTop: 12,
  },

  pillScroll: { marginHorizontal: -20, paddingHorizontal: 20 },
  pillRow: { flexDirection: 'row', gap: 8, paddingRight: 20 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillUnselected: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  pillText: { fontSize: 14, color: '#6B7280' },
});
