import { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCookingGuide } from '../../lib/claude';
import type { CookingGuide } from '../../lib/claude';
import type { Recipe } from '../../types';
import SaveRecipeModal from './SaveRecipeModal';

interface Props {
  mealName: string;
  description: string;
  visible: boolean;
  onClose: () => void;
  onSaveToStash: (guide: CookingGuide) => void;
}

function ComponentCard({ component }: { component: CookingGuide['components'][0] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.componentCard}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.componentHeader}>
        <Text style={styles.componentName}>{component.name}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </View>
      {!expanded && (
        <Text style={styles.componentHint}>Tap for details</Text>
      )}
      {expanded && (
        <>
          <Text style={styles.componentDesc}>{component.description}</Text>
          {component.steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNum}>{i + 1}.</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </>
      )}
    </TouchableOpacity>
  );
}

export default function CookingGuideModal({ mealName, description, visible, onClose, onSaveToStash }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading]   = useState(true);
  const [guide, setGuide]       = useState<CookingGuide | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setGuide(null);
    getCookingGuide(mealName, description)
      .then((g) => setGuide(g))
      .catch((e) => setError(e?.message ?? 'Failed to load cooking guide'))
      .finally(() => setLoading(false));
  }, [visible, mealName, description]);

  const handleSaveToStash = () => {
    if (guide) {
      onSaveToStash(guide);
      setShowSave(true);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.headerBtn}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{mealName}</Text>
            <View style={{ minWidth: 48 }} />
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
                getCookingGuide(mealName, description)
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
                  <Text style={styles.sectionLabel}>Components</Text>
                  {guide.components.map((comp, i) => (
                    <ComponentCard key={i} component={comp} />
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

              {/* Save to stash */}
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveToStash}>
                <Text style={styles.saveBtnText}>Save to Recipe Stash →</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      {showSave && guide && (
        <SaveRecipeModal
          visible={showSave}
          prefill={{
            name: mealName,
            category: 'mains',
            description: description,
            method: guide.steps.join('\n'),
          }}
          onSave={(recipe) => {
            setShowSave(false);
            onClose();
          }}
          onClose={() => setShowSave(false)}
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
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1C1C1E', textAlign: 'center', marginHorizontal: 8 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, color: '#6B7280' },

  errorContainer: {
    margin: 20,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  errorText: { fontSize: 14, color: '#EF4444', lineHeight: 20 },
  retryBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 24 },

  section: { gap: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { fontSize: 15, fontWeight: '700', color: '#3B7A57', minWidth: 22 },
  stepText: { flex: 1, fontSize: 15, color: '#374151', lineHeight: 22 },

  componentCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 8,
  },
  componentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  componentName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  chevron: { fontSize: 11, color: '#9CA3AF' },
  componentHint: { fontSize: 12, color: '#9CA3AF' },
  componentDesc: { fontSize: 14, color: '#6B7280', lineHeight: 20 },

  glossaryRow: { gap: 2 },
  glossaryTerm: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  glossaryDef: { fontSize: 14, color: '#374151', lineHeight: 20 },

  saveBtn: {
    backgroundColor: '#3B7A57',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
