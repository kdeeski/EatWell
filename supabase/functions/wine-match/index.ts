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
    const { meal_name, description, detail_level } = input;

    if (!meal_name) {
      return new Response(JSON.stringify({ error: 'meal_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isDetailed = detail_level === 'detailed';

    const schemaDesc = isDetailed
      ? `{ "pairings": [{ "varietal": "string", "reason": "string", "pairing_note": "string" }], "cocktail": { "name": "string", "reason": "string" } }`
      : `{ "pairings": [{ "varietal": "string", "reason": "string" }], "cocktail": { "name": "string", "reason": "string" } }`;

    const systemPrompt = isDetailed
      ? `You are a drinks pairing assistant for EatWell. Given a meal name and optional description, suggest 2-3 wine pairings and one cocktail pairing.

For each wine pairing provide:
- varietal: the wine varietal (e.g. "Pinot Noir", "Sauvignon Blanc")
- reason: one sentence explaining why it works with this dish
- pairing_note: a short paragraph (2-3 sentences) on the food-wine interaction — flavour elements, texture/weight match, and serving tips

For the cocktail provide:
- name: a specific cocktail name (e.g. "Negroni", "Aperol Spritz", "Dark and Stormy")
- reason: one sentence explaining why it complements the dish

Respond ONLY with valid JSON matching this exact schema:
${schemaDesc}`
      : `You are a drinks pairing assistant for EatWell. Given a meal name and optional description, suggest 2-3 wine pairings and one cocktail pairing.

For each wine pairing provide:
- varietal: the wine varietal (e.g. "Pinot Noir", "Sauvignon Blanc")
- reason: one sentence explaining why it works with this dish

For the cocktail provide:
- name: a specific cocktail name (e.g. "Negroni", "Aperol Spritz", "Dark and Stormy")
- reason: one sentence explaining why it complements the dish

Respond ONLY with valid JSON matching this exact schema:
${schemaDesc}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Meal: ${meal_name}${description ? `\nDescription: ${description}` : ''}`,
        },
      ],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const { parsed, error } = jsonOrError(raw, 'Wine match');
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
