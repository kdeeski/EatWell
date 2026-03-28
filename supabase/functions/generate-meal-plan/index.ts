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

TODAY'S DATE: ${new Date().toLocaleDateString('en-NZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

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
          "buy_timing": "weekend|day_of|sunday_default",
          "from_fridge": false,
          "from_garden": false,
          "is_pantry_staple": false,
          "ingredient_category": "meat_fish|produce|fresh_herbs|pantry_dry_goods|bread_bakery",
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

RULES:
1. Use fridge items first — mark as from_fridge: true, do not add to shopping list.

2. Fish on solo nights only — Holly dislikes fish. Default fish to Sunday (freshest after Saturday shop). Set buy_timing: "sunday_default" for fish. Days can be reordered by the user.

3. Cluster fresh ingredients across meals to minimise waste — especially fresh herbs, which must all be purchased (no herb garden currently). Only include a herb if the dish genuinely calls for it.

4. Cook for ONE small appetite. Portions: fish 150–180g, chicken 2 thighs or 1 small breast, red meat/pork/lamb 150g, prawns 150g, dry pasta/rice 70–80g, kumara/potato 1–2 medium. On Holly nights (holly_included: true), scale the full dish to serve 2–3.

5. Varied, interesting meals — prioritise technique-driven dishes that feel rewarding to cook. Mix quick weeknight meals with longer weekend projects.

6. Avoid the same protein on consecutive nights where possible (guideline, not hard rule).

7. Avoid the same carb base on consecutive nights where possible (guideline, not hard rule).

8. Omit days the user is away entirely — do not generate a meal for those day_of_week values.

9. Set needs_recipe: true for any dish with a non-obvious technique or more than 6 fresh components.

10. PANTRY STAPLES — tracked via inventory, never add to shopping list. Mark is_pantry_staple: true for: olive oil, all oils, salt, pepper, all dried herbs, all dried spices, plain flour, 00 flour, sugar, soy sauce, fish sauce, vinegar, garlic, canned tomatoes, tomato paste, mustard, honey, capers, chilli flakes, nuts, seeds, stock, butter, pasta, rice, noodles, dried pulses.

11. INVENTORY ITEMS — longer-life fridge items, not bought weekly. Do NOT include in ingredients unless needed in an unusually large quantity (e.g. 500ml cream for a sauce): eggs, milk, cream, crème fraîche, parmesan, Greek yogurt, standard cheeses, active dried yeast.

12. ALWAYS include in ingredients (fresh, weekly purchases): fresh herbs, fresh fish, fresh meat, fresh produce, bread/bakery items.

13. ingredient_category values — use exactly: meat_fish, produce, fresh_herbs (fresh leafy herbs only: basil, parsley, coriander, mint, dill, tarragon, chives), pantry_dry_goods, bread_bakery. Do NOT use dairy_eggs as a category.

14. For fresh_herbs: always set herb_backup to a short fallback. Note in herb_backup if the herb is hard to find in Christchurch (e.g. tarragon, chervil).

15. Always use metric measurements. If yeast is required use active dried yeast only — always include a blooming step, never instant yeast.

16. Seasonal awareness: suggest produce appropriate to the current NZ season (Southern Hemisphere). Today's date is provided in the prompt.

17. ONLY include a garden item (from_garden: true) if it is genuinely used in the recipe and the user has flagged it as available. Do not pad meals with garden items just because they are available.

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
