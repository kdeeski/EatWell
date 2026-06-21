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
    const { plant_name } = await req.json();
    if (!plant_name) {
      return new Response(JSON.stringify({ error: 'plant_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const MONTH_NAMES = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const now = new Date();
    const monthName = MONTH_NAMES[now.getMonth() + 1];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `You suggest garden plant varieties for a home gardener in Canterbury, New Zealand (Southern Hemisphere, ~43.5°S). Given a plant name and the current month, return 4-6 varieties that grow well in Canterbury's climate and are commonly available in New Zealand — whether as seedlings from garden centres or seeds from suppliers. Be seasonally honest: if a plant is out of season and seedlings/seeds won't be available right now, say so. Respond ONLY with valid JSON: {"varieties": ["Variety 1", ...], "note": "optional short note about availability or timing"}. Omit "note" if the plant is in season.`,
      messages: [{ role: 'user', content: `Suggest varieties for: ${plant_name} (current month: ${monthName})` }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

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
