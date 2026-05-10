import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BarItem, SpiritType } from '../../types';

const VALID_SPIRIT_TYPES: SpiritType[] = [
  'whiskey', 'cognac_brandy', 'gin', 'vodka', 'rum',
  'tequila_mezcal', 'vermouth_fortified', 'liqueur_aperitif',
  'bitters', 'syrup_mixer', 'other',
];

const PROMPT_TEXT = `I'm going to show you a photo of a bottle for my home bar. Please read the label and return ONLY valid JSON in this exact structure — no explanation, no markdown:

{
  "name": "Full product name, e.g. Hendrick's Gin",
  "spirit_type": "one of: whiskey | cognac_brandy | gin | vodka | rum | tequila_mezcal | vermouth_fortified | liqueur_aperitif | bitters | syrup_mixer | other",
  "abv": 40.0,
  "size_ml": 700,
  "country": "Country of origin, e.g. Scotland",
  "notes": "One optional sentence — age statement, flavour style, or anything notable. Omit if nothing useful."
}

Rules:
- abv: numeric only (e.g. 40.0), null if not visible
- size_ml: numeric only (e.g. 700), null if not visible
- country: null if unclear
- notes: null if nothing useful to say`;

type BarItemPrefill = Pick<BarItem, 'name' | 'spirit_type' | 'abv' | 'size_ml' | 'country' | 'notes'>;

interface Props {
  visible: boolean;
  onClose: () => void;
  onPrefill: (data: BarItemPrefill) => void;
}

export default function ImportBarItemModal({ visible, onClose, onPrefill }: Props) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleShare = async () => {
    await Share.share({ message: PROMPT_TEXT });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleLoad = () => {
    setError(null);
    if (!json.trim()) { setError('Paste the JSON from Claude first.'); return; }

    let parsed: any;
    try {
      const match = json.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found');
      parsed = JSON.parse(match[0]);
    } catch {
      setError('Could not parse the JSON — make sure you copied it correctly.');
      return;
    }

    if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
      setError('Missing required field: name');
      return;
    }

    const spirit_type: SpiritType = VALID_SPIRIT_TYPES.includes(parsed.spirit_type)
      ? parsed.spirit_type
      : 'other';

    const data: BarItemPrefill = {
      name: String(parsed.name).trim(),
      spirit_type,
      abv: typeof parsed.abv === 'number' ? parsed.abv : null,
      size_ml: typeof parsed.size_ml === 'number' ? parsed.size_ml : null,
      country: parsed.country ? String(parsed.country).trim() : null,
      notes: parsed.notes ? String(parsed.notes).trim() : null,
    };

    setJson('');
    setError(null);
    onPrefill(data);
    onClose();
  };

  const handleClose = () => {
    setJson('');
    setError(null);
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
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
                <Text style={styles.stepTitle}>Share the prompt to Claude</Text>
                <Text style={styles.stepDesc}>
                  Tap below to share the prompt. Paste it into Claude on your phone, attach a photo of the bottle, and send. Claude will return a JSON block.
                </Text>
                <TouchableOpacity style={styles.promptBox} onPress={handleShare} activeOpacity={0.8}>
                  <Text style={styles.promptText} numberOfLines={8}>{PROMPT_TEXT}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.copyBtn, copied && styles.copyBtnDone]}
                  onPress={handleShare}
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
                  placeholder={'{\n  "name": "Hendrick\'s Gin",\n  "spirit_type": "gin",\n  ...\n}'}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          </ScrollView>

          {/* Sticky footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.loadBtn} onPress={handleLoad}>
              <Text style={styles.loadBtnText}>Load Bottle →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  promptText: {
    fontSize: 13, color: '#374151', lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

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
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  loadBtn: {
    backgroundColor: '#1C1C1E', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  loadBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
