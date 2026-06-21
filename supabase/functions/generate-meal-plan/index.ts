import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ALLOWED_CATEGORIES = new Set([
  'meat_fish', 'dairy_eggs', 'produce', 'herbs_spices', 'pantry_dry_goods',
  'bread_bakery', 'cans_preserves', 'oils_vinegars', 'condiments_sauces',
  'beverages', 'alcohol', 'household',
]);

// ── Types ────────────────────────────────────────────────────────────────────

type PlanningDay = {
  day: number;
  name: string;
  guests: number;
  people: string[];
  dietary: string[];
  fish_ok: boolean;
  max_minutes: number | null;
  weekend: boolean;
};

// ── Pre-compute scheduling (deterministic — no LLM needed) ──────────────────

function buildPlanningDays(input: any): { available: PlanningDay[]; pinned: any[]; away: number[] } {
  const nightsAway: number[] = input.nightsAway ?? [];
  const pinnedMeals: any[] = input.pinnedMeals ?? [];
  const members: any[] = input.householdMembers ?? [];
  const prefs = input.preferences ?? null;
  const weeknightMax = prefs?.weeknight_max_minutes ?? null;
  const pinnedDays = new Set(pinnedMeals.map((m: any) => m.day_of_week));

  const available: PlanningDay[] = [];

  for (let d = 0; d < 7; d++) {
    if (nightsAway.includes(d) || pinnedDays.has(d)) continue;

    const peopleHome = members.filter((m: any) => (m.nights_home ?? []).includes(d));
    const dietary = peopleHome
      .map((m: any) => m.dietary_notes?.trim())
      .filter(Boolean) as string[];
    const fishOk = !dietary.some((n) =>
      /no fish|fish allergy|no seafood|seafood allergy|doesn't eat fish|does not eat fish|avoid fish|avoid seafood/i.test(n)
    );
    const isWeekend = d >= 5;

    available.push({
      day: d,
      name: DAY_NAMES[d],
      guests: peopleHome.length,
      people: peopleHome.map((m: any) => m.name).filter(Boolean),
      dietary,
      fish_ok: fishOk,
      max_minutes: isWeekend ? null : weeknightMax,
      weekend: isWeekend,
    });
  }

  const pinned = pinnedMeals.map((m: any) => ({
    day: m.day_of_week,
    name: DAY_NAMES[m.day_of_week],
    meal: m.name,
  }));

  return { available, pinned, away: nightsAway };
}

// ── Build context blocks ────────────────────────────────────────────────────

function itemList(items: any[] = []): string {
  if (!items.length) return 'None';
  return items.map((i: any) => `${i.quantity ?? ''} ${i.unit ?? ''} ${i.name ?? ''}`.trim()).filter(Boolean).join(', ');
}

function buildUserPrompt(input: any, days: { available: PlanningDay[]; pinned: any[]; away: number[] }): string {
  const prefs = input.preferences ?? null;
  const carryForward: any[] = input.carryForwardMeals ?? [];
  const repeatMeals: any[] = input.repeatMeals ?? [];
  const previousMeals: string[] = input.previousMeals ?? [];

  const sections: string[] = [];

  sections.push(`Plan dinners for this week.

TODAY: ${new Date().toLocaleDateString('en-NZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

DAYS THAT NEED MEALS:
${JSON.stringify(days.available)}`);

  if (days.pinned.length) {
    sections.push(`PINNED MEALS (locked — factor into variety/rotation but do not replace):
${JSON.stringify(days.pinned)}`);
  }

  if (days.away.length) {
    sections.push(`NIGHTS AWAY: ${days.away.map((d) => DAY_NAMES[d]).join(', ')}`);
  }

  sections.push(`FRIDGE (use before they spoil): ${itemList(input.fridgeItems)}`);
  sections.push(`FREEZER (use where it fits, not urgent): ${itemList(input.freezerItems)}`);
  sections.push(`GARDEN: ${(input.gardenAvailable ?? []).join(', ') || 'None'}`);

  const spontaneous = input.spontaneousAdditions ?? [];
  if (spontaneous.length) sections.push(`SPONTANEOUS ADDITIONS: ${spontaneous.join(', ')}`);

  if (previousMeals.length) {
    sections.push(`LAST WEEK (avoid repeats/close variants): ${previousMeals.join(', ')}`);
  }

  if (carryForward.length) {
    const lines = carryForward.map((m: any) => m.name + (m.description ? `: ${m.description}` : ''));
    sections.push(`CARRY FORWARD (must include, exact names): ${lines.join('; ')}`);
  }

  if (repeatMeals.length) {
    const lines = repeatMeals.map((m: any) => m.name + (m.description ? `: ${m.description}` : ''));
    sections.push(`REPEAT MEALS (include these): ${lines.join('; ')}`);
  }

  if (prefs) {
    const pLines: string[] = [];
    if (prefs.cuisine_likes?.length) pLines.push(`Love: ${prefs.cuisine_likes.join(', ')}`);
    if (prefs.cuisine_dislikes?.length) pLines.push(`Avoid: ${prefs.cuisine_dislikes.join(', ')}`);
    if (prefs.proteins_excluded?.length) pLines.push(`Excluded proteins: ${prefs.proteins_excluded.join(', ')}`);
    if (prefs.spice_level) pLines.push(`Spice: ${prefs.spice_level}`);
    if (prefs.weeknight_max_minutes) pLines.push(`Weeknight max: ${prefs.weeknight_max_minutes}min`);
    if (prefs.weekend_cooking) pLines.push(`Weekend: ${prefs.weekend_cooking === 'project' ? 'love a project' : 'keep it simple'}`);
    if (prefs.cooking_notes) pLines.push(`Notes: ${prefs.cooking_notes}`);
    if (pLines.length) sections.push(`PREFERENCES: ${pLines.join('. ')}`);
    if (prefs.standing_orders) sections.push(`STANDING ORDERS (always apply): ${prefs.standing_orders}`);
  }

  sections.push(`Return ONLY this JSON:
{"meals":[{"day_of_week":0,"meal_name":"string","description":"2-3 sentence cooking description","is_fish":false,"needs_recipe":false,"estimated_prep_minutes":25,"guests_count":0,"ingredients":[{"name":"string","quantity":1,"unit":"string","source":"buy|fridge|freezer|garden|pantry","store":"grocer|butcher|supermarket|liquor_store","buy_timing":"weekend|day_of|sunday_default","ingredient_category":"meat_fish|dairy_eggs|produce|herbs_spices|pantry_dry_goods|bread_bakery|cans_preserves|oils_vinegars|condiments_sauces|beverages|alcohol|household","herb_backup":null}]}],"planning_notes":"string"}`);

  return sections.join('\n\n');
}

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are EatWell's meal planning engine for Christchurch, New Zealand.

The app pre-computes which days need meals, who is home, guest counts, dietary constraints, and fish eligibility. The planning_days array in the user prompt is the source of truth for scheduling — do not second-guess it.

Return only valid JSON. No prose, markdown, or extra keys.

PRIORITY ORDER:
1. Dietary exclusions are absolute.
2. Carry-forward and repeat meals must be included.
3. Fridge items should be used before they spoil.
4. Freezer items may be used where they fit naturally.
5. Preferences personalise the plan.
6. Variety, seasonality, and waste reduction guide remaining choices.

HARD RULES

Generate exactly one meal per planning day. No more, no fewer.

Exactly 1 fish/seafood meal per week. Only on a day where fish_ok is true. Prefer Sunday. Set buy_timing to sunday_default for fish.

At least 1 fully vegetarian dinner (no meat, no fish — eggs/dairy fine). Must be substantial.

Every meal must be a complete dinner — never a dip, spread, condiment, or side dish alone.

Max 1 pasta dish per week unless 2+ carry-forward meals are pasta. Never repeat a pasta shape (including pinned meals). Always name the exact shape — never generic "Pasta". Fresh pasta: set source to pantry (user makes their own).

Fridge items: set source to fridge. Freezer items: set source to freezer. Do not cluster similar freezer proteins on consecutive nights. Garden items: set source to garden, only when listed as available and genuinely used.

Do not repeat last week's meals or close variants unless fridge/carry-forward/repeat requires it.

Respect max_minutes per day when provided.

Portions: cook for 1 small appetite by default (fish 150-180g, chicken 2 thighs, red meat 150g, pasta/rice 70-80g). Scale up for guests.

Long-life fridge staples (eggs, milk, cream, crème fraîche, parmesan, yoghurt, butter, cheese): omit for small amounts. Only list for large amounts (300ml+ cream, 4+ eggs, 200g+ cheese). If listed, name as "Eggs".

Pantry staples (oils, salt, spices, flour, soy sauce, vinegars, canned tomatoes, rice, pulses, onions, garlic, stock): set source to pantry.

Fresh herbs: always set herb_backup. Note if hard to find in Christchurch.

Every ingredient must be a single item in Title Case. Never combine (e.g. separate Salt and Black Pepper).

Metric only. UK/NZ English. Meal names: max 7 words, Title Case, use "with" and "and" not commas.

ingredient_category: meat_fish, dairy_eggs, produce, herbs_spices, pantry_dry_goods, bread_bakery, cans_preserves, oils_vinegars, condiments_sauces, beverages, alcohol, household. Use dairy_eggs for all dairy/eggs. herbs_spices for all herbs and spices. alcohol: set store to liquor_store.

Set needs_recipe: true for non-obvious technique or 6+ fresh components.

GUIDELINES

Make the week feel like a thoughtful home menu. Prefer meals with clear technique, sauce, or seasoning.

Avoid boring defaults. Simple is fine if deliberate.

At least 3 culinary traditions across the week, max 2 from the same tradition.

At least 3 cooking approaches (braise, roast, sauté, grill, poach, steam, raw).

Avoid same protein on consecutive nights.

Cluster fresh ingredients to reduce waste. Max 2 meals per garden herb.

Use seasonal NZ produce for the date.

If yeast is needed, use active dried yeast with a blooming step.`;

// ── Post-generation normalisation (fix what the model gets wrong) ────────────

function normaliseCategory(raw: string, name: string): string {
  const cat = (raw ?? '').toLowerCase();
  if (ALLOWED_CATEGORIES.has(cat)) return cat;

  const n = name.toLowerCase();
  if (/egg|milk|cream|butter|cheese|yoghurt|yogurt|parmesan|feta|mozzarella|ricotta|crème fraîche/.test(n)) return 'dairy_eggs';
  if (/chicken|beef|pork|lamb|fish|salmon|cod|tarakihi|snapper|prawn|seafood|bacon|sausage|mince|steak/.test(n)) return 'meat_fish';
  if (/parsley|coriander|basil|thyme|rosemary|sage|oregano|mint|dill|chilli|paprika|cumin|turmeric|pepper|salt/.test(n)) return 'herbs_spices';
  if (/bread|sourdough|baguette|pita|tortilla/.test(n)) return 'bread_bakery';
  if (/oil|vinegar/.test(n)) return 'oils_vinegars';
  if (/sauce|mustard|paste|harissa|gochujang|miso/.test(n)) return 'condiments_sauces';
  if (/rice|pasta|spaghetti|linguine|rigatoni|penne|flour|sugar|lentil|bean|chickpea|noodle/.test(n)) return 'pantry_dry_goods';
  return 'produce';
}

function normaliseStore(store: string, category: string): string {
  if (category === 'alcohol') return 'liquor_store';
  const s = (store ?? '').toLowerCase();
  if (['grocer', 'butcher', 'supermarket', 'liquor_store'].includes(s)) return s;
  if (category === 'meat_fish') return 'butcher';
  return 'supermarket';
}

function normaliseBuyTiming(timing: string, source: string, name: string): string {
  const t = (timing ?? '').toLowerCase();
  if (['weekend', 'day_of', 'sunday_default'].includes(t)) return t;
  if (source === 'buy' && /fish|salmon|cod|snapper|tarakihi|prawn|seafood/i.test(name)) return 'sunday_default';
  return 'weekend';
}

function toTitleCase(s: string): string {
  const lower = new Set(['and', 'or', 'with', 'in', 'on', 'the', 'a', 'of', 'by']);
  return s.split(/\s+/).map((w, i) => {
    const l = w.toLowerCase();
    if (i > 0 && lower.has(l)) return l;
    return l.charAt(0).toUpperCase() + l.slice(1);
  }).join(' ');
}

function normaliseIngredient(ing: any): any {
  const source = ['buy', 'fridge', 'freezer', 'garden', 'pantry'].includes(ing.source)
    ? ing.source
    : (ing.from_freezer ? 'freezer' : ing.from_fridge ? 'fridge' : ing.from_garden ? 'garden' : ing.is_pantry_staple ? 'pantry' : 'buy');

  const category = normaliseCategory(ing.ingredient_category, ing.name ?? '');

  return {
    name: toTitleCase(String(ing.name ?? '').trim()),
    quantity: ing.quantity ?? 1,
    unit: ing.unit ?? '',
    store: normaliseStore(ing.store, category),
    buy_timing: normaliseBuyTiming(ing.buy_timing, source, ing.name ?? ''),
    from_fridge: source === 'fridge' || source === 'freezer',
    from_freezer: source === 'freezer',
    from_garden: source === 'garden',
    is_pantry_staple: source === 'pantry',
    ingredient_category: category,
    herb_backup: category === 'herbs_spices' ? (ing.herb_backup ?? null) : null,
  };
}

function normalisePlan(plan: any, availableDays: PlanningDay[]): any {
  const meals = Array.isArray(plan.meals) ? plan.meals : [];
  return {
    meals: meals.map((m: any) => {
      const day = availableDays.find((d) => d.day === m.day_of_week);
      return {
        day_of_week: m.day_of_week,
        meal_name: String(m.meal_name ?? '').trim(),
        description: String(m.description ?? '').trim(),
        is_fish: Boolean(m.is_fish),
        needs_recipe: Boolean(m.needs_recipe),
        estimated_prep_minutes: Number(m.estimated_prep_minutes ?? 30),
        guests_count: Number(m.guests_count ?? day?.guests ?? 0),
        ingredients: Array.isArray(m.ingredients) ? m.ingredients.map(normaliseIngredient) : [],
      };
    }),
    planning_notes: String(plan.planning_notes ?? ''),
  };
}

// ── JSON parsing ────────────────────────────────────────────────────────────

function jsonOrError(raw: string): { parsed: any; error: string | null } {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return { parsed: JSON.parse(cleaned), error: null };
  } catch {
    return { parsed: null, error: `Invalid JSON. Start: ${cleaned.slice(0, 200)}` };
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const t0 = Date.now();
    const log = (label: string) => console.log(`[meal-plan] ${label} — ${Date.now() - t0}ms`);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const rawBody = await req.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Request body is empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const input = JSON.parse(rawBody);
    const { available, pinned, away } = buildPlanningDays(input);
    log(`scheduling done — ${available.length} days to fill, ${pinned.length} pinned, ${away.length} away`);

    if (available.length === 0) {
      return new Response(
        JSON.stringify({ meals: [], planning_notes: 'No available planning days.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userPrompt = buildUserPrompt(input, { available, pinned, away });
    const systemLen = SYSTEM_PROMPT.length;
    const userLen = userPrompt.length;
    log(`prompts built — system: ${systemLen} chars, user: ${userLen} chars, total: ${systemLen + userLen} chars (~${Math.round((systemLen + userLen) / 4)} tokens est.)`);

    const client = new Anthropic({ apiKey });

    // ── Pass 1: Sonnet picks the meals (creative, tiny output) ──────────────
    log('pass 1 — Sonnet choosing meals...');

    const creativityPrompt = buildUserPrompt(input, { available, pinned, away });

    const sonnetResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: `You are EatWell's creative meal selector for Christchurch, New Zealand.

Choose dinners for the available planning days. Your job is ONLY to pick interesting, varied meals — another model will handle ingredients.

RULES:
- Exactly 1 fish/seafood meal (on a day where fish_ok is true, prefer Sunday)
- At least 1 fully vegetarian dinner (no meat, no fish)
- Max 1 pasta dish. Name the exact shape. Never generic "Pasta"
- Every meal must be a complete dinner, not a dip/spread/side
- Max 7 words per meal name. Title Case. Use "with" and "and" not commas
- Avoid repeating last week's meals or close variants
- At least 3 culinary traditions, max 2 from the same
- At least 3 cooking techniques across the week
- Avoid same protein on consecutive nights
- Respect dietary constraints and excluded proteins per day
- Respect max_minutes per day when provided
- Use seasonal NZ produce for the date

Make the week feel like a thoughtful home menu. Prefer meals with clear technique, sauce, or seasoning. Aim for one dish the user might not have thought of.

CRITICAL: Output ONLY compact JSON, no markdown fences, no explanation. Keep descriptions under 20 words each.
{"meals":[{"day_of_week":0,"meal_name":"string","description":"One short sentence about the dish","is_fish":false,"needs_recipe":false,"estimated_prep_minutes":25}],"planning_notes":"Brief 1-sentence note"}`,
      messages: [{ role: 'user', content: creativityPrompt }],
    });

    const sonnetUsage = sonnetResponse.usage;
    log(`pass 1 done — input: ${sonnetUsage.input_tokens}, output: ${sonnetUsage.output_tokens} tokens, stop: ${sonnetResponse.stop_reason}`);

    if (sonnetResponse.stop_reason === 'max_tokens') {
      log('pass 1 TRUNCATED — output hit max_tokens limit');
    }

    const sonnetText = (sonnetResponse.content[0] as { type: string; text: string }).text;
    const { parsed: mealChoices, error: sonnetError } = jsonOrError(sonnetText);
    if (sonnetError) {
      log(`pass 1 JSON parse failed: ${sonnetError}`);
      return new Response(JSON.stringify({ error: sonnetError }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log(`pass 1 — ${mealChoices.meals?.length ?? 0} meals chosen`);

    // ── Pass 2: Haiku generates ingredients for each meal (fast, structured) ─
    log('pass 2 — Haiku generating ingredients...');

    const mealList = (mealChoices.meals ?? []).map((m: any) => ({
      day_of_week: m.day_of_week,
      meal_name: m.meal_name,
      description: m.description,
      is_fish: m.is_fish ?? false,
      needs_recipe: m.needs_recipe ?? false,
      estimated_prep_minutes: m.estimated_prep_minutes ?? 30,
    }));

    const ingredientPrompt = `Generate ingredient lists for these meals. Each meal is already decided — do not change meal names or descriptions.

MEALS TO FILL:
${JSON.stringify(mealList)}

FRIDGE (source: fridge): ${itemList(input.fridgeItems)}
FREEZER (source: freezer): ${itemList(input.freezerItems)}
GARDEN (source: garden): ${(input.gardenAvailable ?? []).join(', ') || 'None'}
PLANNING DAYS: ${JSON.stringify(available)}

Return the complete plan as JSON with ingredients added:
{"meals":[{"day_of_week":0,"meal_name":"kept as-is","description":"kept as-is","is_fish":false,"needs_recipe":false,"estimated_prep_minutes":25,"guests_count":0,"ingredients":[{"name":"string","quantity":1,"unit":"string","source":"buy|fridge|freezer|garden|pantry","store":"grocer|butcher|supermarket|liquor_store","buy_timing":"weekend|day_of|sunday_default","ingredient_category":"meat_fish|dairy_eggs|produce|herbs_spices|pantry_dry_goods|bread_bakery|cans_preserves|oils_vinegars|condiments_sauces|beverages|alcohol|household","herb_backup":null}]}],"planning_notes":"string"}`;

    const haikuResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      system: `You are EatWell's ingredient engine for Christchurch, New Zealand. Given a set of decided meals, generate complete ingredient lists.

RULES:
- Use fridge items where they fit the meal. Set source to fridge.
- Use freezer items where they fit naturally. Set source to freezer. Do not cluster similar freezer proteins.
- Use garden items only when listed as available and genuinely used. Set source to garden.
- Pantry staples (oils, salt, spices, flour, soy sauce, vinegars, canned tomatoes, rice, pulses, onions, garlic, stock): set source to pantry.
- Long-life fridge staples (eggs, milk, cream, crème fraîche, parmesan, yoghurt, butter, cheese): omit for small amounts. Only list for large amounts (300ml+ cream, 4+ eggs, 200g+ cheese). Name eggs as "Eggs".
- Fresh pasta: set source to pantry (user makes their own).
- Fresh herbs: set herb_backup to a short fallback.
- Every ingredient must be a single item in Title Case. Never combine.
- Metric only. UK/NZ English.
- ingredient_category: meat_fish, dairy_eggs, produce, herbs_spices, pantry_dry_goods, bread_bakery, cans_preserves, oils_vinegars, condiments_sauces, beverages, alcohol, household.
- dairy_eggs for all dairy/eggs. herbs_spices for all herbs and spices. alcohol: set store to liquor_store.
- Fish: set buy_timing to sunday_default.
- Portions: cook for 1 small appetite (fish 150-180g, chicken 2 thighs, red meat 150g, pasta/rice 70-80g). Scale for guests_count.
- Set guests_count from the planning day's guest count.
- Do NOT change meal_name or description — keep them exactly as given.

Return only valid JSON.`,
      messages: [{ role: 'user', content: ingredientPrompt }],
    });

    const haikuUsage = haikuResponse.usage;
    log(`pass 2 done — input: ${haikuUsage.input_tokens}, output: ${haikuUsage.output_tokens} tokens`);

    const haikuText = (haikuResponse.content[0] as { type: string; text: string }).text;
    const { parsed: fullPlan, error: haikuError } = jsonOrError(haikuText);
    if (haikuError) {
      log(`pass 2 JSON parse failed: ${haikuError}`);
      return new Response(JSON.stringify({ error: haikuError }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const plan = normalisePlan(fullPlan, available);

    // Ensure Sonnet's meal names/descriptions survived Haiku's pass
    for (const original of mealList) {
      const meal = plan.meals.find((m: any) => m.day_of_week === original.day_of_week);
      if (meal) {
        meal.meal_name = String(original.meal_name).trim();
        meal.description = String(original.description).trim();
        meal.is_fish = original.is_fish;
        meal.needs_recipe = original.needs_recipe;
        meal.estimated_prep_minutes = original.estimated_prep_minutes;
      }
    }

    log(`done — ${plan.meals.length} meals, ${plan.meals.reduce((n: number, m: any) => n + m.ingredients.length, 0)} ingredients total`);

    return new Response(JSON.stringify({ ...plan, planning_notes: mealChoices.planning_notes ?? plan.planning_notes ?? '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error(`[meal-plan] FAILED: ${err.message ?? 'Unknown error'}`);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
