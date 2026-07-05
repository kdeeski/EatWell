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

  const queuedMeals: any[] = input.queuedMeals ?? [];
  if (queuedMeals.length) {
    const lines = queuedMeals.map((m: any) => m.name + (m.description ? `: ${m.description}` : ''));
    sections.push(`REQUESTED MEALS (must include, from recipe stash): ${lines.join('; ')}`);
  }

  if (repeatMeals.length) {
    const lines = repeatMeals.map((m: any) => m.name + (m.description ? `: ${m.description}` : ''));
    sections.push(`REPEAT MEALS (include these): ${lines.join('; ')}`);
  }

  if (prefs) {
    const pLines: string[] = [];
    if (prefs.dietary_style && prefs.dietary_style !== 'omnivore') {
      pLines.push(`Dietary style: ${prefs.dietary_style}`);
    }
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

  return sections.join('\n\n');
}

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are EatWell's meal planning engine for Christchurch, New Zealand.

The app pre-computes which days need meals, who is home, guest counts, dietary constraints, and fish eligibility. The planning_days array in the user prompt is the source of truth for scheduling — do not second-guess it.

Return only valid JSON. No prose, markdown, or extra keys.

PRIORITY ORDER:
1. Dietary exclusions are absolute.
2. Carry-forward, requested (stash), and repeat meals must be included.
3. Fridge items should be used before they spoil.
4. Freezer items may be used where they fit naturally.
5. Preferences personalise the plan.
6. Variety, seasonality, and waste reduction guide remaining choices.

HARD RULES

Generate exactly one meal per planning day. No more, no fewer.

Follow the user's dietary_style. For omnivore: exactly 1 fish/seafood meal (fish_ok day, prefer Sunday, buy_timing sunday_default) and at least 1 vegetarian dinner. For pescatarian: no meat, 1-2 fish meals. For vegetarian: all meals vegetarian. For vegan: all meals vegan.

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

function isUsefulHerbBackup(name: string, backup: string): boolean {
  const n = name.toLowerCase().replace(/^(fresh|dried|ground|smoked)\s+/, '').trim();
  const b = backup.toLowerCase().replace(/^(fresh|dried|ground|smoked)\s+/, '').trim();
  if (n === b) return false;
  // "Ground Coriander" → "Coriander Powder" is not useful
  if (n.replace(/\s*(powder|ground|seeds?|flakes?)\s*/g, '') === b.replace(/\s*(powder|ground|seeds?|flakes?)\s*/g, '')) return false;
  // Only fresh herbs should have backups (dried version as fallback)
  if (!/^fresh\s/i.test(name)) return false;
  return true;
}

function normaliseIngredient(ing: any): any {
  const category = normaliseCategory(ing.ingredient_category, ing.name ?? '');

  let source = ['buy', 'fridge', 'freezer', 'garden', 'pantry'].includes(ing.source)
    ? ing.source
    : (ing.from_freezer ? 'freezer' : ing.from_fridge ? 'fridge' : ing.from_garden ? 'garden' : ing.is_pantry_staple ? 'pantry' : 'buy');

  // Meat and fish are perishables — never pantry staples regardless of what the AI returns
  if (category === 'meat_fish' && source === 'pantry') source = 'buy';

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
    herb_backup: category === 'herbs_spices' && ing.herb_backup && isUsefulHerbBackup(ing.name ?? '', ing.herb_backup)
      ? String(ing.herb_backup).trim()
      : null,
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

function recoverTruncatedArray(raw: string): any[] {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  // Find each complete top-level object in the array by matching balanced braces
  const results: any[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          results.push(JSON.parse(cleaned.slice(objStart, i + 1)));
        } catch { /* skip malformed object */ }
        objStart = -1;
      }
    }
  }
  return results;
}

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

    const dietaryStyle = input.preferences?.dietary_style ?? 'omnivore';
    let dietaryRules: string;
    switch (dietaryStyle) {
      case 'vegan':
        dietaryRules = `- ALL meals must be vegan — no meat, fish, dairy, eggs, or honey
- Every meal must be protein-rich (legumes, tofu, tempeh, seitan, nuts)
- Ensure variety: not all legume-based, mix techniques and cuisines`;
        break;
      case 'vegetarian':
        dietaryRules = `- ALL meals must be vegetarian — no meat, no fish
- Eggs and dairy are fine
- Every meal must be substantial (not just a salad or side)
- Ensure variety: not all pasta/grain-based, mix techniques and cuisines`;
        break;
      case 'pescatarian':
        dietaryRules = `- No meat (no beef, pork, lamb, chicken, game) — fish and seafood are fine
- 1-2 fish/seafood meals per week (on days where fish_ok is true, prefer Sunday). Set is_fish: true for these
- Remaining meals should be vegetarian (eggs/dairy fine)
- Ensure variety across fish and vegetarian meals`;
        break;
      default:
        dietaryRules = `- Exactly 1 fish/seafood meal per week (on a day where fish_ok is true, prefer Sunday). Set is_fish: true for this meal
- At least 1 fully vegetarian dinner (no meat, no fish — eggs/dairy fine). Must be substantial`;
        break;
    }

    const sonnetResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `You are EatWell's creative meal selector for Christchurch, New Zealand.

Choose dinners for the available planning days. Your ONLY job is to pick meals — another model handles ingredients. Do NOT generate ingredients.

DIETARY STYLE: ${dietaryStyle}
${dietaryRules}

RULES:
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

Output a JSON array. One object per meal. No ingredients, no wrapping object, no markdown.
Each object: {"day_of_week":0,"meal_name":"string","description":"2-3 sentences about cooking technique and flavours","is_fish":false,"needs_recipe":false,"estimated_prep_minutes":25}`,
      messages: [{ role: 'user', content: creativityPrompt + '\n\nRespond with ONLY a JSON array starting with [ — no other text.' }],
    });

    const sonnetUsage = sonnetResponse.usage;
    log(`pass 1 done — input: ${sonnetUsage.input_tokens}, output: ${sonnetUsage.output_tokens} tokens, stop: ${sonnetResponse.stop_reason}`);

    if (sonnetResponse.stop_reason === 'max_tokens') {
      log('pass 1 TRUNCATED — output hit max_tokens limit');
    }

    const sonnetText = (sonnetResponse.content[0] as { type: string; text: string }).text;
    const { parsed: sonnetParsed, error: sonnetError } = jsonOrError(sonnetText);

    // Pass 1 returns a bare array — recover partial results on truncation
    let mealsArray: any[] = [];
    if (sonnetParsed) {
      mealsArray = Array.isArray(sonnetParsed) ? sonnetParsed : (sonnetParsed.meals ?? []);
    } else if (sonnetResponse.stop_reason === 'max_tokens') {
      // Truncated — try to recover complete meal objects
      const recovered = recoverTruncatedArray(sonnetText);
      if (recovered.length > 0) {
        log(`pass 1 truncated but recovered ${recovered.length} complete meals`);
        mealsArray = recovered;
      } else {
        log(`pass 1 JSON parse failed (unrecoverable): ${sonnetError}`);
        return new Response(JSON.stringify({ error: sonnetError }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      log(`pass 1 JSON parse failed: ${sonnetError}`);
      return new Response(JSON.stringify({ error: sonnetError }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log(`pass 1 — ${mealsArray.length} meals chosen`);

    // ── Pass 2: Haiku generates ingredients per meal IN PARALLEL ─────────────
    log(`pass 2 — Haiku generating ingredients for ${mealsArray.length} meals in parallel...`);

    const haikuSystem = `You are EatWell's ingredient engine for Christchurch, New Zealand. Given a single decided meal, generate its complete ingredient list.

RULES:
- Use fridge items where they fit the meal. Set source to fridge.
- Use freezer items where they fit naturally. Set source to freezer. Do not cluster similar freezer proteins.
- Use garden items only when listed as available and genuinely used. Set source to garden.
- Pantry staples (oils, salt, spices, flour, soy sauce, vinegars, canned tomatoes, rice, pulses, onions, garlic, stock): set source to pantry.
- Long-life fridge staples (eggs, milk, cream, crème fraîche, parmesan, yoghurt, butter, cheese): omit for small amounts. Only list for large amounts (300ml+ cream, 4+ eggs, 200g+ cheese). Name eggs as "Eggs".
- Fresh pasta: set source to pantry (user makes their own).
- Fresh herbs: set herb_backup to a short fallback.
- Every ingredient must be a single item in Title Case. Never combine.
- Never use bare "Chilli" or "Chili" — always specify the form: "Fresh Chilli", "Chilli Flakes", "Ground Chilli", etc.
- Metric only. UK/NZ English.
- ingredient_category: meat_fish, dairy_eggs, produce, herbs_spices, pantry_dry_goods, bread_bakery, cans_preserves, oils_vinegars, condiments_sauces, beverages, alcohol, household.
- dairy_eggs for all dairy/eggs. herbs_spices for all herbs and spices. alcohol: set store to liquor_store.
- Fish: set buy_timing to sunday_default.
- Portions: cook for 1 small appetite (fish 150-180g, chicken 2 thighs, red meat 150g, pasta/rice 70-80g). Scale for guests_count.
- Set guests_count from the planning day's guest count.
- Do NOT change meal_name or description — keep them exactly as given.

Return only valid JSON.`;

    const contextBlock = `FRIDGE (source: fridge): ${itemList(input.fridgeItems)}
FREEZER (source: freezer): ${itemList(input.freezerItems)}
GARDEN (source: garden): ${(input.gardenAvailable ?? []).join(', ') || 'None'}`;

    const haikuResults = await Promise.all(mealsArray.map(async (m: any) => {
      const mealInfo = {
        day_of_week: m.day_of_week,
        meal_name: m.meal_name,
        description: m.description,
        is_fish: m.is_fish ?? false,
        needs_recipe: m.needs_recipe ?? false,
        estimated_prep_minutes: m.estimated_prep_minutes ?? 30,
      };
      const day = available.find((d) => d.day === m.day_of_week);

      const prompt = `Generate the ingredient list for this meal:
${JSON.stringify(mealInfo)}

PLANNING DAY: ${JSON.stringify(day)}
${contextBlock}

Return JSON: {"day_of_week":${m.day_of_week},"meal_name":"kept as-is","description":"kept as-is","is_fish":${mealInfo.is_fish},"needs_recipe":${mealInfo.needs_recipe},"estimated_prep_minutes":${mealInfo.estimated_prep_minutes},"guests_count":${day?.guests ?? 0},"ingredients":[{"name":"string","quantity":1,"unit":"string","source":"buy|fridge|freezer|garden|pantry","store":"grocer|butcher|supermarket|liquor_store","buy_timing":"weekend|day_of|sunday_default","ingredient_category":"...","herb_backup":null}]}`;

      const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: haikuSystem,
        messages: [{ role: 'user', content: prompt }],
      });

      const usage = resp.usage;
      log(`  meal "${m.meal_name}" — ${usage.input_tokens}+${usage.output_tokens} tokens`);

      const text = (resp.content[0] as { type: string; text: string }).text;
      const { parsed, error } = jsonOrError(text);
      if (error) {
        log(`  meal "${m.meal_name}" JSON parse failed: ${error}`);
        return { ...mealInfo, guests_count: day?.guests ?? 0, ingredients: [] };
      }
      return parsed;
    }));

    const totalHaikuInput = haikuResults.length;
    log(`pass 2 done — ${totalHaikuInput} meals processed in parallel`);

    const plan = normalisePlan({ meals: haikuResults }, available);

    // Ensure Sonnet's meal names/descriptions survived Haiku's pass
    for (const original of mealsArray) {
      const meal = plan.meals.find((m: any) => m.day_of_week === original.day_of_week);
      if (meal) {
        meal.meal_name = String(original.meal_name).trim();
        meal.description = String(original.description).trim();
        meal.is_fish = original.is_fish ?? false;
        meal.needs_recipe = original.needs_recipe ?? false;
        meal.estimated_prep_minutes = original.estimated_prep_minutes ?? 30;
      }
    }

    log(`done — ${plan.meals.length} meals, ${plan.meals.reduce((n: number, m: any) => n + m.ingredients.length, 0)} ingredients total`);

    return new Response(JSON.stringify(plan), {
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
