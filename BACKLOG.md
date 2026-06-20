# EatWell Backlog

## UI Polish
- [x] Create centralised theme/colours file (`constants/theme.ts`) with semantic colour tokens. Replaced 50+ hardcoded hex values across 24 files. Fixed cocktails category colour inconsistency.
- [x] Unify "Shop Mode" / keep-screen-on toggle styling — all three instances now use consistent small header pill style.

## Bugs to Investigate
- [ ] Cooking guide shows duplicate glossary terms — "Braise" appears twice: once from Recipe Stash (saved glossary entry) and once from Claude-generated guide glossary. Need to deduplicate: either filter guide glossary terms that already exist in stash, or merge them into a single display.
- [ ] Carry-forward showing cooked meal (Orecchiette, June 17) — Spiced Lamb correctly filtered. Retest next week with closer attention to logging flow.

- [ ] "Add to next week" duplicates meals — if a meal already exists in next week's plan (e.g. from a previous push), tapping "Add to next week" adds it again instead of checking for duplicates. Should either skip with a message or replace the existing entry.

## Pending Deploys
- [ ] Run Supabase migrations: 019 (preference site settings), 020 (conditional shopping items)
