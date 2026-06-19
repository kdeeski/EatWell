// constants/theme.ts
// Centralised colour palette — warm, natural, kitchen-garden inspired.
// Brand palette: Dusty Olive · Almond Cream · Deep Lilac · Palm Leaf · Onyx

export const colors = {
  // ── Brand ──────────────────────────────────────────────────────────────
  brand: {
    primary:        '#68704B',  // Dusty Olive — buttons, links, active states
    primaryDark:    '#525A3B',  // Darker olive — pressed states, emphasis text
    primaryLight:   '#D5DAC1',  // Olive tint — selected/confirmed backgrounds
    primaryLighter: '#ECEEE3',  // Very light olive — subtle highlights
    cream:          '#EBDFD1',  // Almond Cream — warm app background
    plum:           '#824E96',  // Deep Lilac — wine, cellar, cocktails, desserts
    plumDark:       '#6B3E7D',  // Darker plum — pressed plum states
    plumLight:      '#E8D5F0',  // Light plum tint — plum category backgrounds
    plumLighter:    '#F5EDF9',  // Very light plum — subtle plum surfaces
    olive:          '#97A46E',  // Palm Leaf — garden, seasonal, sides accent
    oliveLight:     '#DFE4D0',  // Light olive accent — garden backgrounds
    oliveLighter:   '#EFF1E6',  // Very light olive — subtle garden tints
    ink:            '#0D110D',  // Onyx — primary text, dark surfaces, cook mode
  },

  // ── Backgrounds ────────────────────────────────────────────────────────
  background: {
    app:            '#EBDFD1',  // Warm cream — main app background
    surface:        '#FFFFFF',  // White — cards, modals, inputs
    elevated:       '#F7F0E8',  // Light cream — pills, search rows, subtle raised
    sunken:         '#E3D5C5',  // Dark cream — pressed surfaces, inset areas
  },

  // ── Text ───────────────────────────────────────────────────────────────
  text: {
    primary:        '#0D110D',  // Ink — headings, body text, high contrast
    secondary:      '#3D3D35',  // Warm charcoal — descriptions, sub-labels
    muted:          '#6F6D5E',  // Warm grey — tertiary text, section headers
    placeholder:    '#9E978A',  // Warm light grey — placeholders, hints, icons
    inverse:        '#FFFFFF',  // White — text on dark/brand backgrounds
    link:           '#525A3B',  // Dark olive — tappable text on cream
  },

  // ── Borders ────────────────────────────────────────────────────────────
  border: {
    default:        '#C4BBA9',  // Warm grey — input borders, card borders
    subtle:         '#DED8CB',  // Light warm — row dividers on white
    hairline:       '#E8E2D6',  // Very subtle — section dividers, tab bar
  },

  // ── State / Status ─────────────────────────────────────────────────────
  state: {
    success:        '#68704B',  // Brand primary — success states
    successSoft:    '#ECEEE3',  // Light olive tint — success backgrounds
    successBorder:  '#D5DAC1',  // Olive tint — success borders
    warning:        '#D97706',  // Amber — growing, caution
    warningDark:    '#92400E',  // Dark amber — warning badge text
    warningSoft:    '#FEF3C7',  // Light amber — warning backgrounds
    warningBorder:  '#FDE68A',  // Amber border
    warningLighter: '#FFFBEB',  // Very light amber
    danger:         '#C53030',  // Warm red — errors, destructive
    dangerBright:   '#EF4444',  // Bright red — delete links, clear actions
    dangerSoft:     '#FEE2E2',  // Light red — error chip backgrounds
    dangerLighter:  '#FEF2F2',  // Very light red — error containers
    dangerBorder:   '#FCA5A5',  // Red border
    dangerText:     '#9B2C2C',  // Dark red — error detail text
    info:           '#2B6CB0',  // Warm blue — info nudges, recipe links
    infoBright:     '#3B82F6',  // Bright blue — swipe neutral action
    infoSoft:       '#EBF4FF',  // Light blue background
  },

  // ── Ratings ────────────────────────────────────────────────────────────
  rating: {
    star:           '#D69E2E',  // Gold — star ratings, meal ratings
    lowStock:       '#D97706',  // Amber — low stock indicator
  },

  // ── Recipe Categories ──────────────────────────────────────────────────
  category: {
    mains:            '#0D110D',
    sauces_dressings: '#B7791F',
    sides:            '#97A46E',
    desserts:         '#824E96',
    baking:           '#C05621',
    marinades_rubs:   '#2B6CB0',
    glossary:         '#3D3D35',
    cocktails:        '#824E96',
  },

  // ── Garden Status ──────────────────────────────────────────────────────
  garden: {
    planted:   '#97A46E',
    growing:   '#D97706',
    ready:     '#68704B',
    harvested: '#6F6D5E',
    finished:  '#C4BBA9',
  },

  // ── Shadow ─────────────────────────────────────────────────────────────
  shadow: '#0D110D',
} as const;
