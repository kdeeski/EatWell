import { StyleSheet } from 'react-native';
import { colors } from './theme';

export const shared = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.background.app,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },

  btnOutline: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  btnOutlineText: {
    color: colors.text.muted,
    fontWeight: '600',
    fontSize: 14,
  },

  btnFilled: {
    backgroundColor: colors.brand.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnFilledText: {
    color: colors.text.inverse,
    fontWeight: '700',
    fontSize: 14,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },

  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  ctaArrow: {
    fontSize: 13,
    color: colors.brand.primary,
    fontWeight: '600',
    marginLeft: 6,
  },
});
