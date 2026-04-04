import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCookingGuide } from '../../lib/claude';
import type { CookingGuide } from '../../lib/claude';
import { saveRecipe, updateRecipe } from '../../lib/data';
import { useAppStore } from '../../store/useAppStore';
import type { RecipeGuideJson } from '../../types';
import SaveRecipeModal from './SaveRecipeModal';
import CookModeModal from './CookModeModal';

interface Props {
  mealName: string;
  description: string;
  visible: boolean;
  onClose: () => void;
}

type SavePrefill = { name: string; category: 'mains' | 'component'; description?: string; method?: string; guideJson?: RecipeGuideJson };

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
    ? stashVersion!.method?.split('\n').filter(Boolean) ?? []
    : component.steps;
  const desc = fromStash ? stashVersion!.description : component.description;

  return (
    <View style={styles.componentCard}>
      <TouchableOpacity style={styles.componentHeaderRow} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        <View style={{ flex: 1 }}>
          <Text style={styles.componentName}>{component.name}</Text>
          {fromStash && <Text style={styles.stashBadge}>From Your Stash</Text>}
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {!expanded && <Text style={styles.componentHint}>Tap for details</Text>}
      {expanded && (
        <>
          <Text style={styles.componentDesc}>{desc}</Text>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNum}>{i + 1}.</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
          {!fromStash && (
            <TouchableOpacity
              style={styles.saveItemBtn}
              disabled={saving || saved}
              onPress={async () => {
                setSaving(true);
                try { await onSave(); setSaved(true); } catch { /* handled in parent */ }
                setSaving(false);
              }}
            >
              <Text style={styles.saveItemBtnText}>
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save to Stash →'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

export default function CookingGuideModal({ mealName, description, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { userId, recipes, addRecipe } = useAppStore();

  const [loading, setLoading]   = useState(true);
  const [guide, setGuide]       = useState<CookingGuide | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [savePrefill, setSavePrefill] = useState<SavePrefill | null>(null);
  const [showCookMode, setShowCookMode] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setGuide(null);
    getCookingGuide(mealName, description, recipes.map((r) => r.name))
      .then((g) => setGuide(g))
      .catch((e) => setError(e?.message ?? 'Failed to load cooking guide'))
      .finally(() => setLoading(false));
  }, [visible, mealName, description]);

  const silentlySaveExtras = async (guide: CookingGuide) => {
    if (!userId) return;
    const base = { rating: null, would_cook_again: null, cooked_meal_id: null, ingredients: null, source_url: null, guide_json: null };
    const existing = new Set(useAppStore.getState().recipes.map((r) => `${r.category}::${r.name.toLowerCase()}`));
    for (const comp of guide.components) {
      if (comp.steps.length === 0) continue; // already in stash
      if (existing.has(`component::${comp.name.toLowerCase()}`)) continue;
      try {
        const saved = await saveRecipe(userId, { ...base, name: comp.name, category: 'component', description: comp.description, method: comp.steps.join('\n') });
        addRecipe(saved);
      } catch { /* ok */ }
    }
    for (const term of guide.glossary) {
      if (existing.has(`glossary::${term.term.toLowerCase()}`)) continue;
      try {
        const saved = await saveRecipe(userId, { ...base, name: term.term, category: 'glossary', description: term.definition, method: null });
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
    const base = { rating: null, would_cook_again: null, cooked_meal_id: null, ingredients: null, source_url: null, guide_json: null };
    const existing = new Set(recipes.map((r) => `${r.category}::${r.name.toLowerCase()}`));

    if (!existing.has(`component::${comp.name.toLowerCase()}`)) {
      const saved = await saveRecipe(userId, { ...base, name: comp.name, category: 'component', description: comp.description, method: comp.steps.join('\n') });
      addRecipe(saved);
    }
    for (const term of guide.glossary) {
      if (!existing.has(`glossary::${term.term.toLowerCase()}`)) {
        try {
          const g = await saveRecipe(userId, { ...base, name: term.term, category: 'glossary', description: term.definition, method: null });
          addRecipe(g);
        } catch { /* ok if glossary term conflicts */ }
      }
    }
  };

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
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.headerBtn}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{mealName}</Text>
            {guide ? (
              <TouchableOpacity
                onPress={() => setSavePrefill({
                  name: mealName, category: 'mains', description,
                  method: guide.steps.join('\n'),
                  guideJson: guide,
                })}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.headerSaveBtn}>Save</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ minWidth: 48 }} />
            )}
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B7A57" />
              <Text style={styles.loadingText}>Building your cooking guide…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => {
                setLoading(true);
                setError(null);
                getCookingGuide(mealName, description, recipes.map((r) => r.name))
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
              {/* How to cook it */}
              <View style={styles.section}>
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel}>How to cook it</Text>
                  <TouchableOpacity style={styles.cookModeBtn} onPress={() => setShowCookMode(true)}>
                    <Text style={styles.cookModeBtnText}>Cook Mode</Text>
                  </TouchableOpacity>
                </View>
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
                  <Text style={styles.sectionLabel}>Components</Text>
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
                  <Text style={styles.sectionLabel}>Glossary</Text>
                  {guide.glossary.map((item, i) => (
                    <View key={i} style={styles.glossaryRow}>
                      <Text style={styles.glossaryTerm}>{item.term}</Text>
                      <Text style={styles.glossaryDef}>{item.definition}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      {showCookMode && guide && (
        <CookModeModal
          recipeName={mealName}
          method={guide.steps.join('\n')}
          onClose={() => setShowCookMode(false)}
        />
      )}

      {savePrefill && (
        <SaveRecipeModal
          visible
          prefill={{ name: savePrefill.name, category: savePrefill.category, description: savePrefill.description, method: savePrefill.method }}
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
  headerBtn: { fontSize: 16, color: '#6B7280', fontWeight: '500', minWidth: 48 },
  headerSaveBtn: { fontSize: 16, color: '#3B7A57', fontWeight: '700', minWidth: 48, textAlign: 'right' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1C1C1E', textAlign: 'center', marginHorizontal: 8 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, color: '#6B7280' },

  errorContainer: { margin: 20, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, gap: 12 },
  errorText: { fontSize: 14, color: '#EF4444', lineHeight: 20 },
  retryBtn: { backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 24 },

  section: { gap: 12 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },

  cookModeBtn: { backgroundColor: '#1C1C1E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  cookModeBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },

  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { fontSize: 15, fontWeight: '700', color: '#3B7A57', minWidth: 22 },
  stepText: { flex: 1, fontSize: 15, color: '#374151', lineHeight: 22 },

  componentCard: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, gap: 8 },
  componentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  componentName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  stashBadge: { fontSize: 11, color: '#3B7A57', fontWeight: '600', marginTop: 2 },
  chevron: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  componentHint: { fontSize: 12, color: '#9CA3AF' },
  componentDesc: { fontSize: 14, color: '#6B7280', lineHeight: 20 },

  saveItemBtn: { alignSelf: 'flex-end', marginTop: 4 },
  saveItemBtnText: { fontSize: 13, color: '#3B7A57', fontWeight: '600' },

  glossaryRow: { gap: 2 },
  glossaryTerm: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  glossaryDef: { fontSize: 14, color: '#374151', lineHeight: 20 },
});
