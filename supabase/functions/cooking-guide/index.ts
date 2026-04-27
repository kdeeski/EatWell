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
    const { meal_name, description, existing_names } = input;

    if (!meal_name) {
      return new Response(JSON.stringify({ error: 'meal_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingBlock = existing_names?.length
      ? `\nThe user already has these in their recipe stash: ${existing_names.join(', ')}. If you would identify one of these as a component, still include it but return steps: [] — the app will display the saved version from the stash.`
      : '';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `You are a culinary guide for EatWell. Given a meal name and description:
1. List the ingredients needed (quantities + units where helpful, e.g. "300g chicken thighs", "2 cloves garlic")
2. Return 6-8 clear cooking steps for the dish
3. Identify any sub-recipes or components mentioned (dukkah, harissa, beurre blanc, curry paste, etc) and return a name, 1-sentence description, 3-5 steps to make each, and the best category for saving it. Categories: mains, sauces_dressings, sides, desserts, baking, marinades_rubs. Examples: harissa → marinades_rubs, tomato sauce → sauces_dressings, dukkah → marinades_rubs, roasted veg → sides, pastry → baking.
4. Identify any technique terms (braise, compote, render, fold, julienne, etc) and define them in plain English (1-2 sentences, no jargon in the definition)
If nothing special return empty arrays for components and glossary.${existingBlock}
Respond ONLY with valid JSON matching this exact schema:
{
  "ingredients": ["string"],
  "steps": ["string"],
  "components": [{"name": "string", "description": "string", "steps": ["string"], "category": "string"}],
  "glossary": [{"term": "string", "definition": "string"}]
}`,
      messages: [
        {
          role: 'user',
          content: `Meal name: ${meal_name}\nDescription: ${description ?? ''}`,
        },
      ],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const { parsed, error } = jsonOrError(raw, 'Cooking guide');
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
