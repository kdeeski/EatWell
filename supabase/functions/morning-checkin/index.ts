// Supabase Edge Function — morning-checkin
// Generates the two-part 7am notification messages:
//   Part 1: Last night debrief
//   Part 2: Tonight's options

import Anthropic from 'npm:@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const SYSTEM_PROMPT = `You are EatWell — a thoughtful, friendly home cooking assistant.
You write short, warm, conversational messages for a 7am push notification.
Keep messages concise — this is the first-coffee moment of the day.
Sound like a helpful flatmate who's already looked in the fridge, not a corporate app.
Never use emoji. No lists or bullet points — natural sentences only.
Respond ONLY with valid JSON, no prose outside it.`;

Deno.serve(async (req) => {
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
  "fridge_note": "I think you've still got some parsley and a bit of pork belly — does that sound right? Anything extra I don't know about?" or null
}

The debrief_prompt should feel natural and not robotic.
The tonight_prompt should briefly name the options in a warm way.
The fridge_note (if relevant) should only appear at the start of the weekly planning flow, not daily — set it to null for daily check-ins.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text;
  const json = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  return new Response(json, {
    headers: { 'Content-Type': 'application/json' },
  });
});
