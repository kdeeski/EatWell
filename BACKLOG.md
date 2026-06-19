# EatWell Backlog

## UI Polish
- [ ] Create centralised theme/colours file (e.g. `constants/theme.ts`) with named colour tokens (e.g. `colors.primary`, `colors.textPrimary`, `colors.border`). Replace all 50+ hardcoded hex values across 20+ files. Fix inconsistencies: two near-black text colours (#1C1C1E vs #111827), two off-white backgrounds (#FAFAF8 vs #F9FAFB), cocktails category colour mismatch (#0891B2 vs #DB2777).
- [ ] Unify "Shop Mode" / keep-screen-on toggle styling — appears in three places with inconsistent look. Standardise button style, label, and placement across all instances.

## Bugs to Investigate
- [ ] Cooking guide shows duplicate glossary terms — "Braise" appears twice: once from Recipe Stash (saved glossary entry) and once from Claude-generated guide glossary. Need to deduplicate: either filter guide glossary terms that already exist in stash, or merge them into a single display.
- [ ] Carry-forward showing cooked meal (Orecchiette, June 17) — Spiced Lamb correctly filtered. Retest next week with closer attention to logging flow.

## Pending Deploys
- [ ] Run Supabase migrations: 019 (preference site settings), 020 (conditional shopping items)
