import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addGardenPlant, updateGardenPlant } from '../../lib/data';
import type { GardenPlant, PlantStatus } from '../../types';
import { colors } from '../../constants/theme';
import { shared } from '../../constants/styles';

type AddMode = 'planting' | 'wishlist';

interface Props {
  visible: boolean;
  initialName?: string;
  editPlant?: GardenPlant | null;
  userId: string;
  onSave: (plant: GardenPlant) => void;
  onClose: () => void;
}

function toISODate(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function AddPlantModal({ visible, initialName, editPlant, userId, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const today = toISODate(new Date());

  const [addMode, setAddMode]             = useState<AddMode>('planting');
  const [plantName, setPlantName]         = useState('');
  const [variety, setVariety]             = useState('');
  const [locationNote, setLocationNote]   = useState('');
  const [plantedDate, setPlantedDate]     = useState(today);
  const [expectedReady, setExpectedReady] = useState('');
  const [isCutAndComeAgain, setIsCutAndComeAgain] = useState(false);
  const [quantityPlanted, setQuantityPlanted] = useState('');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [varietySuggestions, setVarietySuggestions] = useState<string[]>([]);
  const [varietyLoading, setVarietyLoading] = useState(false);

  const isEditing = !!editPlant;

  const handleOpen = () => {
    setVarietySuggestions([]);
    setVarietyLoading(false);
    if (editPlant) {
      setAddMode(editPlant.status === 'wishlist' ? 'wishlist' : 'planting');
      setPlantName(editPlant.plant_name);
      setVariety(editPlant.variety ?? '');
      setLocationNote(editPlant.location_note ?? '');
      setPlantedDate(editPlant.planted_date ?? '');
      setExpectedReady(editPlant.expected_ready_date ?? '');
      setIsCutAndComeAgain(editPlant.is_cut_and_come_again);
      setQuantityPlanted(editPlant.quantity_planted != null ? String(editPlant.quantity_planted) : '');
      setNotes(editPlant.notes ?? '');
    } else {
      setAddMode('planting');
      setPlantName(initialName ?? '');
      setVariety('');
      setLocationNote('');
      setPlantedDate(today);
      setExpectedReady('');
      setIsCutAndComeAgain(false);
      setQuantityPlanted('');
      setNotes('');
    }
  };

  const suggestVarieties = async () => {
    if (!plantName.trim() || varietyLoading) return;
    setVarietyLoading(true);
    try {
      const url = 'https://xjscuzizvxawfapmhdct.supabase.co/functions/v1/suggest-varieties';
      const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqc2N1eml6dnhhd2ZhcG1oZGN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODY1MDksImV4cCI6MjA5MDE2MjUwOX0.MzpYCE5ROSdMALHZMVYDJ0zBnk3lZbBG5Xwh2_HW1o0';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
        body: JSON.stringify({ plant_name: plantName.trim() }),
      });
      const data = await response.json();
      if (data.varieties && Array.isArray(data.varieties)) {
        setVarietySuggestions(data.varieties);
      }
    } catch {
      // Silent — variety suggestions are non-critical
    } finally {
      setVarietyLoading(false);
    }
  };

  const handleSave = async () => {
    if (!plantName.trim()) {
      Alert.alert('Plant name required', 'Please enter a plant name.');
      return;
    }
    const isWishlist = addMode === 'wishlist';
    const status: PlantStatus = isWishlist ? 'wishlist' : 'planted';
    setSaving(true);
    try {
      if (isEditing) {
        const updated = await updateGardenPlant(editPlant.id, {
          plant_name: plantName.trim(),
          variety: variety.trim() || null,
          location_note: locationNote.trim() || null,
          planted_date: isWishlist ? null : (plantedDate || today),
          expected_ready_date: isWishlist ? null : (expectedReady.trim() || null),
          status,
          quantity_planted: isWishlist ? null : (quantityPlanted ? parseFloat(quantityPlanted) || null : null),
          notes: notes.trim() || null,
          is_cut_and_come_again: isWishlist ? false : isCutAndComeAgain,
        });
        onSave(updated);
      } else {
        const plant = await addGardenPlant({
          user_id: userId,
          plant_name: plantName.trim(),
          variety: variety.trim() || null,
          location_note: isWishlist ? null : (locationNote.trim() || null),
          planted_date: isWishlist ? null : (plantedDate || today),
          expected_ready_date: isWishlist ? null : (expectedReady.trim() || null),
          status,
          quantity_planted: isWishlist ? null : (quantityPlanted ? parseFloat(quantityPlanted) || null : null),
          notes: notes.trim() || null,
          is_cut_and_come_again: isWishlist ? false : isCutAndComeAgain,
        });
        onSave(plant);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save plant.');
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
      onShow={handleOpen}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.headerClose}>×</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={[styles.headerSaveBtn, saving && styles.saveDim]}>Save</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.headerTitle}>{isEditing ? 'Edit Plant' : addMode === 'wishlist' ? 'Add to List' : 'Add Plant'}</Text>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            {/* Mode selector */}
            {!isEditing && (
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[styles.modePill, addMode === 'planting' && styles.modePillActive]}
                  onPress={() => setAddMode('planting')}
                >
                  <Text style={[styles.modePillText, addMode === 'planting' && styles.modePillTextActive]}>Planting</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modePill, addMode === 'wishlist' && styles.modePillActive]}
                  onPress={() => setAddMode('wishlist')}
                >
                  <Text style={[styles.modePillText, addMode === 'wishlist' && styles.modePillTextActive]}>Add to List</Text>
                </TouchableOpacity>
              </View>
            )}

            <FieldLabel>Plant Name *</FieldLabel>
            <TextInput
              style={styles.input}
              value={plantName}
              onChangeText={(t) => { setPlantName(t); setVarietySuggestions([]); }}
              placeholder="e.g. Basil"
              placeholderTextColor={colors.text.placeholder}
              autoFocus={!isEditing}
            />

            <View style={styles.varietyHeader}>
              <FieldLabel>Variety</FieldLabel>
              {plantName.trim().length > 0 && (
                <TouchableOpacity onPress={suggestVarieties} disabled={varietyLoading} style={styles.suggestCta}>
                  <Text style={styles.suggestCtaText}>{varietyLoading ? 'Loading…' : 'Suggest'}</Text>
                  {!varietyLoading && <Text style={shared.ctaArrow}>{'→'}</Text>}
                  {varietyLoading && <ActivityIndicator size="small" color={colors.brand.primary} style={{ marginLeft: 4 }} />}
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              value={variety}
              onChangeText={setVariety}
              placeholder="e.g. Genovese"
              placeholderTextColor={colors.text.placeholder}
            />
            {varietySuggestions.length > 0 && (
              <View style={styles.varietyChips}>
                {varietySuggestions.map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.varietyChip, variety === v && styles.varietyChipActive]}
                    onPress={() => setVariety(v)}
                  >
                    <Text style={[styles.varietyChipText, variety === v && styles.varietyChipTextActive]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {addMode === 'planting' && (
              <>
                <FieldLabel>Location</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={locationNote}
                  onChangeText={setLocationNote}
                  placeholder="e.g. north fence bed, pot on deck"
                  placeholderTextColor={colors.text.placeholder}
                />

                <FieldLabel>Planted Date (YYYY-MM-DD)</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={plantedDate}
                  onChangeText={setPlantedDate}
                  placeholder="e.g. 2026-04-02"
                  placeholderTextColor={colors.text.placeholder}
                  keyboardType="numbers-and-punctuation"
                />

                <FieldLabel>Expected Ready Date (YYYY-MM-DD, optional)</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={expectedReady}
                  onChangeText={setExpectedReady}
                  placeholder="e.g. 2026-06-01"
                  placeholderTextColor={colors.text.placeholder}
                  keyboardType="numbers-and-punctuation"
                />

                <FieldLabel>Quantity Planted</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={quantityPlanted}
                  onChangeText={setQuantityPlanted}
                  placeholder="e.g. 4 (optional)"
                  placeholderTextColor={colors.text.placeholder}
                  keyboardType="decimal-pad"
                />

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setIsCutAndComeAgain((v) => !v)}
                  activeOpacity={0.7}
                >
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>Cut-and-come-again</Text>
                    <Text style={styles.toggleHint}>Harvesting returns it to 'growing' (e.g. silverbeet, lettuce, herbs)</Text>
                  </View>
                  <View style={[styles.toggle, isCutAndComeAgain && styles.toggleOn]}>
                    <View style={[styles.toggleThumb, isCutAndComeAgain && styles.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>
              </>
            )}

            <FieldLabel>Notes</FieldLabel>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder={addMode === 'wishlist' ? 'e.g. want to try next spring' : 'Any notes…'}
              placeholderTextColor={colors.text.placeholder}
              multiline
              numberOfLines={3}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerClose: { fontSize: 28, color: colors.text.muted, fontWeight: '300', lineHeight: 28 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text.primary },
  headerSaveBtn: { fontSize: 15, color: colors.brand.primary, fontWeight: '700' },
  saveDim: { opacity: 0.4 },

  body: { flex: 1 },
  bodyContent: { padding: 20, gap: 4, paddingBottom: 40 },

  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  modePill: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.background.surface,
  },
  modePillActive: { backgroundColor: colors.brand.primary + '22', borderColor: colors.brand.primary },
  modePillText: { fontSize: 14, fontWeight: '600', color: colors.text.secondary },
  modePillTextActive: { color: colors.brand.primary },

  varietyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 4 },
  suggestCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  suggestCtaText: { fontSize: 13, fontWeight: '600', color: colors.brand.primary },
  varietyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  varietyChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.background.surface,
  },
  varietyChipActive: { backgroundColor: colors.brand.primary + '22', borderColor: colors.brand.primary },
  varietyChipText: { fontSize: 13, color: colors.text.secondary },
  varietyChipTextActive: { color: colors.brand.primary, fontWeight: '600' },

  fieldLabel: {
    ...shared.sectionLabel, marginTop: 14, marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text.primary,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 11 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background.elevated, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 10, padding: 14, marginTop: 14, gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  toggleHint: { fontSize: 12, color: colors.text.muted, marginTop: 2, lineHeight: 16 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: colors.border.default, justifyContent: 'center', padding: 2,
  },
  toggleOn: { backgroundColor: colors.brand.primary },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background.surface },
  toggleThumbOn: { alignSelf: 'flex-end' },
});
