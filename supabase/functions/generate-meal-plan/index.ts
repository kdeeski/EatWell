import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonOrError(raw: string, label: string): { parsed: any; error: string | null } {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return { parsed: JSON.parse(cleaned), error: null };
  } catch {
    return { parsed: null, error: `${label} — invalid JSON. Raw start: ${cleaned.slice(0, 200)}` };
  }
}

// ── Allowed enum values ─────────────────────────────────────────────────────

const INGREDIENT_CATEGORIES = [
  'meat_fish', 'dairy_eggs', 'produce', 'herbs_spices', 'pantry_dry_goods',
  'bread_bakery', 'cans_preserves', 'oils_vinegars', 'condiments_sauces',
  'beverages', 'alcohol', 'household',
] as const;

const STORES = ['grocer', 'butcher', 'supermarket', 'liquor_store'] as const;
const BUY_TIMINGS = ['weekend', 'day_of', 'sunday_default'] as const;

// ── System prompt (three layers: hard rules → guidelines → output contract) ──

const SYSTEM_PROMPT = `You are EatWell's meal planning engine for Christchurch, New Zealand. Create practical, interesting weekly dinner plans using the user's available food, preferences, household schedule, and seasonal context.

Return only valid JSON matching the requested schema. Do not include prose, markdown, comments, or extra keys.

DECISION HIERARCHY (highest priority first):
1. Safety and dietary exclusions always win.
2. Nights away and pinned meals are fixed.
3. Carry-forward and repeat meals must be honoured where there is an available night.
4. Fresh fridge items should be used before they spoil.
5. Freezer items may be used where they fit naturally but are not urgent.
6. User preferences personalise the plan.
7. Variety, seasonality, and waste reduction guide final choices.

─── HARD RULES ───

SCHEDULING
- Generate a meal for every day 0–6 that is not a night away and not a pinned meal. Never leave a slot empty.
- Do not replace pinned meals, but factor them into variety, pasta, fish, and protein rotation checks.
- Include all carry-forward meals on available days using their exact names.
- Include all repeat meals where possible.
- Respect all dietary restrictions and excluded proteins.

WEEKLY BALANCE
- Exactly 1 fish/seafood meal per week. Place it only on a night where no fish-restricted household member is joining. Prefer Sunday. Set buy_timing to sunday_default for fish ingredients.
- At least 1 fully vegetarian dinner (no meat, no fish — eggs/dairy fine). It must be substantial and interesting.
- Every meal must be a complete dinner. Never suggest a dip, spread, condiment, or side dish as a standalone meal.

FRIDGE AND FREEZER
- Use fridge items before they spoil. Mark fridge-sourced ingredients as from_fridge: true.
- Freezer items are not urgent. Use only where they genuinely fit. Do not cluster similar freezer proteins on consecutive nights. Mark freezer-sourced ingredients as from_freezer: true.
- Both from_fridge and from_freezer items should not be added as purchases.

VARIETY ACROSS WEEKS
- Do not repeat last week's meals, close variants, same base format, or same protein cut — unless a fridge item, carry-forward, or repeat meal requires it.

PASTA
- Maximum 1 pasta dish per week unless 2+ carry-forward meals are pasta.
- Never repeat a pasta shape in the same week, including pinned meals.
- Always name the exact shape (Rigatoni, Spaghetti, Orecchiette, etc.) — never generic "Pasta" or "Dried Pasta".
- Fresh pasta (pappardelle, tagliatelle, fettuccine, etc.): mark as is_pantry_staple: true and from_fridge: false — the user makes their own.

PORTIONS
- Default: cook for 1 small appetite. Fish 150–180g, chicken 2 thighs or 1 small breast, red meat/pork/lamb 150g, prawns 150g, dry pasta/rice 70–80g, kumara/potato 1–2 medium.
- Scale up when household members are joining that night.

INGREDIENTS
- Garden items: only mark from_garden: true when the item is listed as available and genuinely used.
- Long-life fridge staples (eggs, milk, cream, crème fraîche, parmesan, Greek yoghurt, butter, standard cheeses): do not list for small amounts. Only list for large amounts (300ml+ cream, 4+ eggs, 200g+ cheese). If listed, always name eggs as "Eggs".
- Pantry staples: mark is_pantry_staple: true for items a well-equipped kitchen keeps (oils, salt, pepper, dried spices, flour, sugar, soy sauce, vinegars, canned tomatoes, rice, dried pulses, onions, garlic, stock, etc.).
- Fresh herbs: set herb_backup to a short fallback. Note if hard to find in Christchurch.
- Every ingredient must be a single item — never combine (e.g. separate "Salt" and "Black Pepper").
- Always include fresh weekly purchases: fresh herbs, fresh fish, fresh meat, fresh produce, bread/bakery.
- If yeast is required, use active dried yeast only with a blooming step.

FORMATTING
- Metric measurements only. UK/NZ English.
- Meal names: max 7 words, Title Case, use "with" and "and" as connectors.
- Ingredient names: Title Case, single items.
- ingredient_category: use exactly one of ${INGREDIENT_CATEGORIES.join(', ')}.
- dairy_eggs for all dairy and egg items. herbs_spices for all herbs and spices. alcohol items: set store to liquor_store.
- store: use exactly one of ${STORES.join(', ')}.
- buy_timing: use exactly one of ${BUY_TIMINGS.join(', ')}. Use sunday_default for fish.
- Set needs_recipe: true for dishes with non-obvious technique or more than 6 fresh components.

─── GUIDELINES ───

MEAL QUALITY
- Make the week feel like a thoughtful home menu. Prefer meals with clear technique, sauce, seasoning, or texture contrast.
- Avoid boring defaults (plain steamed protein with rice, generic stir-fry, basic salad as a main). Simple is fine if deliberate and well-executed.
- Aim for one dish per week the user might not have thought of themselves.

DIVERSITY
- At least 3 broad culinary traditions across the week. No more than 2 meals from the same tradition.
- At least 3 cooking approaches (braise, roast, sauté, stir-fry, grill, char, poach, steam, raw elements).
- Avoid the same protein on consecutive nights where possible.

WASTE AND SEASONALITY
- Cluster fresh ingredients across meals to minimise waste, especially herbs.
- A single garden herb should appear in at most 2 meals.
- Use seasonal New Zealand produce appropriate to the date.

PERSONALISATION
- Match user preferences: lean toward liked cuisines, avoid disliked, respect spice level, keep Mon–Thu within weeknight_max_minutes, apply weekend cooking preference.
- Follow standing orders and cooking notes.

─── OUTPUT CONTRACT ───

Before returning, verify:
- Every required day has exactly one meal. No night-away has a meal. No pinned day is replaced.
- Carry-forward and repeat meals are included.
- Exactly 1 fish meal (unless impossible). At least 1 vegetarian meal.
- Max 1 pasta meal (unless carry-forward forces more). No repeated pasta shapes.
- All ingredient_category and store values are from the allowed sets.
- Every ingredient is a single item. All quantities are metric.
- Response is valid JSON only.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const client = new Anthropic({ apiKey });
    const rawBody = await req.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Request body is empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const input = JSON.parse(rawBody);

    // ── Build dynamic context blocks ────────────────────────────────────────

    const fridgeSummary = (input.fridgeItems ?? [])
      .map((i: any) => `${i.quantity} ${i.unit} ${i.name}`)
      .join(', ');

    const freezerSummary = (input.freezerItems ?? [])
      .map((i: any) => `${i.quantity} ${i.unit} ${i.name}`)
      .join(', ');

    const prefs = input.preferences ?? null;

    let prefsBlock = '';
    if (prefs) {
      const lines: string[] = [];
      if (prefs.cuisine_likes?.length)    lines.push(`Cuisines I love: ${prefs.cuisine_likes.join(', ')}`);
      if (prefs.cuisine_dislikes?.length) lines.push(`Cuisines to avoid: ${prefs.cuisine_dislikes.join(', ')}`);
      if (prefs.proteins_excluded?.length) lines.push(`Proteins I don't eat: ${prefs.proteins_excluded.join(', ')}`);
      if (prefs.spice_level)              lines.push(`Spice level: ${prefs.spice_level}`);
      if (prefs.weeknight_max_minutes)    lines.push(`Max weeknight cooking time: ${prefs.weeknight_max_minutes} minutes`);
      if (prefs.weekend_cooking)          lines.push(`Weekend cooking style: ${prefs.weekend_cooking === 'project' ? 'Love a cooking project' : 'Keep it simple'}`);
      if (prefs.cooking_notes)            lines.push(`Personal notes: ${prefs.cooking_notes}`);
      if (lines.length) prefsBlock = `\nUSER PREFERENCES:\n${lines.join('\n')}\n`;
    }

    let standingOrdersBlock = '';
    if (prefs?.standing_orders) {
      standingOrdersBlock = `\nSTANDING ORDERS (always apply):\n${prefs.standing_orders}\n`;
    }

    const carryForward: Array<{ name: string; description: string | null }> = input.carryForwardMeals ?? [];
    let carryForwardBlock = '';
    if (carryForward.length > 0) {
      const lines = carryForward.map((m) => `- ${m.name}${m.description ? `: ${m.description}` : ''}`);
      carryForwardBlock = `\nCARRY FORWARD (must include all):\n${lines.join('\n')}\n`;
    }

    const repeatMeals: Array<{ name: string; rating: number; description: string | null }> = input.repeatMeals ?? [];
    let repeatMealsBlock = '';
    if (repeatMeals.length > 0) {
      const stars = (r: number) => '★'.repeat(r) + '☆'.repeat(5 - r);
      const lines = repeatMeals.map((m) => `- ${m.name} (${stars(m.rating)})${m.description ? `: ${m.description}` : ''}`);
      repeatMealsBlock = `\nREPEAT MEALS (include all, distributed through the week):\n${lines.join('\n')}\n`;
    }

    const previousMeals: string[] = input.previousMeals ?? [];
    let previousMealsBlock = '';
    if (previousMeals.length > 0) {
      previousMealsBlock = `\nLAST WEEK'S MEALS (do not repeat these or close variants):\n${previousMeals.map((n) => `- ${n}`).join('\n')}\n`;
    }

    const pinnedMeals: Array<{ name: string; day_of_week: number }> = input.pinnedMeals ?? [];
    let pinnedMealsBlock = '';
    if (pinnedMeals.length > 0) {
      const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const lines = pinnedMeals.map((m) => `- ${DAY_NAMES[m.day_of_week]}: ${m.name}`);
      pinnedMealsBlock = `\nPINNED MEALS (locked — do not replace, but factor into rotation):\n${lines.join('\n')}\n`;
    }

    const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const householdMembers = input.householdMembers ?? [];
    let householdBlock = '';
    if (householdMembers.length > 0) {
      const lines = householdMembers.map((m: any) => {
        const nights = (m.nights_home ?? []).map((d: number) => DAY_NAMES_FULL[d]).join(', ');
        const dietary = m.dietary_notes ? ` (${m.dietary_notes})` : '';
        return `- ${m.name}${dietary}: ${nights || 'not this week'}`;
      });
      householdBlock = `\nHOUSEHOLD:\n${lines.join('\n')}\n`;
    }

    // ── Build user prompt ───────────────────────────────────────────────────

    const userPrompt = `Plan 7 dinners for this week.

FRIDGE (use before they spoil):
${fridgeSummary || 'Nothing noted'}

FREEZER (use where it fits, not urgent):
${freezerSummary || 'Nothing noted'}

GARDEN (available now):
${(input.gardenAvailable ?? []).join(', ') || 'Nothing ready'}

SPONTANEOUS ADDITIONS:
${(input.spontaneousAdditions ?? []).join(', ') || 'None'}
${previousMealsBlock}${pinnedMealsBlock}${carryForwardBlock}${repeatMealsBlock}
NIGHTS AWAY (0=Monday, skip these):
${(input.nightsAway ?? []).join(', ') || 'None'}
${householdBlock}${standingOrdersBlock}${prefsBlock}
TODAY: ${new Date().toLocaleDateString('en-NZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Return ONLY this JSON shape:
{
  "meals": [
    {
      "day_of_week": 0,
      "meal_name": "string",
      "description": "2-3 sentence cooking description",
      "is_fish": false,
      "needs_recipe": false,
      "estimated_prep_minutes": 25,
      "guests_count": 0,
      "ingredients": [
        {
          "name": "string",
          "quantity": 1,
          "unit": "string",
          "store": "grocer|butcher|supermarket|liquor_store",
          "buy_timing": "weekend|day_of|sunday_default",
          "from_fridge": false,
          "from_freezer": false,
          "from_garden": false,
          "is_pantry_staple": false,
          "ingredient_category": "meat_fish|dairy_eggs|produce|herbs_spices|pantry_dry_goods|bread_bakery|cans_preserves|oils_vinegars|condiments_sauces|beverages|alcohol|household",
          "herb_backup": null
        }
      ]
    }
  ],
  "planning_notes": "string"
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const { parsed: plan, error: parseError } = jsonOrError(raw, 'Meal plan');
    if (parseError) {
      return new Response(JSON.stringify({ error: parseError }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
