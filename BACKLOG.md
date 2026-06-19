# EatWell Backlog

## UI Polish
- [ ] Unify "Shop Mode" / keep-screen-on toggle styling — appears in three places with inconsistent look. Standardise button style, label, and placement across all instances.

## Bugs to Investigate
- [ ] Cooking guide shows duplicate glossary terms — "Braise" appears twice: once from Recipe Stash (saved glossary entry) and once from Claude-generated guide glossary. Need to deduplicate: either filter guide glossary terms that already exist in stash, or merge them into a single display.
- [ ] Carry-forward showing cooked meal (Orecchiette, June 17) — Spiced Lamb correctly filtered. Retest next week with closer attention to logging flow.

## Pending Deploys
- [ ] Run Supabase migrations: 019 (preference site settings), 020 (conditional shopping items)
