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
    const input = await req.json();

    const fridgeSummary = (input.fridgeItems ?? [])
      .map((i: any) => `${i.quantity} ${i.unit} ${i.name}`)
      .join(', ');

    // ── Step 1: Generate meal structure (no descriptions — keeps tokens low) ──

    const structurePrompt = `
Plan a week of 7 dinners for a single person in Christchurch, New Zealand.

FRIDGE (use these up):
${fridgeSummary || 'Nothing noted'}

GARDEN (available this week):
${(input.gardenAvailable ?? []).join(', ') || 'Nothing ready'}

SPONTANEOUS ADDITIONS:
${(input.spontaneousAdditions ?? []).join(', ') || 'None'}

NIGHTS AWAY (0=Monday, skip these days):
${(input.nightsAway ?? []).join(', ') || 'None'}

HOLLY HOME (include her preferences these nights):
${(input.hollyHomeNights ?? []).join(', ') || 'None this week'}

Return ONLY a JSON object with this exact shape — no prose:
{
  "meals": [
    {
      "day_of_week": 0,
      "meal_name": "string",
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
          "buy_timing": "weekend|day_of",
          "from_fridge": false,
          "from_garden": false,
          "is_pantry_staple": false,
          "ingredient_category": "produce",
          "herb_backup": null
        }
      ]
    }
  ],
  "planning_notes": "string"
}`;

    const structureResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: `You are EatWell's meal planning engine for Christchurch, New Zealand.
Rules:
1. Use fridge items first (from_fridge: true). Mark garden items from_garden: true.
2. Fish meals on Friday/Saturday/Sunday only — buy_timing: "day_of"
3. Cluster ingredients across meals to reduce waste
4. ONE person, 58kg — small appetites. Portions: fish 1 small fillet (130–150g), chicken max 2 thighs OR 1 small breast (250g), red meat/pork/lamb 120–150g, prawns 120g, kumara/potato 1 medium or 2 small per person, pasta/rice 60–75g dry weight. On Holly nights, double the protein and carbs only.
5. Varied, interesting meals mixing quick and longer cooks
6. NEVER use the same protein (chicken, fish, pork, beef, lamb, prawns) on consecutive nights
7. NEVER use the same carbohydrate base (pasta, rice, potatoes, bread, polenta, noodles, couscous) on consecutive nights
8. ONLY include a garden herb/produce item as an ingredient if that specific item is genuinely part of the recipe. Do NOT add garden herbs to a meal just because they are available — only include them if the dish actually calls for that herb. Mark as from_garden: true only for items the user has available from their garden that are legitimately used in the meal.
9. Omit days the user is away
10. Set needs_recipe: true for complex dishes
11. Mark ALL of the following as is_pantry_staple: true — olive oil, all oils, salt, pepper, ALL dried herbs (oregano, thyme, rosemary, bay leaves, etc), ALL spices (cumin, paprika, turmeric, cinnamon, etc), flour, sugar, butter, soy sauce, fish sauce, stock/broth, vinegar, garlic, onions, shallots, eggs, pasta, rice, noodles, canned tomatoes, tomato paste, mustard, honey, capers, anchovies, chilli flakes, nuts, seeds
12. ingredient_category values: meat_fish, produce, fresh_herbs (fresh leafy herbs only — basil, parsley, coriander, mint, dill, tarragon, chives), dairy_eggs, pantry_dry_goods, bread
13. For fresh_herbs set herb_backup to a short fallback suggestion; all others herb_backup: null
14. Max 7 ingredients per meal — be concise
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

    // ── Step 2: Generate cooking descriptions for all meals ───────────────────

    const mealList = plan.meals
      .map((m: any) => `- ${m.meal_name}`)
      .join('\n');

    const descResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: `You write brief, warm cooking descriptions for a home cook. Each description is 2–3 sentences covering the key technique and what makes the dish good. Direct, confident voice. No fluff.`,
      messages: [{
        role: 'user',
        content: `Write a 2–3 sentence cooking description for each of these meals. Return ONLY a JSON object like {"descriptions": {"Meal Name": "description text"}}:\n\n${mealList}`,
      }],
    });

    const descRaw = (descResponse.content[0] as { type: string; text: string }).text;
    const { parsed: descData, error: descError } = jsonOrError(descRaw, 'Descriptions');

    // Merge descriptions into meals (non-fatal if it fails)
    const descriptions = descError ? {} : (descData?.descriptions ?? {});
    plan.meals = plan.meals.map((m: any) => ({
      ...m,
      description: descriptions[m.meal_name] ?? '',
    }));

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
