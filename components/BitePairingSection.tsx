import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { generateBitePairing } from '../lib/claude';
import { saveRecipeBitePairing, updateRecipe } from '../lib/data';
import { useAppStore } from '../store/useAppStore';
import { colors } from '../constants/theme';
import { shared } from '../constants/styles';

function parseBitePairing(text: string): { name: string; reason: string }[] {
  const parts = text.split(/\*\*/).filter(Boolean);
  const items: { name: string; reason: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const name = parts[i].trim();
    const reason = (parts[i + 1] ?? '').replace(/^[\s—–-]+/, '').replace(/\.\s*$/, '.').trim();
    if (name) items.push({ name, reason });
  }
  return items.length > 0 ? items : [{ name: 'Suggested bites', reason: text }];
}

interface Props {
  recipeId: string;
  recipeName: string;
  recipeDescription?: string | null;
  bitePairing: string | null;
}

export default function BitePairingSection({
  recipeId, recipeName, recipeDescription, bitePairing,
}: Props) {
  const { updateRecipeInStore } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const doGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateBitePairing(recipeName, recipeDescription);
      await saveRecipeBitePairing(recipeId, result);
      updateRecipeInStore(recipeId, { bite_pairing: result });
      setExpanded(true);
    } catch (e: any) {
      setError(e.message ?? 'Could not generate bite pairing.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (loading) return;
    if (bitePairing) { setExpanded(!expanded); return; }
    setExpanded(true);
    doGenerate();
  };

  const handleClear = () => {
    updateRecipeInStore(recipeId, { bite_pairing: null });
    updateRecipe(recipeId, { bite_pairing: null });
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <TouchableOpacity style={shared.ctaRow} onPress={handleToggle} hitSlop={{ top: 8, bottom: 8 }}>
        {loading
          ? <ActivityIndicator size="small" color={colors.brand.primary} />
          : <>
              <Text style={styles.ctaText}>{bitePairing ? 'Suggested bites' : 'Bite pairing'}</Text>
              <Text style={shared.ctaArrow}>→</Text>
            </>
        }
      </TouchableOpacity>
    );
  }

  const bites = bitePairing ? parseBitePairing(bitePairing) : [];

  return (
    <View style={styles.section}>
      <TouchableOpacity onPress={handleToggle} hitSlop={{ top: 4, bottom: 4 }}>
        <Text style={styles.sectionLabel}>Suggested bites</Text>
      </TouchableOpacity>

      {loading && (
        <ActivityIndicator size="small" color={colors.brand.primary} style={{ alignSelf: 'flex-start' }} />
      )}

      {error && (
        <TouchableOpacity onPress={doGenerate}>
          <Text style={styles.errorText}>{error} Tap to retry.</Text>
        </TouchableOpacity>
      )}

      {bites.map((b, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.varietal}>{b.name}</Text>
          <Text style={styles.reason}>{b.reason}</Text>
        </View>
      ))}

      {bitePairing && (
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.actionText}>×</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={doGenerate} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.actionText}>Regenerate</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  sectionLabel: shared.sectionLabel,
  ctaText: { fontSize: 13, fontWeight: '600', color: colors.brand.primary },
  card: { backgroundColor: colors.background.elevated, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, padding: 10, gap: 3 },
  varietal: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  reason: { fontSize: 13, color: colors.text.secondary, lineHeight: 18 },
  errorText: { fontSize: 12, color: colors.state.dangerBright },
  actionRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  actionText: { fontSize: 12, color: colors.text.placeholder },
});
