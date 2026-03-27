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
          "from_garden": false
        }
      ],
      "holly_included": false
    }
  ],
  "planning_notes": "string"
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `You are EatWell's meal planning engine for a home cook in Christchurch, New Zealand.
Rules:
1. Use fridge items first (from_fridge: true)
2. Fish meals go Friday/Saturday/Sunday only, always buy_timing: "day_of"
3. Cluster ingredients across meals to avoid waste
4. Mix quick meals with one or two longer ones
5. Meals should be interesting and varied
6. Use garden produce when available (from_garden: true)
7. Omit days when user is away
8. Set needs_recipe: true for dishes that need a recipe
Respond ONLY with valid JSON. No prose outside the JSON.`,
      messages: [{ role: 'user', content: userMessage }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const json = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

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
