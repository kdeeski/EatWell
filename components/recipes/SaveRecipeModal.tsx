import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, ActivityIndicator, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recipe, RecipeCategory } from '../../types';
import { saveRecipe, updateRecipe } from '../../lib/data';
import { useAppStore } from '../../store/useAppStore';
import RecipeBrowserModal from './RecipeBrowserModal';
import ImportFromClaudeModal from './ImportFromClaudeModal';
import { colors } from '../../constants/theme';

const CATEGORIES: { key: RecipeCategory; label: string }[] = [
  { key: 'mains',          label: 'Mains' },
  { key: 'sauces_dressings', label: 'Sauces & Dressings' },
  { key: 'sides',          label: 'Sides' },
  { key: 'desserts',       label: 'Desserts' },
  { key: 'baking',         label: 'Baking' },
  { key: 'marinades_rubs', label: 'Marinades & Rubs' },
  { key: 'cocktails',      label: 'Cocktails' },
  { key: 'glossary',       label: 'Glossary' },
];

const CATEGORY_COLOURS: Record<RecipeCategory, string> = {
  mains: colors.category.mains,
  sauces_dressings: colors.category.sauces_dressings,
  sides: colors.category.sides,
  desserts: colors.category.desserts,
  baking: colors.category.baking,
  marinades_rubs: colors.category.marinades_rubs,
  cocktails: colors.category.cocktails,
  glossary: colors.category.glossary,
};

interface Props {
  visible: boolean;
  existingRecipe?: Recipe | null;
  prefill?: Partial<Pick<Recipe, 'name' | 'category' | 'description' | 'ingredients' | 'method'>>;
  onSave: (recipe: Recipe) => void;
  onClose: () => void;
}

export default function SaveRecipeModal({ visible, existingRecipe, prefill, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { userId, addRecipe, updateRecipeInStore, userPreferences } = useAppStore();

  const isEdit = !!existingRecipe;

  const handleShareBrief = async (mealName: string) => {
    const brief = `I'm planning to cook ${mealName}. Please write a recipe for it and format the response as JSON using exactly this structure — no extra fields:
{
  "name": "Recipe Name in Title Case",
  "category": "mains | sauces_dressings | sides | desserts | baking | marinades_rubs | glossary",
  "description": "One sentence describing the dish and what makes it good.",
  "ingredients": "150g Chicken Thighs\\n2 cloves Garlic\\n1 tsp Smoked Paprika",
  "method": "1. First step.\\n2. Second step.\\n3. Third step."
}`;
    await Share.share({ message: brief });
  };

  const [name, setName]               = useState(existingRecipe?.name ?? prefill?.name ?? '');
  const [category, setCategory]       = useState<RecipeCategory>(existingRecipe?.category ?? prefill?.category ?? 'mains');
  const [description, setDescription] = useState(existingRecipe?.description ?? prefill?.description ?? '');
  const [ingredients, setIngredients] = useState(existingRecipe?.ingredients ?? prefill?.ingredients ?? '');
  const [method, setMethod]           = useState(existingRecipe?.method ?? prefill?.method ?? '');
  const [sourceUrl, setSourceUrl]     = useState(existingRecipe?.source_url ?? '');
  const [sourceBook, setSourceBook]   = useState(existingRecipe?.source_book ?? '');
  const [pageNumber, setPageNumber]   = useState(existingRecipe?.page_number?.toString() ?? '');
  const [sourceType, setSourceType]   = useState<'web' | 'book'>(existingRecipe?.source_book ? 'book' : 'web');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showImport, setShowImport]   = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!userId) return;
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        ingredients: ingredients.trim() || null,
        method: method.trim() || null,
        source_url: sourceType === 'web' ? (sourceUrl.trim() || null) : null,
        rating: existingRecipe?.rating ?? null,
        would_cook_again: existingRecipe?.would_cook_again ?? null,
        cooked_meal_id: existingRecipe?.cooked_meal_id ?? null,
        guide_json: existingRecipe?.guide_json ?? null,
      };

      // Only include book fields when book source is active — avoids errors
      // if migration 016 hasn't been applied yet (columns won't exist).
      if (sourceType === 'book') {
        payload.source_book = sourceBook.trim() || null;
        payload.page_number = pageNumber.trim() ? (parseInt(pageNumber, 10) || null) : null;
      }

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
    <>
      {showBrowser && (
        <RecipeBrowserModal
          recipeName={name || 'recipe'}
          visible={showBrowser}
          searchSite={userPreferences?.recipe_search_site}
          onUseUrl={(url) => { setSourceUrl(url); setShowBrowser(false); }}
          onClose={() => setShowBrowser(false)}
        />
      )}
      {showImport && (
        <ImportFromClaudeModal
          visible={showImport}
          onClose={() => setShowImport(false)}
          onPrefill={(data) => {
            if (data.name) setName(data.name);
            if (data.category) setCategory(data.category);
            if (data.description) setDescription(data.description);
            if (data.ingredients) setIngredients(data.ingredients);
            if (data.method) setMethod(data.method);
            setShowImport(false);
          }}
        />
      )}
      <Modal
        visible={visible && !showBrowser && !showImport}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTopRow}>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.headerClose}>×</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  {saving
                    ? <ActivityIndicator size="small" color={colors.brand.primary} />
                    : <Text style={styles.headerSaveBtn}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
              <Text style={styles.headerTitle}>{isEdit ? 'Edit Recipe' : 'Add Recipe'}</Text>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
              keyboardShouldPersistTaps="handled"
            >
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Name */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Name <Text style={styles.required}>*</Text></Text>
                  {!isEdit && (
                    <View style={styles.importLinks}>
                      {name.trim() && (
                        <TouchableOpacity onPress={() => handleShareBrief(name.trim())}>
                          <Text style={styles.importLink}>Ask Claude →</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => setShowImport(true)}>
                        <Text style={styles.importLink}>Import from Claude →</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Recipe name"
                  placeholderTextColor={colors.text.placeholder}
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

              {/* Source */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Source</Text>
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      sourceType === 'web'
                        ? { backgroundColor: colors.brand.primary + '22', borderColor: colors.brand.primary }
                        : styles.pillUnselected,
                    ]}
                    onPress={() => setSourceType('web')}
                  >
                    <Text style={[styles.pillText, sourceType === 'web' && { color: colors.brand.primary, fontWeight: '600' }]}>Web</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      sourceType === 'book'
                        ? { backgroundColor: colors.brand.primary + '22', borderColor: colors.brand.primary }
                        : styles.pillUnselected,
                    ]}
                    onPress={() => setSourceType('book')}
                  >
                    <Text style={[styles.pillText, sourceType === 'book' && { color: colors.brand.primary, fontWeight: '600' }]}>Book</Text>
                  </TouchableOpacity>
                </View>

                {sourceType === 'web' ? (
                  <View style={styles.fieldLabelRow}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      value={sourceUrl}
                      onChangeText={setSourceUrl}
                      placeholder="https://..."
                      placeholderTextColor={colors.text.placeholder}
                      keyboardType="url"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity onPress={() => setShowBrowser(true)} style={{ marginLeft: 8 }}>
                      <Text style={styles.findOnWebBtn}>Find →</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.bookRow}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      value={sourceBook}
                      onChangeText={setSourceBook}
                      placeholder="Book title"
                      placeholderTextColor={colors.text.placeholder}
                      autoCapitalize="words"
                    />
                    <TextInput
                      style={[styles.textInput, styles.pageInput]}
                      value={pageNumber}
                      onChangeText={setPageNumber}
                      placeholder="p."
                      placeholderTextColor={colors.text.placeholder}
                      keyboardType="number-pad"
                    />
                  </View>
                )}
              </View>

              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.textInput, styles.multiline]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Brief description..."
                  placeholderTextColor={colors.text.placeholder}
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
                  placeholderTextColor={colors.text.placeholder}
                  multiline
                  scrollEnabled={false}
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
                  placeholderTextColor={colors.text.placeholder}
                  multiline
                  scrollEnabled={false}
                  textAlignVertical="top"
                />
              </View>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app },

  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerClose: { fontSize: 28, color: colors.text.muted, fontWeight: '300', lineHeight: 28 },
  headerSaveBtn: { fontSize: 15, color: colors.brand.primary, fontWeight: '700' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text.primary },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 20 },

  errorText: { fontSize: 14, color: colors.state.dangerBright, backgroundColor: colors.state.dangerLighter, borderRadius: 8, padding: 12 },

  fieldGroup: { gap: 8 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  importLinks: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  importLink: { fontSize: 13, color: colors.text.placeholder, fontWeight: '500' },
  findOnWebBtn: { fontSize: 13, color: colors.text.link, fontWeight: '600' },
  required: { color: colors.state.dangerBright },

  textInput: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text.primary,
  },
  multiline: {
    minHeight: 90,
    paddingTop: 12,
  },
  multilineMethod: {
    minHeight: 200,
    paddingTop: 12,
  },

  bookRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pageInput: { width: 72 },

  pillScroll: { marginHorizontal: -20, paddingHorizontal: 20 },
  pillRow: { flexDirection: 'row', gap: 8, paddingRight: 20 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillUnselected: { backgroundColor: colors.background.elevated, borderColor: colors.border.default },
  pillText: { fontSize: 14, color: colors.text.muted },
});
