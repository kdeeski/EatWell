import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recipe, RecipeCategory } from '../../types';
import SaveRecipeModal from './SaveRecipeModal';

const VALID_CATEGORIES: RecipeCategory[] = [
  'mains', 'sauces_dressings', 'sides', 'desserts', 'baking', 'marinades_rubs', 'glossary', 'cocktails',
];

const PROMPT_TEXT = `Please format this recipe as JSON using exactly this structure — no extra fields:
{
  "name": "Recipe Name in Title Case",
  "category": "mains | sauces_dressings | sides | desserts | baking | marinades_rubs | glossary | cocktails",
  "description": "One sentence describing the dish and what makes it good.",
  "ingredients": "150g Chicken Thighs\\n2 cloves Garlic\\n1 tsp Smoked Paprika",
  "method": "1. First step.\\n2. Second step.\\n3. Third step."
}

Recipe to format:
[paste your recipe here]`;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** When provided, parsed data is returned via callback instead of opening SaveRecipeModal */
  onPrefill?: (data: Partial<Pick<Recipe, 'name' | 'category' | 'description' | 'ingredients' | 'method'>>) => void;
}

export default function ImportFromClaudeModal({ visible, onClose, onPrefill }: Props) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Partial<Pick<Recipe, 'name' | 'category' | 'description' | 'ingredients' | 'method'>> | null>(null);
  const [showSave, setShowSave] = useState(false);

  const handleCopy = async () => {
    await Share.share({ message: PROMPT_TEXT });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleLoad = () => {
    setError(null);
    if (!json.trim()) { setError('Paste the JSON from Claude first.'); return; }

    let parsed: any;
    try {
      // Extract the first {...} block from whatever Claude returned
      const match = json.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found');
      parsed = JSON.parse(match[0]);
    } catch {
      setError('Could not parse the JSON. Make sure you copied it correctly.');
      return;
    }

    if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
      setError('Missing required field: name');
      return;
    }

    const category: RecipeCategory = VALID_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : 'mains';

    const data = {
      name: String(parsed.name).trim(),
      category,
      description: parsed.description ? String(parsed.description).trim() : undefined,
      ingredients: parsed.ingredients ? String(parsed.ingredients).trim() : undefined,
      method: parsed.method ? String(parsed.method).trim() : undefined,
    };

    if (onPrefill) {
      // Callback mode — fill parent form and close
      setJson('');
      setError(null);
      onPrefill(data);
      onClose();
      return;
    }

    setPrefill(data);
    setShowSave(true);
  };

  const handleClose = () => {
    setJson('');
    setError(null);
    setCopied(false);
    onClose();
  };

  return (
    <>
      <Modal
        visible={visible && !showSave}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.headerBtn}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Import from Claude</Text>
              <View style={{ minWidth: 56 }} />
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 20 }]}
              keyboardShouldPersistTaps="handled"
            >
              {/* Step 1 */}
              <View style={styles.step}>
                <Text style={styles.stepNumber}>1</Text>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>Copy the prompt</Text>
                  <Text style={styles.stepDesc}>
                    Tap below to share the prompt, then paste it into Claude with your recipe. Claude will return a JSON block.
                  </Text>
                  <TouchableOpacity style={styles.promptBox} onPress={handleCopy} activeOpacity={0.8}>
                    <Text style={styles.promptText} numberOfLines={6}>{PROMPT_TEXT}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.copyBtn, copied && styles.copyBtnDone]}
                    onPress={handleCopy}
                  >
                    <Text style={[styles.copyBtnText, copied && styles.copyBtnTextDone]}>
                      {copied ? 'Shared ✓' : 'Share Prompt'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Step 2 */}
              <View style={styles.step}>
                <Text style={styles.stepNumber}>2</Text>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>Paste Claude's JSON here</Text>
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <TextInput
                    style={styles.jsonInput}
                    value={json}
                    onChangeText={(v) => { setJson(v); setError(null); }}
                    placeholder={'{\n  "name": "...",\n  ...\n}'}
                    placeholderTextColor="#9CA3AF"
                    multiline
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Sticky footer — stays above keyboard */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity style={styles.loadBtn} onPress={handleLoad}>
                <Text style={styles.loadBtnText}>Load Recipe →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showSave && prefill && (
        <SaveRecipeModal
          visible={showSave}
          prefill={prefill}
          onSave={() => {
            setShowSave(false);
            setJson('');
            setPrefill(null);
            onClose();
          }}
          onClose={() => {
            setShowSave(false);
            setPrefill(null);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerBtn: { fontSize: 16, color: '#6B7280', fontWeight: '500', minWidth: 56 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 28 },

  step: { flexDirection: 'row', gap: 14 },
  stepNumber: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#3B7A57', color: '#FFFFFF',
    fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 28,
  },
  stepBody: { flex: 1, gap: 10 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  stepDesc: { fontSize: 14, color: '#6B7280', lineHeight: 20 },

  promptBox: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, padding: 14,
  },
  promptText: { fontSize: 13, color: '#374151', lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  copyBtn: {
    backgroundColor: '#3B7A57', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  copyBtnDone: { backgroundColor: '#059669' },
  copyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  copyBtnTextDone: { color: '#FFFFFF' },

  errorText: { fontSize: 14, color: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10 },

  jsonInput: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, padding: 14, minHeight: 160,
    fontSize: 13, color: '#1C1C1E', lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  loadBtn: {
    backgroundColor: '#1C1C1E', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  loadBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
