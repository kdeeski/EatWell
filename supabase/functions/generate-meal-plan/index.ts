import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const userMessage = `
Plan a week of 7 dinners given the following context:

FRIDGE (what I already have — use these up):
${fridgeSummary || 'Nothing noted this week'}

GARDEN (available to harvest this week):
${(input.gardenAvailable ?? []).join(', ') || 'Nothing ready'}

SPONTANEOUS ADDITIONS (unexpected items to incorporate):
${(input.spontaneousAdditions ?? []).join(', ') || 'None'}

NIGHTS AWAY (skip meals for these days, 0=Monday):
${(input.nightsAway ?? []).join(', ') || 'None'}

HOLLY HOME (include her preferences on these nights, 0=Monday):
${(input.hollyHomeNights ?? []).join(', ') || 'None this week'}

Return a JSON object with this exact shape:
{
  "meals": [
    {
      "day_of_week": 0,
      "meal_name": "string",
      "description": "string",
      "is_fish": false,
      "needs_recipe": false,
      "estimated_prep_minutes": 25,
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
      ],
      "holly_included": false
    }
  ],
  "planning_notes": "string"
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: `You are EatWell's meal planning engine for a home cook in Christchurch, New Zealand.
Rules:
1. Use fridge items first (from_fridge: true)
2. Fish meals go Friday/Saturday/Sunday only, always buy_timing: "day_of"
3. Cluster ingredients across meals to avoid waste
4. Plan for ONE person — dinner portions only, no more than 2 serves per dish
5. Mix quick meals with one or two longer ones
6. Meals should be interesting and varied
7. Use garden produce when available (from_garden: true)
8. Omit days when user is away
9. Set needs_recipe: true for dishes that need a recipe
10. Mark common pantry staples as is_pantry_staple: true — things like olive oil, salt, pepper, dried herbs, spices, flour, sugar, butter, soy sauce, stock/broth, vinegar, garlic, onions, eggs, pasta, rice, canned tomatoes, mustard
11. Categorise every ingredient using ingredient_category. Values: meat_fish (all meat, poultry, seafood), produce (fresh vegetables, fruit, fungi), fresh_herbs (any fresh herb — basil, parsley, coriander, mint, thyme, rosemary, tarragon, chives, dill, etc), dairy_eggs (milk, cream, butter, cheese, yoghurt, eggs, crème fraîche), pantry_dry_goods (dried pasta, rice, grains, canned goods, condiments, oils, vinegars, sauces, nuts, spices, flour, sugar, dried pulses, bread, wine for cooking), bread (fresh bread, rolls, flatbreads). If unsure, use produce.
12. For every fresh_herbs ingredient, set herb_backup to a short backup suggestion (e.g. "flat-leaf parsley", "parsley + pinch fennel seeds", "coriander or parsley"). For all other categories, herb_backup must be null.
13. The "description" field must be a rich 3–5 sentence cooking paragraph — enough for the cook to make the dish without a separate recipe. Describe the actual technique, key steps, and what makes it good. Write in a warm, direct voice. Example: "Roast cherry tomatoes with garlic and olive oil until jammy. Toss with kalamata olives, fried capers, and a splash of red wine vinegar. Sear the snapper skin-side down until crisp, then flip briefly. The relish is essentially a warm punchy salsa — no sauce-making, just assembly. Done in 25 minutes."
Respond ONLY with valid JSON. No prose outside the JSON.`,
      messages: [{ role: 'user', content: userMessage }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const json = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    // Validate JSON before returning so we get a clear error if Claude truncated
    try {
      JSON.parse(json);
    } catch {
      return new Response(
        JSON.stringify({ error: `Claude returned invalid JSON (likely truncated). Raw start: ${json.slice(0, 200)}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(json, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
