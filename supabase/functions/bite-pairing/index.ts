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
    const rawBody = await req.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Request body is empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { cocktail_name, description } = JSON.parse(rawBody);

    if (!cocktail_name) {
      return new Response(JSON.stringify({ error: 'cocktail_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `You are a cocktail and food pairing expert for EatWell. Given a cocktail name and optional description, suggest exactly 2–3 small bite pairings that complement the drink.

Format your response as 2–3 short lines, each structured as:
**Bite name** — one sentence explaining why it works.

Example:
**Salted almonds** — the salt amplifies the botanicals. **Marinated olives** — briny contrast to citrus notes. **Parmesan crisps** — richness balances the spirit.

Keep each line concise. No intro text, no numbered lists, no headings — just the formatted pairings.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Cocktail: ${cocktail_name}${description ? `\nDescription: ${description}` : ''}`,
        },
      ],
    });

    const text = (response.content[0] as { type: string; text: string }).text.trim();

    return new Response(JSON.stringify({ bite_pairing: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
