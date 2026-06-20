import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recipe, RecipeCategory } from '../../types';
import { formatRecipeFromText } from '../../lib/claude';
import SaveRecipeModal from './SaveRecipeModal';
import { colors } from '../../constants/theme';
import { shareOrCopy } from '../../lib/shareOrCopy';

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

type Mode = 'paste' | 'manual';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** When provided, parsed data is returned via callback instead of opening SaveRecipeModal */
  onPrefill?: (data: Partial<Pick<Recipe, 'name' | 'category' | 'description' | 'ingredients' | 'method'>>) => void;
}

export default function ImportFromClaudeModal({ visible, onClose, onPrefill }: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('paste');

  // Paste-text mode state
  const [pasteText, setPasteText] = useState('');
  const [formatting, setFormatting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Manual JSON mode state
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Shared save state
  const [prefill, setPrefill] = useState<Partial<Pick<Recipe, 'name' | 'category' | 'description' | 'ingredients' | 'method'>> | null>(null);
  const [showSave, setShowSave] = useState(false);

  const handleCopy = async () => {
    const action = await shareOrCopy(PROMPT_TEXT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const applyParsed = (parsed: any) => {
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
      onPrefill(data);
      handleClose();
      return;
    }

    setPrefill(data);
    setShowSave(true);
  };

  const handleFormat = async () => {
    if (formatting) return;
    setPasteError(null);
    if (!pasteText.trim()) { setPasteError('Paste your recipe text first.'); return; }

    setFormatting(true);
    try {
      const result = await formatRecipeFromText(pasteText.trim());
      if (!result.name?.trim()) { setPasteError('Claude couldn\'t find a recipe name — make sure you\'ve pasted the full recipe.'); return; }
      applyParsed(result);
    } catch (e: any) {
      setPasteError(e.message ?? 'Something went wrong — please try again.');
    } finally {
      setFormatting(false);
    }
  };

  const handleLoadJson = () => {
    setJsonError(null);
    if (!json.trim()) { setJsonError('Paste the JSON from Claude first.'); return; }

    let parsed: any;
    try {
      const match = json.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found');
      parsed = JSON.parse(match[0]);
    } catch {
      setJsonError('Could not parse the JSON. Make sure you copied it correctly.');
      return;
    }

    if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
      setJsonError('Missing required field: name');
      return;
    }

    applyParsed(parsed);
  };

  const handleClose = () => {
    setPasteText('');
    setPasteError(null);
    setJson('');
    setJsonError(null);
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
              <View style={styles.headerTopRow}>
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.headerClose}>×</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.headerTitle}>Import from Claude</Text>
            </View>

            {/* Mode toggle */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleTab, mode === 'paste' && styles.toggleTabActive]}
                onPress={() => setMode('paste')}
              >
                <Text style={[styles.toggleTabText, mode === 'paste' && styles.toggleTabTextActive]}>Paste recipe text</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleTab, mode === 'manual' && styles.toggleTabActive]}
                onPress={() => setMode('manual')}
              >
                <Text style={[styles.toggleTabText, mode === 'manual' && styles.toggleTabTextActive]}>Use Claude.ai</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 20 }]}
              keyboardShouldPersistTaps="handled"
            >
              {mode === 'paste' ? (
                /* ── Paste text mode ── */
                <View style={styles.pasteSection}>
                  <Text style={styles.pasteDesc}>
                    Copy any recipe text — from NYT Cooking, a cookbook, anywhere — and paste it below. Claude will structure it automatically.
                  </Text>
                  {pasteError ? <Text style={styles.errorText}>{pasteError}</Text> : null}
                  <TextInput
                    style={styles.pasteInput}
                    value={pasteText}
                    onChangeText={(v) => { setPasteText(v); setPasteError(null); }}
                    placeholder="Paste recipe text here…"
                    placeholderTextColor={colors.text.placeholder}
                    multiline
                    textAlignVertical="top"
                    autoCapitalize="sentences"
                    autoCorrect={false}
                  />
                </View>
              ) : (
                /* ── Manual JSON mode ── */
                <>
                  <View style={styles.step}>
                    <Text style={styles.stepLabel}>Step 1</Text>
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
                        {copied ? 'Copied ✓' : 'Copy Prompt'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.step}>
                    <Text style={styles.stepLabel}>Step 2</Text>
                    <Text style={styles.stepTitle}>Paste Claude's JSON here</Text>
                    {jsonError ? <Text style={styles.errorText}>{jsonError}</Text> : null}
                    <TextInput
                      style={styles.jsonInput}
                      value={json}
                      onChangeText={(v) => { setJson(v); setJsonError(null); }}
                      placeholder={'{\n  "name": "...",\n  ...\n}'}
                      placeholderTextColor={colors.text.placeholder}
                      multiline
                      textAlignVertical="top"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </>
              )}
            </ScrollView>

            {/* Sticky footer */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
              {mode === 'paste' ? (
                <TouchableOpacity
                  style={[styles.loadBtn, formatting && styles.loadBtnDisabled]}
                  onPress={handleFormat}
                  disabled={formatting}
                >
                  {formatting
                    ? <ActivityIndicator size="small" color={colors.text.inverse} />
                    : <Text style={styles.loadBtnText}>Format with Claude →</Text>
                  }
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.loadBtn} onPress={handleLoadJson}>
                  <Text style={styles.loadBtnText}>Load Recipe →</Text>
                </TouchableOpacity>
              )}
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
            setPasteText('');
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
  container: { flex: 1, backgroundColor: colors.background.app },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerClose: { fontSize: 28, color: colors.text.muted, fontWeight: '300', lineHeight: 28 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text.primary },

  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: colors.background.elevated,
    borderRadius: 10,
    padding: 3,
  },
  toggleTab: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
  },
  toggleTabActive: { backgroundColor: colors.background.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  toggleTabText: { fontSize: 14, fontWeight: '500', color: colors.text.placeholder },
  toggleTabTextActive: { color: colors.text.primary, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 28 },

  pasteSection: { gap: 12 },
  pasteDesc: { fontSize: 14, color: colors.text.muted, lineHeight: 20 },
  pasteInput: {
    backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 12, padding: 14, minHeight: 260,
    fontSize: 14, color: colors.text.primary, lineHeight: 20,
    textAlignVertical: 'top',
  },

  step: { gap: 10 },
  stepLabel: { fontSize: 13, fontWeight: '600', color: colors.text.placeholder, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  stepDesc: { fontSize: 14, color: colors.text.muted, lineHeight: 20 },

  promptBox: {
    backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 12, padding: 14,
  },
  promptText: { fontSize: 13, color: colors.text.secondary, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  copyBtn: {
    backgroundColor: colors.brand.primary, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  copyBtnDone: { backgroundColor: colors.brand.olive },
  copyBtnText: { color: colors.text.inverse, fontSize: 15, fontWeight: '700' },
  copyBtnTextDone: { color: colors.text.inverse },

  errorText: { fontSize: 14, color: colors.state.dangerBright, backgroundColor: colors.state.dangerLighter, borderRadius: 8, padding: 10 },

  jsonInput: {
    backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 12, padding: 14, minHeight: 160,
    fontSize: 13, color: colors.text.primary, lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.hairline,
    backgroundColor: colors.background.app,
  },
  loadBtn: {
    backgroundColor: colors.brand.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  loadBtnDisabled: { opacity: 0.5 },
  loadBtnText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700' },
});
