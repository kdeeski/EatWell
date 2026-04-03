import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `You are helping categorise grocery and pantry items for a home cooking app.

Given a list of item names, return a JSON array where each item has:
- name: the item name as given (lowercase, singular)
- category: exactly one of: meat_fish | dairy_eggs | produce | bread_bakery | pantry_dry_goods | herbs_spices | cans_preserves | oils_vinegars | condiments_sauces | beverages | alcohol | household
- location: exactly one of: fridge | freezer | pantry | garden

Category rules:
- meat_fish: fresh/frozen meat, poultry, seafood, fish
- dairy_eggs: milk, cheese, yoghurt, butter, cream, eggs
- produce: fresh fruit and vegetables, fresh herbs
- bread_bakery: bread, rolls, crackers, wraps, tortillas, crispbread
- pantry_dry_goods: pasta, rice, grains, lentils, flour, oats, cereals, nuts, seeds, sugar, baking powder, baking soda, yeast, cocoa, chocolate, dried beans
- herbs_spices: dried spices, dried herbs, spice blends, seasoning mixes
- cans_preserves: ALL canned or tinned items (canned tomatoes, canned beans, canned fish, canned meat, tinned anything), jarred sauces, jarred pastes, jams, pickles, preserved foods
- oils_vinegars: cooking oils, olive oils, vinegars, sesame oil
- condiments_sauces: sauces, mustards, hot sauces, mayonnaise, miso, fish sauce, soy sauce, worcestershire, ketchup, relish
- beverages: juice, soft drinks, sparkling water, cordial, coffee, tea, mixers
- alcohol: wine, beer, spirits, liqueur, cider, vermouth, port, sherry, sake, mirin (alcoholic cooking wines), fortified wines
- household: cleaning products, laundry liquid, dishwasher tablets, soap, shampoo, toilet paper, tissues, batteries, bin bags

Location rules (sensible defaults):
- fridge: meat_fish, dairy_eggs, produce, opened condiments_sauces
- pantry: everything else by default
- freezer: only if item name explicitly suggests frozen

Respond ONLY with valid JSON array: [{ "name": "...", "category": "...", "location": "..." }, ...]`;

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

    const { items } = await req.json() as { items: string[] };
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No items provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: items.join('\n') }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed: { name: string; category: string; location: string }[];
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: `Could not parse response: ${cleaned.slice(0, 200)}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
