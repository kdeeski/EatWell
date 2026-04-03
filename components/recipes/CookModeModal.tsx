import { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  recipeName: string;
  method: string;
  onClose: () => void;
}

export default function CookModeModal({ recipeName, method, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const steps = method.split('\n').map((s) => s.trim()).filter(Boolean);
  const [currentStep, setCurrentStep] = useState(0);

  const isFirst = currentStep === 0;
  const isLast  = currentStep === steps.length - 1;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || 20 }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.exitBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.exitBtnText}>✕ Exit</Text>
          </TouchableOpacity>
          <Text style={styles.recipeName} numberOfLines={1}>{recipeName}</Text>
          <View style={styles.exitBtn} />
        </View>

        {/* Step counter */}
        <Text style={styles.stepCounter}>
          Step {currentStep + 1} of {steps.length}
        </Text>

        {/* Step text */}
        <View style={styles.stepContainer}>
          <Text style={styles.stepText}>{steps[currentStep]}</Text>
        </View>

        {/* Navigation */}
        <View style={[styles.navRow, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
            onPress={() => setCurrentStep((s) => Math.max(0, s - 1))}
            disabled={isFirst}
          >
            <Text style={[styles.navBtnText, isFirst && styles.navBtnTextDisabled]}>← Prev</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, styles.navBtnPrimary]}
            onPress={() => {
              if (isLast) {
                onClose();
              } else {
                setCurrentStep((s) => s + 1);
              }
            }}
          >
            <Text style={styles.navBtnTextPrimary}>{isLast ? 'Done' : 'Next →'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 24,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  exitBtn: { minWidth: 72 },
  exitBtnText: { fontSize: 16, color: '#9CA3AF', fontWeight: '500' },
  recipeName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#FFFFFF', textAlign: 'center', marginHorizontal: 8 },

  stepCounter: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 32,
  },

  stepContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: {
    fontSize: 22,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 34,
  },

  navRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 20,
  },
  navBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#2C2C2E',
  },
  navBtnDisabled: {
    borderColor: '#2C2C2E',
    backgroundColor: '#1C1C1E',
  },
  navBtnPrimary: {
    backgroundColor: '#3B7A57',
    borderColor: '#3B7A57',
  },
  navBtnText: { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
  navBtnTextDisabled: { color: '#4B5563' },
  navBtnTextPrimary: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
