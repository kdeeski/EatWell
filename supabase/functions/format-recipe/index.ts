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

    const rawBody = await req.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Request body is empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { text } = JSON.parse(rawBody);
    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const client = new Anthropic({ apiKey });

    const systemPrompt = `You are a recipe formatter. Extract and structure recipe information from any pasted text — cookbook pages, website text, handwritten notes, whatever the user provides.

Return ONLY a JSON object with exactly these fields, nothing else:
{
  "name": "Recipe Name in Title Case",
  "category": "mains | sauces_dressings | sides | desserts | baking | marinades_rubs | glossary | cocktails",
  "description": "One sentence describing the dish and what makes it good.",
  "ingredients": "150g Chicken Thighs\\n2 cloves Garlic\\n1 tsp Smoked Paprika",
  "method": "1. First step.\\n2. Second step.\\n3. Third step."
}

Rules:
- ingredients: one ingredient per line, quantity + unit + ingredient name
- method: numbered steps, one per line
- category: pick the closest match from the allowed values; default to "mains" if unclear
- description: write a concise, appealing one-sentence summary if none is provided
- Return only the JSON object — no markdown fences, no explanation, no surrounding text`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: text.trim() },
      ],
    });

    const raw = (response.content[0] as { type: string; text: string }).text.trim();

    // Extract JSON object from response
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Claude did not return a valid JSON object' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = JSON.parse(match[0]);

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
