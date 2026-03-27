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
    const context = await req.json();

    const userMessage = `
Generate the two morning check-in messages given this context:

LAST NIGHT'S PLANNED MEAL: ${context.plannedMealLastNight?.meal_name ?? 'nothing planned (maybe they ate out)'}

TONIGHT'S OPTIONS (up to 3):
${(context.tonightOptions ?? []).map((m: any, i: number) => `${i + 1}. ${m.meal_name} — ${m.description}`).join('\n')}

FRIDGE NOTE: ${context.fridgeSummary || 'no particular fridge notes'}
HOLLY ENABLED: ${context.hollyEnabled}

Return JSON with this shape:
{
  "debrief_prompt": "What did you end up cooking last night?",
  "tonight_prompt": "Here are your options for tonight — what do you feel like?",
  "fridge_note": null
}

The debrief_prompt should feel natural and not robotic.
The tonight_prompt should briefly name the options in a warm way.
The fridge_note should be null for daily check-ins.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: `You are EatWell — a warm, concise home cooking assistant writing a 7am push notification.
Sound like a helpful flatmate, not a corporate app. Never use emoji. Natural sentences only.
Respond ONLY with valid JSON.`,
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
