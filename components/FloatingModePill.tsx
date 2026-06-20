import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/theme';

interface Props {
  label: string;
  activeLabel: string;
  active: boolean;
  onPress: () => void;
  bottom?: number;
}

export default function FloatingModePill({ label, activeLabel, active, onPress, bottom = 90 }: Props) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive, { bottom }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.pillText}>{active ? activeLabel : label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    right: 20,
    backgroundColor: colors.brand.ink,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  pillActive: {
    backgroundColor: colors.brand.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.inverse,
    letterSpacing: 0.3,
  },
});
