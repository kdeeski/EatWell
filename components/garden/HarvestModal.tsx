import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GardenPlant, HarvestStorage } from '../../types';
import { colors } from '../../constants/theme';

interface Props {
  plant: GardenPlant;
  onConfirm: (quantity: number, unit: string, storage: HarvestStorage, notes: string | null) => void;
  onClose: () => void;
}

const STORAGE_OPTIONS: { value: HarvestStorage; label: string }[] = [
  { value: 'fresh',     label: 'Fresh' },
  { value: 'frozen',    label: 'Frozen' },
  { value: 'preserved', label: 'Preserved' },
];

export default function HarvestModal({ plant, onConfirm, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit]         = useState('bunch');
  const [storage, setStorage]   = useState<HarvestStorage>('fresh');
  const [notes, setNotes]       = useState('');

  const handleConfirm = () => {
    onConfirm(
      parseFloat(quantity) || 1,
      unit.trim() || 'bunch',
      storage,
      notes.trim() || null
    );
  };

  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Harvest {plant.plant_name}</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.body}>
            <Text style={styles.fieldLabel}>How much did you harvest?</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                autoFocus
              />
              <View style={{ width: 12 }} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={unit}
                onChangeText={setUnit}
                placeholder="bunch, piece, g…"
                placeholderTextColor={colors.text.placeholder}
                autoCapitalize="none"
              />
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Storage</Text>
            <View style={styles.storagePills}>
              {STORAGE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.pill, storage === opt.value && styles.pillSelected]}
                  onPress={() => setStorage(opt.value)}
                >
                  <Text style={[styles.pillText, storage === opt.value && styles.pillTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Notes</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any notes… (optional)"
              placeholderTextColor={colors.text.placeholder}
              multiline
              numberOfLines={2}
            />

            <Text style={styles.harvestNote}>
              This will add {plant.plant_name} to your Pantry under Garden so it shows on your inventory.
              {plant.is_cut_and_come_again && ' As a cut-and-come-again plant, it will return to Growing.'}
            </Text>

            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmButtonText}>Confirm Harvest</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.elevated },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: colors.background.surface, borderBottomWidth: 1, borderBottomColor: colors.border.hairline,
  },
  cancel: { fontSize: 16, color: colors.text.muted, width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text.primary },

  body: { padding: 20, gap: 8 },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: colors.text.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background.surface, borderWidth: 1, borderColor: colors.border.default,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: colors.text.primary,
  },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top', paddingTop: 11 },
  row: { flexDirection: 'row' },

  storagePills: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.background.elevated,
  },
  pillSelected: { backgroundColor: colors.brand.primary },
  pillText: { fontSize: 14, fontWeight: '600', color: colors.text.secondary },
  pillTextSelected: { color: colors.text.inverse },

  harvestNote: { fontSize: 13, color: colors.text.muted, lineHeight: 20, marginTop: 12, fontStyle: 'italic' },
  confirmButton: { backgroundColor: colors.brand.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  confirmButtonText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700' },
});
