import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { getWineMatch } from '../lib/claude';
import type { WineMatchResult } from '../lib/claude';
import { saveRecipe } from '../lib/data';
import { useAppStore } from '../store/useAppStore';
import { colors } from '../constants/theme';
import { shared } from '../constants/styles';

interface Props {
  mealName: string;
  description?: string | null;
  compact?: boolean;
  showGlossary?: boolean;
  showCocktail?: boolean;
}

export default function DrinkPairingSection({
  mealName, description, compact, showGlossary, showCocktail,
}: Props) {
  const { userId, recipes, addRecipe, inventoryItems, userPreferences } = useAppStore();
  const [result, setResult] = useState<WineMatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const doFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const barInventory = showCocktail
        ? inventoryItems
            .filter((i) => (i.location === 'bar' || i.location === 'cellar') && !i.depleted)
            .map((i) => i.name)
        : undefined;
      const data = await getWineMatch({
        meal_name: mealName,
        description: description ?? undefined,
        detail_level: userPreferences?.wine_detail_level ?? 'simple',
        ...(barInventory?.length ? { bar_inventory: barInventory } : {}),
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not load pairing — tap to retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (loading) return;
    if (result) { setExpanded(!expanded); return; }
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    doFetch();
  };

  const handleClear = () => {
    setResult(null);
    setExpanded(false);
  };

  const s = compact ? cs : fs;

  if (!expanded) {
    return (
      <TouchableOpacity style={shared.ctaRow} onPress={handleToggle} hitSlop={{ top: 8, bottom: 8 }}>
        {loading
          ? <ActivityIndicator size="small" color={colors.brand.primary} />
          : <>
              <Text style={s.ctaText}>{result ? 'Suggested drinks' : 'Drink pairing'}</Text>
              <Text style={shared.ctaArrow}>→</Text>
            </>
        }
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.section}>
      <TouchableOpacity onPress={handleToggle} hitSlop={{ top: 4, bottom: 4 }}>
        <Text style={s.sectionLabel}>Suggested drinks</Text>
      </TouchableOpacity>

      {loading && (
        <ActivityIndicator size="small" color={colors.brand.primary} style={{ alignSelf: 'flex-start' }} />
      )}

      {error && (
        <TouchableOpacity onPress={doFetch}>
          <Text style={s.errorText}>{error} Tap to retry.</Text>
        </TouchableOpacity>
      )}

      {result && (
        <>
          {result.pairings.map((p, i) => {
            const inGlossary = showGlossary && recipes.some(
              (r) => r.category === 'glossary' && r.name.toLowerCase() === p.varietal.toLowerCase()
            );
            return (
              <View key={i} style={s.card}>
                <Text style={s.varietal}>{p.varietal}</Text>
                <Text style={s.reason}>{p.reason}</Text>
                {p.pairing_note ? <Text style={s.note}>{p.pairing_note}</Text> : null}
                {showGlossary && userId && (
                  inGlossary
                    ? <Text style={base.glossarySaved}>In glossary ✓</Text>
                    : <TouchableOpacity onPress={async () => {
                        const saved = await saveRecipe(userId, {
                          name: p.varietal, category: 'glossary',
                          description: p.reason + (p.pairing_note ? '\n' + p.pairing_note : ''),
                          ingredients: null, method: null, source_url: null,
                          source_book: null, page_number: null,
                          rating: null, would_cook_again: null,
                          cooked_meal_id: null, guide_json: null, bite_pairing: null,
                        });
                        addRecipe(saved);
                      }}>
                        <Text style={base.glossaryAdd}>+ Save to glossary</Text>
                      </TouchableOpacity>
                )}
              </View>
            );
          })}
          {showCocktail && result.cocktail && (
            <View style={[s.card, base.cocktailCard]}>
              <Text style={[s.varietal, base.cocktailName]}>🍸 {result.cocktail.name}</Text>
              <Text style={s.reason}>{result.cocktail.reason}</Text>
            </View>
          )}
          <View style={base.actionRow}>
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={base.actionText}>×</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={doFetch} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={base.actionText}>Regenerate</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const base = StyleSheet.create({
  glossaryAdd: { fontSize: 12, color: colors.brand.primary, fontWeight: '600', marginTop: 6 },
  glossarySaved: { fontSize: 12, color: colors.text.placeholder, marginTop: 6 },
  cocktailCard: { backgroundColor: colors.brand.plumLighter, borderColor: colors.brand.plumLight },
  cocktailName: { color: colors.brand.plum },
  actionRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  actionText: { fontSize: 12, color: colors.text.placeholder },
});

const fs = StyleSheet.create({
  section: { gap: 8 },
  sectionLabel: shared.sectionLabel,
  ctaText: { fontSize: 13, fontWeight: '600', color: colors.brand.primary },
  card: { backgroundColor: colors.background.elevated, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, padding: 12, gap: 4 },
  varietal: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  reason: { fontSize: 14, color: colors.text.secondary, lineHeight: 20 },
  note: { fontSize: 13, color: colors.text.muted, lineHeight: 19, marginTop: 4 },
  errorText: { fontSize: 13, color: colors.state.dangerBright },
});

const cs = StyleSheet.create({
  section: { gap: 6 },
  sectionLabel: shared.sectionLabel,
  ctaText: { fontSize: 13, fontWeight: '600', color: colors.brand.primary },
  card: { backgroundColor: colors.background.elevated, borderRadius: 10, borderWidth: 1, borderColor: colors.border.default, padding: 10, gap: 3 },
  varietal: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  reason: { fontSize: 13, color: colors.text.secondary, lineHeight: 18 },
  note: { fontSize: 12, color: colors.text.muted, lineHeight: 17, marginTop: 3 },
  errorText: { fontSize: 12, color: colors.state.dangerBright },
});
