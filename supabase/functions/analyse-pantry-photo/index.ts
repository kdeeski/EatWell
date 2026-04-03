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

    // Expect { images: string[] } where each string is a base64 data URI
    // e.g. "data:image/jpeg;base64,/9j/4AAQ..."
    const { images } = await req.json() as { images: string[] };

    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No images provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the image content blocks
    const imageBlocks: Anthropic.ImageBlockParam[] = images.map((dataUri) => {
      const [header, data] = dataUri.split(',');
      const mediaType = (header.match(/data:(.*);base64/) ?? [])[1] as
        | 'image/jpeg'
        | 'image/png'
        | 'image/gif'
        | 'image/webp';
      return {
        type: 'image',
        source: { type: 'base64', media_type: mediaType ?? 'image/jpeg', data },
      };
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `You are analysing photos of a home pantry, spice rack, or kitchen shelves for a cooking app.
Your job is to identify every labelled item you can read in the photo.

For each item, return:
- name: the item name, lowercase, singular (e.g. "cumin", "olive oil", "soy sauce", "arborio rice")
- category: one of herbs_spices | oils_vinegars | cans_preserves | pantry_dry_goods | condiments_sauces | bread_bakery | meat_fish | produce | dairy_eggs | beverages | alcohol | household
- notes: optional short note if relevant (e.g. "almost empty", "two jars"), otherwise null

Category guide:
- herbs_spices: dried spices, dried herbs, spice blends, seasoning mixes, baking spices (cinnamon, vanilla, etc.)
- oils_vinegars: cooking oils, olive oils, vinegars
- cans_preserves: canned tomatoes, beans, tinned fish, jars of paste, jarred sauces, preserved foods
- pantry_dry_goods: pasta, rice, lentils, flour, oats, cereals, nuts, seeds, sugar, baking powder, baking soda, yeast, cocoa, chocolate
- condiments_sauces: sauces, mustards, hot sauces, mayonnaise, miso, fish sauce, soy sauce
- bread_bakery: bread, crackers, crispbread, wraps, tortillas
- meat_fish: tinned fish not in a sauce (e.g. canned tuna, sardines)
- produce: dried fruit, dried mushrooms, anything plant-based not fitting above
- dairy_eggs: anything dairy or egg based

Respond ONLY with valid JSON: { "items": [ { "name": "...", "category": "...", "notes": null } ] }

Only include items you can actually read from the label. Do not guess at blurry or obscured labels.`,
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text: 'Please identify all labelled pantry items you can read in these photos.',
            },
          ],
        },
      ],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed: { items: { name: string; category: string; notes: string | null }[] };
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
