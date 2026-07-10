import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getCookingGuide } from '../../lib/claude';
import type { CookingGuide } from '../../lib/claude';
import { saveRecipe, updateRecipe } from '../../lib/data';
import { useAppStore } from '../../store/useAppStore';
import type { RecipeGuideJson, RecipeCategory } from '../../types';
import SaveRecipeModal from './SaveRecipeModal';
import { colors } from '../../constants/theme';
import { shared } from '../../constants/styles';
import FloatingModePill from '../FloatingModePill';

interface Props {
  mealName: string;
  description: string;
  visible: boolean;
  onClose: () => void;
  prefillGuide?: CookingGuide; // skip API call when guide already saved in stash
  ingredients?: string;        // pre-formatted ingredient list for the save modal
  onGuideLoaded?: (guide: CookingGuide) => void;
}

type SavePrefill = { name: string; category: RecipeCategory; description?: string; ingredients?: string; method?: string; guideJson?: RecipeGuideJson };

const VALID_CATEGORIES: RecipeCategory[] = ['mains', 'sauces_dressings', 'sides', 'desserts', 'baking', 'marinades_rubs', 'cocktails', 'glossary'];

function resolveComponentCategory(comp: CookingGuide['components'][0]): RecipeCategory {
  if (comp.category && VALID_CATEGORIES.includes(comp.category as RecipeCategory)) {
    return comp.category as RecipeCategory;
  }
  // AI returned missing/invalid category — keyword guess from name + description
  const text = `${comp.name} ${comp.description ?? ''}`.toLowerCase();
  if (/marinade|rub|spice blend|seasoning|dukkah|chermoula|za'atar/.test(text)) return 'marinades_rubs';
  if (/cake|bread|pastry|tart|pie|biscuit|cookie|dough|crust/.test(text)) return 'baking';
  if (/dessert|pudding|ice cream|sorbet|mousse|compote/.test(text)) return 'desserts';
  if (/side|roast|mash|potato|puree|rice|grain|slaw|salad|vegetables?|coleslaw/.test(text)) return 'sides';
  return 'sauces_dressings';
}

function ComponentCard({
  component,
  stashVersion,
  onSave,
}: {
  component: CookingGuide['components'][0];
  stashVersion: { description: string; method: string | null } | null;
  onSave: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fromStash = component.steps.length === 0 && stashVersion !== null;
  const steps = fromStash
    ? stashVersion!.method?.split('\n').filter(Boolean).map((s) => s.replace(/^\d+\.\s*/, '')) ?? []
    : component.steps;
  const desc = fromStash ? stashVersion!.description : component.description;

  return (
    <View style={styles.componentCard}>
      <TouchableOpacity style={styles.componentHeaderRow} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        <View style={{ flex: 1 }}>
          <Text style={styles.componentName}>{component.name}</Text>
          {fromStash && <Text style={styles.stashBadge}>From Your Recipe Stash</Text>}
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {!expanded && <Text style={styles.componentHint}>Tap for details</Text>}
      {expanded && (
        <>
          {desc ? <Text style={styles.componentDesc}>{desc}</Text> : null}
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNum}>{i + 1}.</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
          {!desc && steps.length === 0 && (
            <Text style={styles.componentHint}>
              {fromStash
                ? 'No details saved in your stash yet — add a method there to see it here.'
                : 'No steps available.'}
            </Text>
          )}
          {!fromStash && (
            <TouchableOpacity
              style={shared.ctaRow}
              disabled={saving || saved}
              onPress={async () => {
                setSaving(true);
                try { await onSave(); setSaved(true); } catch { /* handled in parent */ }
                setSaving(false);
              }}
            >
              <Text style={styles.saveItemBtnText}>
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save to Stash'}
              </Text>
              {!saving && !saved && <Text style={shared.ctaArrow}>→</Text>}
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

export default function CookingGuideModal({ mealName, description, visible, onClose, prefillGuide, ingredients, onGuideLoaded }: Props) {
  const insets = useSafeAreaInsets();
  const { userId, recipes, addRecipe } = useAppStore();

  const [loading, setLoading]   = useState(true);
  const [guide, setGuide]       = useState<CookingGuide | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [savePrefill, setSavePrefill] = useState<SavePrefill | null>(null);
  const [cookMode, setCookMode] = useState(false);

  const toggleCookMode = async () => {
    if (cookMode) {
      if (Platform.OS !== 'web') deactivateKeepAwake();
      setCookMode(false);
    } else {
      if (Platform.OS !== 'web') await activateKeepAwakeAsync();
      setCookMode(true);
    }
  };

  useEffect(() => {
    if (!visible) return;
    if (prefillGuide) {
      setGuide(prefillGuide);
      setLoading(false);
      setError(null);
      onGuideLoaded?.(prefillGuide);
      return;
    }
    setLoading(true);
    setError(null);
    setGuide(null);
    getCookingGuide(mealName, description, recipes.map((r) => r.name), ingredients)
      .then((g) => { setGuide(g); onGuideLoaded?.(g); })
      .catch((e) => setError(e?.message ?? 'Failed to load cooking guide'))
      .finally(() => setLoading(false));
  }, [visible, mealName, description, prefillGuide]);

  // Auto-save glossary terms as soon as the guide loads
  useEffect(() => {
    if (!guide || !userId || guide.glossary.length === 0) return;
    const base = { rating: null, would_cook_again: null, cooked_meal_id: null, ingredients: null, source_url: null, source_book: null, page_number: null, bite_pairing: null, guide_json: null };
    const existing = new Set(useAppStore.getState().recipes.map((r) => r.name.toLowerCase()));
    (async () => {
      for (const term of guide.glossary) {
        if (existing.has(term.term.toLowerCase())) continue;
        try {
          const saved = await saveRecipe(userId, { ...base, name: term.term, category: 'glossary', description: term.definition, method: null });
          addRecipe(saved);
          existing.add(term.term.toLowerCase());
        } catch { /* ok — may already exist */ }
      }
    })();
  }, [guide, userId]);

  const silentlySaveExtras = async (guide: CookingGuide) => {
    if (!userId) return;
    const base = { rating: null, would_cook_again: null, cooked_meal_id: null, ingredients: null, source_url: null, source_book: null, page_number: null, bite_pairing: null, guide_json: null };
    const existing = new Set(useAppStore.getState().recipes.map((r) => r.name.toLowerCase()));
    for (const comp of guide.components) {
      if (comp.steps.length === 0) continue;
      if (existing.has(comp.name.toLowerCase())) continue;
      const compCategory = resolveComponentCategory(comp);
      try {
        const saved = await saveRecipe(userId, { ...base, name: comp.name, category: compCategory, description: comp.description, method: numberedMethod(comp.steps) });
        addRecipe(saved);
      } catch { /* ok */ }
    }
  };

  const handleMainSaved = async () => {
    if (!guide) return;
    setSavePrefill(null);
    await silentlySaveExtras(guide);
  };

  const handleComponentSave = async (comp: CookingGuide['components'][0]) => {
    if (!userId || !guide) return;
    const base = { rating: null, would_cook_again: null, cooked_meal_id: null, ingredients: null, source_url: null, source_book: null, page_number: null, bite_pairing: null, guide_json: null };
    const existing = new Set(recipes.map((r) => r.name.toLowerCase()));
    const compCategory = resolveComponentCategory(comp);

    if (!existing.has(comp.name.toLowerCase())) {
      const saved = await saveRecipe(userId, { ...base, name: comp.name, category: compCategory, description: comp.description, method: numberedMethod(comp.steps) });
      addRecipe(saved);
    }
  };

  const numberedMethod = (steps: string[]) => steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const recipeNames = new Set(recipes.map((r) => r.name.toLowerCase()));
  const getStashVersion = (name: string) => {
    const match = recipes.find((r) => r.name.toLowerCase() === name.toLowerCase());
    return match ? { description: match.description ?? '', method: match.method } : null;
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.headerClose}>×</Text>
              </TouchableOpacity>
              {guide && !prefillGuide ? (
                <TouchableOpacity
                  onPress={() => setSavePrefill({
                    name: mealName, category: 'mains', description,
                    ingredients: ingredients ?? guide.ingredients?.join('\n'),
                    method: numberedMethod(guide.steps),
                    guideJson: guide,
                  })}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.headerSaveBtn}>Save</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.headerTitle}>{mealName}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.brand.primary} />
              <Text style={styles.loadingText}>Building your cooking guide…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => {
                setLoading(true);
                setError(null);
                getCookingGuide(mealName, description, recipes.map((r) => r.name), ingredients)
                  .then((g) => setGuide(g))
                  .catch((e) => setError(e?.message ?? 'Failed to load cooking guide'))
                  .finally(() => setLoading(false));
              }}>
                <Text style={styles.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : guide ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
              showsVerticalScrollIndicator={false}
            >
            <View style={styles.contentCard}>
              {/* How to cook it */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>How to cook it</Text>
                {guide.steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={styles.stepNum}>{i + 1}.</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>

              {/* Components */}
              {guide.components.length > 0 && (
                <View style={styles.section}>
                  {guide.components.map((comp, i) => (
                    <ComponentCard
                      key={i}
                      component={comp}
                      stashVersion={getStashVersion(comp.name)}
                      onSave={() => handleComponentSave(comp)}
                    />
                  ))}
                </View>
              )}

              {/* Glossary */}
              {guide.glossary.length > 0 && (
                <View style={styles.section}>
                  {guide.glossary.map((item, i) => (
                    <View key={i} style={styles.glossaryRow}>
                      <Text style={styles.glossaryTerm}>{item.term}</Text>
                      <Text style={styles.glossaryDef}>{item.definition}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            </ScrollView>
          ) : null}
          {guide && (
            <FloatingModePill
              label="Cook Mode"
              activeLabel="Cook Mode On"
              active={cookMode}
              onPress={toggleCookMode}
              bottom={insets.bottom + 20}
            />
          )}
        </View>
      </Modal>

      {savePrefill && (
        <SaveRecipeModal
          visible
          prefill={{ name: savePrefill.name, category: savePrefill.category, description: savePrefill.description, ingredients: savePrefill.ingredients, method: savePrefill.method }}
          onSave={async (recipe) => {
            if (savePrefill.guideJson) {
              try {
                const updated = await updateRecipe(recipe.id, { guide_json: savePrefill.guideJson });
                useAppStore.getState().updateRecipeInStore(recipe.id, updated);
              } catch { /* non-critical */ }
            }
            await handleMainSaved();
          }}
          onClose={() => setSavePrefill(null)}
        />
      )}
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
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerClose: { fontSize: 28, color: colors.text.muted, fontWeight: '300', lineHeight: 28 },
  headerSaveBtn: { fontSize: 15, color: colors.brand.primary, fontWeight: '700' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text.primary },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, color: colors.text.muted },

  errorContainer: { margin: 20, backgroundColor: colors.state.dangerLighter, borderRadius: 12, padding: 16, gap: 12 },
  errorText: { fontSize: 14, color: colors.state.dangerBright, lineHeight: 20 },
  retryBtn: { backgroundColor: colors.state.dangerBright, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: colors.text.inverse },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  contentCard: {
    backgroundColor: colors.background.surface,
    borderRadius: 16,
    padding: 20,
    gap: 24,
  },

  section: { gap: 12 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: shared.sectionLabel,


  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { fontSize: 15, fontWeight: '700', color: colors.brand.primary, minWidth: 22 },
  stepText: { flex: 1, fontSize: 15, color: colors.text.secondary, lineHeight: 22 },

  componentCard: { backgroundColor: colors.background.elevated, borderRadius: 12, borderWidth: 1, borderColor: colors.border.default, padding: 14, gap: 8 },
  componentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  componentName: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  stashBadge: { fontSize: 11, color: colors.brand.primary, fontWeight: '600', marginTop: 2 },
  chevron: { fontSize: 11, color: colors.text.placeholder, marginTop: 2 },
  componentHint: { fontSize: 12, color: colors.text.placeholder },
  componentDesc: { fontSize: 14, color: colors.text.muted, lineHeight: 20 },

  saveItemBtn: { alignSelf: 'flex-end', marginTop: 4 },
  saveItemBtnText: { fontSize: 13, color: colors.brand.primary, fontWeight: '600' },

  glossaryRow: { gap: 2 },
  glossaryTerm: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  glossaryDef: { fontSize: 14, color: colors.text.secondary, lineHeight: 20 },
});
