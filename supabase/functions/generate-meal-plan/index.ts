// Supabase Edge Function — generate-meal-plan
// Receives MealPlanInput from the mobile app and calls Claude to produce
// a structured 7-meal weekly plan.

import Anthropic from 'npm:@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const SYSTEM_PROMPT = `You are EatWell's meal planning engine. You help a home cook in Christchurch, New Zealand plan a week of inspiring, ingredient-efficient dinners.

Your meal plans follow these rules:
1. Use what's already in the fridge before anything new is bought — flag ingredients as from_fridge: true
2. Fish meals are assigned to Friday, Saturday, or Sunday (weekend shop proximity). Never add fish to the weekend shopping list — it's always buy_timing: "day_of"
3. Cluster ingredients across meals so nothing is wasted — no half-bunches of celery left over
4. Mix quick weeknight meals (under 30 min) with one or two longer or hands-off meals
5. Meals should be interesting and varied — not sausages and mash every night
6. Garden produce available this week should be used (flag as from_garden: true)
7. Skip days when the user is away (leave those as null or omit)
8. Note if a meal needs a recipe (needs_recipe: true) vs is intuitive cooking
9. Use New Zealand ingredient names and seasonal availability

Respond ONLY with valid JSON matching the GeneratedMealPlan schema. No prose outside the JSON.`;

Deno.serve(async (req) => {
  const input = await req.json();

  const fridgeSummary = input.fridgeItems
    .map((i: any) => `${i.quantity} ${i.unit} ${i.name}`)
    .join(', ');

  const userMessage = `
Plan a week of 7 dinners given the following context:

FRIDGE (what I already have — use these up):
${fridgeSummary || 'Nothing noted this week'}

GARDEN (available to harvest this week):
${input.gardenAvailable.join(', ') || 'Nothing ready'}

SPONTANEOUS ADDITIONS (unexpected items to incorporate):
${input.spontaneousAdditions.join(', ') || 'None'}

NIGHTS AWAY (skip meals for these days, 0=Monday):
${input.nightsAway.join(', ') || 'None'}

HOLLY HOME (include her preferences on these nights, 0=Monday):
${input.hollyHomeNights.join(', ') || 'None this week'}

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
          "from_garden": false
        }
      ],
      "holly_included": false
    }
  ],
  "planning_notes": "string — brief explanation of ingredient logic and why these meals"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text;

  // Strip markdown code fences if present
  const json = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  return new Response(json, {
    headers: { 'Content-Type': 'application/json' },
  });
});
