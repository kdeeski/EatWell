import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addGardenPlant, updateGardenPlant } from '../../lib/data';
import type { GardenPlant } from '../../types';
import { colors } from '../../constants/theme';

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

  const [plantName, setPlantName]         = useState('');
  const [variety, setVariety]             = useState('');
  const [locationNote, setLocationNote]   = useState('');
  const [plantedDate, setPlantedDate]     = useState(today);
  const [expectedReady, setExpectedReady] = useState('');
  const [isCutAndComeAgain, setIsCutAndComeAgain] = useState(false);
  const [quantityPlanted, setQuantityPlanted] = useState('');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);

  const isEditing = !!editPlant;

  const handleOpen = () => {
    if (editPlant) {
      setPlantName(editPlant.plant_name);
      setVariety(editPlant.variety ?? '');
      setLocationNote(editPlant.location_note ?? '');
      setPlantedDate(editPlant.planted_date);
      setExpectedReady(editPlant.expected_ready_date ?? '');
      setIsCutAndComeAgain(editPlant.is_cut_and_come_again);
      setQuantityPlanted(editPlant.quantity_planted != null ? String(editPlant.quantity_planted) : '');
      setNotes(editPlant.notes ?? '');
    } else {
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

  const handleSave = async () => {
    if (!plantName.trim()) {
      Alert.alert('Plant name required', 'Please enter a plant name.');
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        const updated = await updateGardenPlant(editPlant.id, {
          plant_name: plantName.trim(),
          variety: variety.trim() || null,
          location_note: locationNote.trim() || null,
          planted_date: plantedDate || today,
          expected_ready_date: expectedReady.trim() || null,
          quantity_planted: quantityPlanted ? parseFloat(quantityPlanted) || null : null,
          notes: notes.trim() || null,
          is_cut_and_come_again: isCutAndComeAgain,
        });
        onSave(updated);
      } else {
        const plant = await addGardenPlant({
          user_id: userId,
          plant_name: plantName.trim(),
          variety: variety.trim() || null,
          location_note: locationNote.trim() || null,
          planted_date: plantedDate || today,
          expected_ready_date: expectedReady.trim() || null,
          status: 'planted',
          quantity_planted: quantityPlanted ? parseFloat(quantityPlanted) || null : null,
          notes: notes.trim() || null,
          is_cut_and_come_again: isCutAndComeAgain,
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
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{isEditing ? 'Edit Plant' : 'Add Plant'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[styles.save, saving && styles.saveDim]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            <FieldLabel>Plant Name *</FieldLabel>
            <TextInput
              style={styles.input}
              value={plantName}
              onChangeText={setPlantName}
              placeholder="e.g. Basil"
              placeholderTextColor={colors.text.placeholder}
              autoFocus={!isEditing}
            />

            <FieldLabel>Variety</FieldLabel>
            <TextInput
              style={styles.input}
              value={variety}
              onChangeText={setVariety}
              placeholder="e.g. Genovese"
              placeholderTextColor={colors.text.placeholder}
            />

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

            <FieldLabel>Notes</FieldLabel>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any notes…"
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
  container: { flex: 1, backgroundColor: colors.background.elevated },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    backgroundColor: colors.background.surface, borderBottomWidth: 1, borderBottomColor: colors.border.hairline,
  },
  cancel: { fontSize: 16, color: colors.text.muted, width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text.primary },
  save: { fontSize: 16, color: colors.text.link, fontWeight: '600', width: 60, textAlign: 'right' },
  saveDim: { opacity: 0.4 },

  body: { flex: 1 },
  bodyContent: { padding: 20, gap: 4, paddingBottom: 40 },

  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: colors.text.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background.surface, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text.primary,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 11 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background.surface, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 10, padding: 14, marginTop: 14, gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  toggleHint: { fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 16 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: '#E5E7EB', justifyContent: 'center', padding: 2,
  },
  toggleOn: { backgroundColor: '#3B7A57' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleThumbOn: { alignSelf: 'flex-end' },
});
