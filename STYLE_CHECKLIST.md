# EatWell Style & Formatting Checklist

Use this when building or reviewing any screen, modal, or component.

---

## 1. Backgrounds

- [ ] Screen/modal root uses `colors.background.app` (cream `#EBDFD1`), not white or elevated
- [ ] Cards and content areas use `colors.background.surface` (white)
- [ ] Input fields use `colors.background.elevated` (light cream `#F7F0E8`)
- [ ] No hardcoded hex values — use `colors.*` tokens from `constants/theme.ts`

## 2. Safe Area & Status Bar

- [ ] Screen applies `useSafeAreaInsets()` — content starts below status bar
- [ ] Tab screens: `paddingTop: insets.top + 20` on scroll content
- [ ] Modals: header gets `paddingTop: (insets.top || 16) + 8`
- [ ] Scroll content: `paddingBottom: insets.bottom + 40` (or `+ 20` minimum)
- [ ] Test on device — × close / Save must not sit behind status bar or notch

## 3. Modal Headers (Option 3 Pattern)

- [ ] `×` close button top-left: `fontSize: 28, fontWeight: '300', color: colors.text.muted`
- [ ] Action button top-right (Save, Done, etc.): `fontSize: 15–16, fontWeight: '700', color: colors.text.link`
- [ ] Full-width title below: `fontSize: 22, fontWeight: '700', color: colors.text.primary`
- [ ] Header padding: `paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14`
- [ ] Top row: `flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8`

## 4. Tab Screen Headers

- [ ] Use `shared.headerBar` for the header container
- [ ] Title uses `shared.headerTitle` (28px, 700 weight)
- [ ] Buttons use `shared.headerButtons` container (row, 8px gap)
- [ ] Secondary action left: `shared.btnOutline` + `shared.btnOutlineText`
- [ ] Primary action right: `shared.btnFilled` + `shared.btnFilledText`
- [ ] Button order: secondary (outline) left, primary (filled) right

## 5. Section Labels

- [ ] Use `shared.sectionLabel` (or spread it with overrides)
- [ ] Style: `fontSize: 13, fontWeight: '600', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5`
- [ ] Consistent across: day labels, section headers, modal sub-sections, field group labels
- [ ] Settings-style sections add bottom border: `borderBottomWidth: 1, borderBottomColor: colors.border.hairline`

## 6. Pills & Filters

- [ ] `borderRadius: 20` (always — this is the pill shape)
- [ ] `borderWidth: 1, borderColor: colors.border.default`
- [ ] Unselected: `backgroundColor: colors.background.surface` (or `elevated`)
- [ ] Selected (brand): `backgroundColor: colors.brand.primary + '22', borderColor: colors.brand.primary`
- [ ] Selected text: `color: colors.brand.primary` (tinted, not white)
- [ ] Never solid-fill selected pills (old pattern was `backgroundColor: colors.brand.primary` with white text — replaced everywhere)
- [ ] Padding: `paddingHorizontal: 14, paddingVertical: 7–8`
- [ ] Text: `fontSize: 13–14, fontWeight: '500', color: colors.text.secondary`

## 7. CTAs (Call-to-Action Links)

- [ ] Use `shared.ctaRow` container (right-aligned, 4px vertical padding)
- [ ] Text: `fontSize: 13, fontWeight: '600', color: colors.brand.primary`
- [ ] Arrow: `shared.ctaArrow` — `→` character, primary colour, 6px left margin
- [ ] Used for: secondary inline actions, expand/collapse triggers, navigation nudges
- [ ] Tap behaviour: toggles content inline (like drink/bite pairings, plant again)
- [ ] Collapsed: CTA text + arrow. Expanded: tappable section label to collapse.

## 8. Buttons (Full)

- [ ] Primary: `shared.btnFilled` — olive background, white text, 10px radius
- [ ] Secondary: `shared.btnOutline` — transparent, 1px border, muted text, 10px radius
- [ ] Destructive text links: `color: colors.state.dangerBright, fontSize: 13`
- [ ] In-card actions: use full buttons (e.g. "+ Add to Garden", "Harvest")
- [ ] Footer actions: inline text links (e.g. "Edit plant · Delete plant")

## 9. Cards

- [ ] `backgroundColor: colors.background.surface` (white)
- [ ] `borderRadius: 12–16` (12 for list items, 16 for content cards)
- [ ] `padding: 14–20` (14 for compact rows, 20 for detail cards)
- [ ] On cream background — no border needed (white on cream provides contrast)
- [ ] Muted/past items: `opacity: 0.6`

## 10. Input Fields

- [ ] `backgroundColor: colors.background.elevated`
- [ ] `borderWidth: 1, borderColor: colors.border.default`
- [ ] `borderRadius: 10`
- [ ] `paddingHorizontal: 14, paddingVertical: 11`
- [ ] `fontSize: 15, color: colors.text.primary`
- [ ] Placeholder: `placeholderTextColor={colors.text.placeholder}`
- [ ] Multiline: add `minHeight: 80, textAlignVertical: 'top'`

## 11. Status Badges

- [ ] `borderRadius: 8`
- [ ] `paddingHorizontal: 10–12, paddingVertical: 4–5`
- [ ] Background: status colour + `'20'` (20% opacity)
- [ ] Text: status colour at full opacity, `fontSize: 12–13, fontWeight: '600'`
- [ ] Category badges: colour + `'22'` background, colour + `'44'` border

## 12. Typography Quick Reference

| Use | Size | Weight | Colour |
|-----|------|--------|--------|
| Screen title | 28 | 700 | `text.primary` |
| Modal title | 22 | 700 | `text.primary` |
| Card heading | 16 | 600–700 | `text.primary` |
| Body text | 14–15 | 400 | `text.secondary` |
| Section label | 13 | 600 | `text.muted` + uppercase |
| Field label | 13 | 600 | `text.secondary` |
| Hint / caption | 12 | 400 | `text.placeholder` |
| CTA text | 13 | 600 | `brand.primary` |
| Badge text | 11–13 | 600 | contextual |

## 13. Dismiss / Regenerate Actions

- [ ] AI-generated content (pairings, suggestions, replant advice) has `×` dismiss + "Regenerate"
- [ ] Action row: `flexDirection: 'row', gap: 12, alignItems: 'center'`
- [ ] Text: `fontSize: 12, color: colors.text.placeholder`
- [ ] `×` clears result and collapses; "Regenerate" re-fetches

## 14. Toggle Switches

- [ ] Track: `width: 44, height: 26, borderRadius: 13`
- [ ] Off: `backgroundColor: colors.border.default`
- [ ] On: `backgroundColor: colors.brand.primary`
- [ ] Thumb: `width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background.surface`

## 15. Keyboard & Scroll

- [ ] Modals with inputs: wrap in `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`
- [ ] Scroll content has enough bottom padding for keyboard clearance
- [ ] `showsVerticalScrollIndicator={false}` on main scroll views

## 16. Web Compatibility

- [ ] No bare `WebView` — use conditional import with web fallback (link + URL paste)
- [ ] No bare `Share.share` — use `shareOrCopy()` from `lib/shareOrCopy.ts`
- [ ] Test in browser if targeting web deployment

---

## Common Mistakes (Things We've Fixed)

- **Solid-fill pills**: Old pattern used `backgroundColor: brand.primary` + white text. Now use tinted background + coloured text.
- **White modal backgrounds**: Modals should use cream (`background.app`), not white (`background.surface`).
- **Missing safe area insets on modals**: Especially on Android — × and Save get hidden behind status bar.
- **Inconsistent section labels**: Each file had its own `sectionLabel` definition. Now centralised in `shared.sectionLabel`.
- **Button order**: Secondary (outline) goes left, primary (filled) goes right.
- **Hardcoded colours**: Every colour should come from `constants/theme.ts`.
- **Heavy borders on cards over cream**: White cards on cream don't need borders — the contrast is enough.
- **Inline delete as big red button**: Use small inline text link (`actionLinkDestructive`) instead.
