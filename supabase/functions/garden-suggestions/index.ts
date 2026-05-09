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

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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
    const {
      current_month,
      current_year,
      plants_in_ground = [],
      cooked_meal_ingredients = [],
      inventory = [],
    } = input;

    const monthName = MONTH_NAMES[current_month] ?? 'Unknown';

    const plantsInGroundText = plants_in_ground.length > 0
      ? plants_in_ground.map((p: any) => `${p.plant_name} (${p.status})`).join(', ')
      : 'none';

    const cookedIngredientsText = cooked_meal_ingredients.length > 0
      ? cooked_meal_ingredients
          .slice(0, 10)
          .map((i: any) => `${i.name} x${i.meal_count}`)
          .join(', ')
      : 'no data yet';

    const inventoryText = inventory.length > 0
      ? inventory.map((i: any) => i.name).join(', ')
      : 'nothing noted';

    const userPrompt = `Month: ${monthName} ${current_year}
Plants in ground: ${plantsInGroundText}
Top cooked ingredients (recent meal history): ${cookedIngredientsText}
Current pantry/garden inventory: ${inventoryText}

Return:
{
  "suggestions": [
    {
      "plant_name": "string",
      "why_now": "string",
      "why_worth_growing": "string",
      "why_suits_cooking": "string",
      "soil_notes": "string",
      "sun_notes": "string"
    }
  ]
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are a garden advisor for a home cook in Canterbury, New Zealand (Southern Hemisphere, ~43.5°S).

Frost-free window: October–April. Last frost: mid-September. First frost: mid-May.
Christchurch is relatively dry with hot summers; cool autumns suit brassicas and salad greens.

Given the current month, what the user already grows, what they cook with, and their pantry — suggest 4–6 plants worth growing right now.

Rules:
- Only suggest plants that can realistically be PLANTED (not just harvested) in the given month in Canterbury.
- Do not repeat plants already in the ground with status planted or growing.
- DIVERSITY RULE — actively fill gaps in the user's garden, not amplify what they already grow. If they already have several herbs, prioritise vegetables, brassicas, or fruit. Avoid suggesting more of a plant family already well represented in the ground.
- ECHO CHAMBER RULE — if an ingredient appears frequently in cooking history AND is already grown in the garden, do not suggest growing more of it. Instead suggest complementary plants that would expand their cooking repertoire, not reinforce it.
- Prioritise plants the user cooks with but does NOT already grow — the goal is to close the gap between what they cook and what they can harvest.
- why_now: one sentence, mention specific planting window or timing reason.
- why_worth_growing: one sentence, reference freshness, cost, or Christchurch shop availability.
- why_suits_cooking: one sentence, reference their actual ingredient patterns where possible.
- soil_notes: one short phrase describing ideal soil (e.g. "Well-drained, compost-enriched soil").
- sun_notes: one short phrase describing sun requirement (e.g. "Full sun, 6+ hours" or "Part shade tolerant").
- All why fields: one sentence maximum. soil_notes and sun_notes: one phrase each, no full stop.
- Respond ONLY with valid JSON.`,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const { parsed, error } = jsonOrError(raw, 'Garden suggestions');
    if (error) {
      return new Response(JSON.stringify({ error }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
