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

    const fridgeSummary = (input.fridgeItems ?? [])
      .map((i: any) => `${i.quantity} ${i.unit} ${i.name}`)
      .join(', ');

    const freezerSummary = (input.freezerItems ?? [])
      .map((i: any) => `${i.quantity} ${i.unit} ${i.name}`)
      .join(', ');

    const prefs = input.preferences ?? null;

    // Build preferences block for the prompt
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
      standingOrdersBlock = `\nSTANDING ORDERS (always apply, non-negotiable):\n${prefs.standing_orders}\n`;
    }

    const carryForward: Array<{ name: string; description: string | null }> = input.carryForwardMeals ?? [];
    let carryForwardBlock = '';
    if (carryForward.length > 0) {
      const lines = carryForward.map((m) =>
        `- ${m.name}${m.description ? `: ${m.description}` : ''}`
      );
      carryForwardBlock = `\nCARRY FORWARD (must include ALL of these in the plan — user didn't get to cook them last week):\n${lines.join('\n')}\n`;
    }

    const repeatMeals: Array<{ name: string; rating: number; description: string | null }> = input.repeatMeals ?? [];
    let repeatMealsBlock = '';
    if (repeatMeals.length > 0) {
      const stars = (r: number) => '★'.repeat(r) + '☆'.repeat(5 - r);
      const lines = repeatMeals.map((m) =>
        `- ${m.name} (${stars(m.rating)})${m.description ? `: ${m.description}` : ''}`
      );
      repeatMealsBlock = `\nREPEAT MEALS (you must include all of these, distributed through the week):\n${lines.join('\n')}\n`;
    }

    const previousMeals: string[] = input.previousMeals ?? [];
    let previousMealsBlock = '';
    if (previousMeals.length > 0) {
      previousMealsBlock = `\nLAST WEEK'S MEALS (do not repeat any of these — the user wants fresh variety):\n${previousMeals.map((n) => `- ${n}`).join('\n')}\n`;
    }

    const pinnedMeals: Array<{ name: string; day_of_week: number }> = input.pinnedMeals ?? [];
    let pinnedMealsBlock = '';
    if (pinnedMeals.length > 0) {
      const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const lines = pinnedMeals.map((m) => `- ${DAY_NAMES[m.day_of_week]}: ${m.name}`);
      pinnedMealsBlock = `\nPINNED MEALS (already set — do NOT generate a meal for these days, but you MUST factor them into pasta uniqueness, protein rotation, and variety rules when planning the remaining days):\n${lines.join('\n')}\n`;
    }

    // ── Step 1: Generate meal structure (no descriptions — keeps tokens low) ──

    const structurePrompt = `
Plan a week of 7 dinners for a single person in Christchurch, New Zealand.

FRIDGE (use these up this week — fresh items that will spoil):
${fridgeSummary || 'Nothing noted'}

FREEZER (use where it fits naturally — no urgency, won't spoil this week):
${freezerSummary || 'Nothing noted'}

GARDEN (available this week):
${(input.gardenAvailable ?? []).join(', ') || 'Nothing ready'}

SPONTANEOUS ADDITIONS:
${(input.spontaneousAdditions ?? []).join(', ') || 'None'}
${previousMealsBlock}${pinnedMealsBlock}${carryForwardBlock}${repeatMealsBlock}
NIGHTS AWAY (0=Monday, skip these days):
${(input.nightsAway ?? []).join(', ') || 'None'}

HOLLY HOME (include her preferences these nights):
${(input.hollyHomeNights ?? []).join(', ') || 'None this week'}
${standingOrdersBlock}${prefsBlock}
TODAY'S DATE: ${new Date().toLocaleDateString('en-NZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Return ONLY a JSON object with this exact shape — no prose:
{
  "meals": [
    {
      "day_of_week": 0,
      "meal_name": "string",
      "description": "2-3 sentence cooking description — key technique and what makes it good",
      "is_fish": false,
      "needs_recipe": false,
      "estimated_prep_minutes": 25,
      "holly_included": false,
      "ingredients": [
        {
          "name": "string",
          "quantity": 1,
          "unit": "string",
          "store": "grocer|butcher|supermarket",
          "buy_timing": "weekend|day_of|sunday_default",
          "from_fridge": false,
          "from_garden": false,
          "is_pantry_staple": false,
          "ingredient_category": "meat_fish|produce|herbs_spices|pantry_dry_goods|bread_bakery|cans_preserves|oils_vinegars|condiments_sauces",
          "herb_backup": null
        }
      ]
    }
  ],
  "planning_notes": "string"
}`;

    const structureResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: `You are EatWell's meal planning engine for Christchurch, New Zealand.

RULES:
1. FRIDGE items — use these up this week, they will spoil. Mark as from_fridge: true, do not add to shopping list. Prioritise them when choosing what protein or produce to build a meal around.

1a. FREEZER items — incorporate these naturally across the week, but with far less urgency than fridge items. They won't spoil. Key freezer rules:
- NEVER cluster the same protein on consecutive nights just because multiple portions exist in the freezer. If the freezer has pork sausages, pork mince and pork chops, spread them across different weeks or use at most one this week, unless fridge items force otherwise.
- A freezer item should feel like a welcome choice, not an obligation. Only use it if it genuinely fits a meal you'd want to cook anyway.
- Mark freezer-sourced ingredients as from_fridge: true (same flag — means "don't buy this").

2. Fish/seafood on solo nights only — Holly dislikes fish. Default fish to Sunday (freshest after Saturday shop). Set buy_timing: "sunday_default" for fish. Days can be reordered by the user. MAX ONE fish or seafood meal per week — do not plan fish on multiple nights regardless of availability.

3. Cluster fresh ingredients across meals to minimise waste — especially fresh herbs. Only include a herb if the dish genuinely calls for it.

4. Cook for ONE small appetite. Portions: fish 150–180g, chicken 2 thighs or 1 small breast, red meat/pork/lamb 150g, prawns 150g, dry pasta/rice 70–80g, kumara/potato 1–2 medium. On Holly nights (holly_included: true), scale the full dish to serve 2–3.

5. VARIED AND GENUINELY INTERESTING MEALS — every week should read like a thoughtful restaurant menu, not a default recipe book. Prioritise technique-driven dishes that feel rewarding to cook. Mix quick weeknight meals with longer weekend projects. Every meal must be a complete, satisfying dinner — never suggest a dip, spread, condiment, or side dish (e.g. whipped feta, hummus, tzatziki, guacamole) as a standalone meal.

ANTI-BOREDOM MANDATE: Do NOT default to the obvious or predictable. Avoid generic safe choices like "Chicken Stir-Fry", "Pasta Bolognese", "Grilled Salmon with Vegetables", "Chicken Breast with Rice". If you find yourself about to suggest something forgettable, push yourself to a more specific, interesting version — a different technique, a more precise sauce, an unexpected flavour pairing. Aim to include at least one dish the user might not have thought of themselves.

5a. CUISINE DIVERSITY — across the week, meals must span at least 3 distinct culinary traditions. Broad traditions: European/Mediterranean (Italian, French, Spanish, Greek), Middle Eastern/North African, South-East Asian (Thai, Vietnamese, Malaysian, Indonesian), East Asian (Japanese, Chinese, Korean), South Asian (Indian, Sri Lankan), Latin American, Modern NZ/Antipodean. No more than 2 meals from the same broad tradition in one week — e.g. a pasta dish AND a risotto counts as 2 Italian, a third Italian-inspired dish is not allowed.

5b. TECHNIQUE DIVERSITY — across the week, use at least 3 distinct cooking approaches from this list: braising or slow cooking, oven roasting, quick pan sauté or stir-fry, grilling or charring, poaching or steaming, fresh or raw elements as a main component. This prevents the week from defaulting to "pan-fry protein, serve with sides."

6. Avoid the same protein on consecutive nights where possible (guideline, not hard rule).

6a. WEEKLY BALANCE — every week must include: exactly 1 fish/seafood meal, at least 1 fully vegetarian meal (no meat, no fish — eggs/dairy fine). The remaining nights are meat-based. This is a hard rule.

The vegetarian meal must be genuinely exciting and substantial — not "pasta with roasted vegetables" or a basic salad. Good examples of the ambition level: Shakshuka with Feta and Harissa, Spiced Red Lentil Dahl with Crispy Shallots, Turkish Eggs with Brown Butter and Yogurt, Mushroom Larb with Sticky Rice, Corn and Halloumi Fritters with Chilli Sauce, Smashed Cucumber and Tofu in Chilli Oil, Saag Paneer, Miso Roasted Eggplant with Sesame Rice. Match the style to the user's cuisine preferences.

7. Never use the same pasta shape twice in the same week (hard rule). Pasta itself can appear more than once — just use different shapes. This rule applies across ALL meals in the week, including any PINNED MEALS listed above. Before choosing a pasta dish, check whether any pinned meal already uses that shape and pick a different one if so.

7b. PASTA SPECIFICITY — When adding pasta as a shopping ingredient, always name the exact shape (e.g. "Rigatoni", "Spaghetti", "Linguine", "Orecchiette", "Penne", "Fusilli", "Tagliatelle"). NEVER use generic names like "Pasta", "Dry Pasta", "Dried Pasta", or "Pasta Shapes". The ingredient name must be the actual shape the recipe uses. This rule applies to both dry pasta and fresh pasta. If a dish uses a specific pasta shape in its meal name (e.g. "Rigatoni with Sausage Ragù"), the ingredient must be that exact shape ("Rigatoni"), not a generic term.

7a. FRESH PASTA — if a meal uses fresh pasta (pappardelle, tagliatelle, fettuccine, etc.), mark it as is_pantry_staple: true and from_fridge: false — the user makes their own fresh pasta and does not buy it. Do not add fresh pasta to the shopping list.

8. Omit days the user is away entirely — do not generate a meal for those day_of_week values.

9. Set needs_recipe: true for any dish with a non-obvious technique or more than 6 fresh components.

10. PANTRY STAPLES — use your judgment to mark is_pantry_staple: true for any ingredient a well-equipped home kitchen would typically keep stocked and not buy weekly (e.g. oils, salt, pepper, dried spices, dried herbs, flour, sugar, soy sauce, vinegars, canned tomatoes, pasta, rice, dried pulses, onions, garlic, butter, stock). These will still appear on the shopping list with a "have it" swipe so the user can confirm. NOTE: this will eventually be replaced by a live inventory system.

11. LONGER-LIFE FRIDGE ITEMS — these are ALWAYS assumed to be in the fridge. NEVER add them to ingredients for small quantities. Only include them when the recipe needs an unusually large amount (e.g. 300ml+ cream, 4+ eggs, 200g+ cheese IS worth listing; a splash of cream, 1–2 eggs, a grating of parmesan is NOT). Items: eggs, milk, cream, crème fraîche, parmesan, Greek yogurt, butter, standard cheeses. When eggs ARE listed, ALWAYS use the name "Eggs" (plural, Title Case) — never "egg", "egg yolks", "egg whites", or any variation. Set ingredient_category to dairy_eggs for all dairy and egg items.

12. ALWAYS include in ingredients (fresh, weekly purchases): fresh herbs, fresh fish, fresh meat, fresh produce, bread/bakery items.

13. ingredient_category values — use exactly one of: meat_fish, dairy_eggs, produce, herbs_spices, pantry_dry_goods, bread_bakery, cans_preserves, oils_vinegars, condiments_sauces, beverages, alcohol, household. Use dairy_eggs for eggs, milk, cream, butter, cheese, yogurt — ONLY when included per rule 11. Use herbs_spices for ALL herbs (fresh or dried) and spices. Use beverages for juice, soft drinks, sparkling water, mixers. Use alcohol for wine, beer, spirits — always set store to liquor_store for alcohol ingredients. Use household for cleaning products, laundry items, toiletries, batteries, etc. NEVER use cans_preserves for dairy or egg items.

14. For fresh_herbs: always set herb_backup to a short fallback. Note in herb_backup if the herb is hard to find in Christchurch (e.g. tarragon, chervil).

15. Always use metric measurements. If yeast is required use active dried yeast only — always include a blooming step, never instant yeast.

16. Seasonal awareness: suggest produce appropriate to the current NZ season (Southern Hemisphere). Today's date is provided in the prompt.

17. ONLY include a garden item (from_garden: true) if it is genuinely used in the recipe and the user has flagged it as available. Do not pad meals with garden items just because they are available.

18. Meal names: use "with" and "and" as connectors instead of commas (e.g. "Lamb Meatballs with Harissa", "Salmon with Roasted Veg and Lemon Butter"). Max 7 words. Use UK English Title Case: capitalise nouns/verbs/adjectives but NOT joining words (with, and, or, in, on, the, a, of, by).

19. Ingredient names: use UK English Title Case (e.g. "Chicken Thighs", "Cherry Tomatoes", "Olive Oil"). Always lowercase joining words.

20. NEVER combine multiple ingredients into one entry (e.g. never "salt and pepper" — always list as two separate ingredients: "salt" and "black pepper"). Every ingredient must be a single item with its own name, quantity, and unit.

20. GARDEN VARIETY RULE — garden produce is a weekly constraint (use what is ready before it spoils), not a theme to build the entire week around. Aim for variety across the week even when garden produce is abundant. A single garden herb should appear in at most 2 meals per week. Do not let garden availability dominate the menu or create repetitive flavour profiles.

21. USER PREFERENCES — if USER PREFERENCES are provided in the prompt, treat them as personalisation constraints: lean toward cuisine_likes, avoid cuisine_dislikes, never use proteins_excluded, match spice_level (mild = subtle seasoning, medium = balanced, bold = heat welcome), respect weeknight_max_minutes for Mon–Thu prep times, apply weekend cooking style (project = longer/complex welcome on Sat–Sun, quick = keep it simple all week), and follow any personal cooking_notes. These preferences narrow and personalise choices — do not override safety rules above.

22. CARRY FORWARD — if a "CARRY FORWARD" section appears in the prompt, you MUST include every meal listed in the final plan. Assign each carry-forward meal to any available day (not a night-away day). Use the exact meal name as given — do not rename or paraphrase. This is a hard rule that overrides variety/rotation preferences. If there are more carry-forward meals than available nights, include as many as will fit.

23. VARIETY ACROSS WEEKS — if a "LAST WEEK'S MEALS" section appears in the prompt, avoid repeating not just the exact meal names but the same base dish format or protein cut. The test is: would a reasonable person say "that's basically the same dish"? If yes, choose something else. Examples:
- Last week: "Beef Meatballs with Tomato Sauce" → this week: no meatball dish of any protein
- Last week: "Pork Chops with Apple and Thyme" → this week: no pork chop dish regardless of sauce
- Last week: "Gnocchi with Parsnip and Sage" → this week: no gnocchi dish
- Last week: "Lamb Ragu with Tagliatelle" → this week: avoid another pasta ragù; choose a different sauce style

IMPORTANT EXCEPTION — fridge items override this rule: if an ingredient listed in FRIDGE (e.g. leftover gnocchi, pork chops, mince) is a core component of a dish that appeared last week, you MUST still plan a meal that uses it up. Wasting food is worse than repeating a format. In that case, make the preparation as different as possible from last week's version.

REPEAT MEALS and CARRY FORWARD entries also override this rule.

Respond ONLY with valid JSON.`,
      messages: [{ role: 'user', content: structurePrompt }],
    });

    const structureRaw = (structureResponse.content[0] as { type: string; text: string }).text;
    const { parsed: plan, error: structureError } = jsonOrError(structureRaw, 'Meal structure');
    if (structureError) {
      return new Response(JSON.stringify({ error: structureError }), {
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
