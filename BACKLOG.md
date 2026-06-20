# EatWell Backlog

## UI Polish
- [x] Create centralised theme/colours file (`constants/theme.ts`) with semantic colour tokens. Replaced 50+ hardcoded hex values across 24 files. Fixed cocktails category colour inconsistency.
- [x] Unify "Shop Mode" / keep-screen-on toggle styling — all three instances now use consistent small header pill style.

## Bugs to Investigate
- [x] Cooking guide shows duplicate glossary terms — "Braise" appears twice: once from Recipe Stash (saved glossary entry) and once from Claude-generated guide glossary. Fixed: dedup check was using wrong `glossary::` prefix that never matched the actual recipe names in the Set.
- [ ] Carry-forward showing cooked meal (Orecchiette, June 17) — Spiced Lamb correctly filtered. Retest next week with closer attention to logging flow.

- [x] "Add to next week" duplicates meals — fixed: now deletes any existing entry with the same meal name in the target week before inserting, so repeated pushes replace instead of duplicate.

## Pending Deploys
- [x] Run Supabase migrations: 019 (preference site settings), 020 (conditional shopping items)
