import { PlantWindow } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Canterbury, New Zealand — Garden Calendar
// Southern Hemisphere. Christchurch latitude ~43.5°S.
// Frost risk: May–September. Last frost ~mid-September, first frost ~mid-May.
// Growing season: October–April.
//
// plantMonths: calendar months (1=Jan … 12=Dec) when seedlings go in.
// harvestWeeksAfterPlanting: [earliest, latest] weeks to first harvest.
// harvestType:
//   'daily'    — pick as needed (herbs, salad greens); flag when meal is chosen
//   'once'     — single bulk harvest; prompt to use or store
//   'windfall' — seasonal surplus from trees; flag when in season
// ─────────────────────────────────────────────────────────────────────────────

export const CANTERBURY_GARDEN_CALENDAR: PlantWindow[] = [
  // ── Herbs ──────────────────────────────────────────────────────────────────
  {
    plant: 'Mint',
    category: 'herb',
    plantMonths: [9, 10, 11, 12, 1, 2, 3],
    harvestWeeksAfterPlanting: [4, 6],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Parsley',
    category: 'herb',
    plantMonths: [9, 10, 11, 12, 1, 2],
    harvestWeeksAfterPlanting: [8, 12],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Tarragon',
    category: 'herb',
    plantMonths: [9, 10, 11],
    harvestWeeksAfterPlanting: [6, 8],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Sage',
    category: 'herb',
    plantMonths: [9, 10, 11],
    harvestWeeksAfterPlanting: [6, 10],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Chives',
    category: 'herb',
    plantMonths: [9, 10, 11, 12, 1, 2],
    harvestWeeksAfterPlanting: [6, 8],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Rosemary',
    category: 'herb',
    plantMonths: [9, 10, 11],
    harvestWeeksAfterPlanting: [8, 12],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Basil',
    category: 'herb',
    // Basil is frost-sensitive — Canterbury window is short, warm months only
    plantMonths: [11, 12, 1],
    harvestWeeksAfterPlanting: [4, 6],
    harvestType: 'daily',
    storagePrompt: null,
  },

  // ── Salad Greens ──────────────────────────────────────────────────────────
  {
    plant: 'Lettuce',
    category: 'salad',
    // Two main windows: spring and autumn (avoid frost and peak summer heat)
    plantMonths: [9, 10, 11, 2, 3, 4],
    harvestWeeksAfterPlanting: [6, 10],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Spinach',
    category: 'salad',
    plantMonths: [9, 10, 2, 3, 4],
    harvestWeeksAfterPlanting: [6, 8],
    harvestType: 'daily',
    storagePrompt: null,
  },

  // ── Vegetables ────────────────────────────────────────────────────────────
  {
    plant: 'Spring Onions',
    category: 'vegetable',
    plantMonths: [9, 10, 11, 12, 1, 2, 3],
    harvestWeeksAfterPlanting: [8, 12],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Heritage Carrots',
    category: 'vegetable',
    plantMonths: [9, 10, 11, 12, 1],
    harvestWeeksAfterPlanting: [12, 16],
    harvestType: 'once',
    storagePrompt: 'You have a carrot harvest ready — use them fresh this week or store in the fridge?',
  },
  {
    plant: 'New Potatoes',
    category: 'vegetable',
    plantMonths: [9, 10, 11],
    harvestWeeksAfterPlanting: [10, 14],
    harvestType: 'once',
    storagePrompt: 'New potatoes are ready — dig what you need this week or lift them all and store cool and dark?',
  },
  {
    plant: 'Cherry Tomatoes',
    category: 'vegetable',
    plantMonths: [11, 12],
    harvestWeeksAfterPlanting: [10, 14],
    harvestType: 'daily',
    storagePrompt: null,
  },
  {
    plant: 'Celery',
    category: 'vegetable',
    plantMonths: [10, 11],
    harvestWeeksAfterPlanting: [16, 20],
    harvestType: 'once',
    storagePrompt: 'Celery is ready — use it fresh this week, or freeze it for stock?',
  },
  {
    plant: 'Leeks',
    category: 'vegetable',
    plantMonths: [9, 10],
    harvestWeeksAfterPlanting: [16, 24],
    harvestType: 'once',
    storagePrompt: 'Leeks are ready — harvest what you need this week?',
  },
  {
    plant: 'Courgettes',
    category: 'vegetable',
    // Canterbury courgettes: plant after last frost, November onwards
    plantMonths: [11, 12],
    harvestWeeksAfterPlanting: [8, 10],
    harvestType: 'daily',
    storagePrompt: null,
  },

  // ── Fruit Trees (windfall) ────────────────────────────────────────────────
  {
    plant: 'Apricots',
    category: 'fruit',
    // Canterbury apricots ripen late December–January
    plantMonths: [],
    harvestWeeksAfterPlanting: [0, 0],
    harvestType: 'windfall',
    storagePrompt: 'Apricot season is here — got a glut? Want to factor them into this week\'s meals?',
  },
  {
    plant: 'Peaches',
    category: 'fruit',
    // Canterbury peaches: January–February
    plantMonths: [],
    harvestWeeksAfterPlanting: [0, 0],
    harvestType: 'windfall',
    storagePrompt: 'Peach season — any to use up this week?',
  },
  {
    plant: 'Pears',
    category: 'fruit',
    // Canterbury pears: February–April
    plantMonths: [],
    harvestWeeksAfterPlanting: [0, 0],
    harvestType: 'windfall',
    storagePrompt: 'Pear season — harvesting any this week?',
  },
];

// ─── Helper: plants in season to plant right now ──────────────────────────────

export function getPlantsInSeasonNow(): PlantWindow[] {
  const month = new Date().getMonth() + 1; // 1-indexed
  return CANTERBURY_GARDEN_CALENDAR.filter(
    (p) => p.plantMonths.includes(month) && p.category !== 'fruit'
  );
}

// ─── Helper: windfall fruits currently in season ──────────────────────────────

const WINDFALL_SEASONS: Record<string, number[]> = {
  Apricots: [12, 1],
  Peaches: [1, 2],
  Pears: [2, 3, 4],
};

export function getWindfallFruitsInSeason(): PlantWindow[] {
  const month = new Date().getMonth() + 1;
  return CANTERBURY_GARDEN_CALENDAR.filter(
    (p) =>
      p.harvestType === 'windfall' &&
      (WINDFALL_SEASONS[p.plant] ?? []).includes(month)
  );
}

// ─── Helper: which planted crops are due for harvest ─────────────────────────
// Pass in the user's active garden_plants list, get back those that are ready.

export function getPlantsDueForHarvest(
  plants: Array<{ plant_name: string; expected_ready_date: string | null; status: string }>
): typeof plants {
  const today = new Date();
  return plants.filter((p) => {
    if (p.status === 'harvested' || p.status === 'finished') return false;
    if (!p.expected_ready_date) return false;
    const ready = new Date(p.expected_ready_date);
    const daysUntilReady = (ready.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntilReady <= 7; // surfaced if within one week
  });
}
