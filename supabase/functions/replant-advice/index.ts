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
      plant_name,
      variety,
      current_month,
      current_year,
      previous_planted_date,
      previous_notes,
      previous_location,
      harvest_summary,
      plants_in_ground = [],
    } = input;

    if (!plant_name) {
      return new Response(JSON.stringify({ error: 'plant_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const monthName = MONTH_NAMES[current_month] ?? 'Unknown';

    const plantsText = plants_in_ground.length > 0
      ? plants_in_ground.map((p: any) => `${p.plant_name} (${p.status})`).join(', ')
      : 'none';

    const userPrompt = `Plant: ${plant_name}${variety ? ` (variety: ${variety})` : ''}
Month: ${monthName} ${current_year}
Previously planted: ${previous_planted_date}${previous_location ? `\nPrevious location: ${previous_location}` : ''}${previous_notes ? `\nGrower's notes: ${previous_notes}` : ''}${harvest_summary ? `\nHarvest history: ${harvest_summary}` : '\nNo harvests recorded from previous planting.'}
Currently in the ground: ${plantsText}

Return:
{
  "timing": "string",
  "is_good_time": boolean,
  "tips_from_history": "string",
  "soil_notes": "string or null",
  "sun_notes": "string or null",
  "companion_note": "string or null"
}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are a garden advisor for a home cook in Canterbury, New Zealand (Southern Hemisphere, ~43.5°S).

Frost-free window: October–April. Last frost: mid-September. First frost: mid-May.
Christchurch is relatively dry with hot summers; cool autumns suit brassicas and salad greens.

The user previously grew a specific plant and wants to know if they should plant it again. Give advice tailored to their history with this plant.

Fields:
- timing: one sentence about whether NOW is a good time to plant this in Canterbury. If not, say when the right window is.
- is_good_time: true if this month is a viable planting window, false if they should wait.
- tips_from_history: one to two sentences of advice informed by their previous growing experience — reference their notes, location, or harvest patterns if available. If no history, give a general growing tip specific to this plant in Canterbury.
- soil_notes: one short phrase about ideal soil (e.g. "Well-drained, compost-enriched soil"). Null if not noteworthy.
- sun_notes: one short phrase about sun needs (e.g. "Full sun, 6+ hours"). Null if not noteworthy.
- companion_note: one sentence about what grows well alongside this plant, considering what's currently in their ground. Null if no useful companion advice.

Keep all fields concise. Respond ONLY with valid JSON.`,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const { parsed, error } = jsonOrError(raw, 'Replant advice');
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
