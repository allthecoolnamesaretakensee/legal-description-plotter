import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image_data, image_type } = req.body;

  if (!image_data) {
    return res.status(400).json({ error: 'No image data provided' });
  }

  try {
    const client = new Anthropic();

    // Determine media type
    let mediaType = 'image/jpeg';
    if (image_type) {
      if (image_type.includes('png')) mediaType = 'image/png';
      else if (image_type.includes('gif')) mediaType = 'image/gif';
      else if (image_type.includes('webp')) mediaType = 'image/webp';
      else if (image_type.includes('pdf')) mediaType = 'application/pdf';
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: image_data,
              },
            },
            {
              type: 'text',
              text: `Extract ALL text from this image of a legal description. 

IMPORTANT INSTRUCTIONS:
1. Extract the text EXACTLY as written, preserving:
   - All bearings (N, S, E, W with degrees, minutes, seconds)
   - All distances (in feet, chains, varas, etc.)
   - All curve data (radius, arc length, chord bearing, central angle)
   - All monument references
   - All lot/block/section references

2. Fix obvious OCR errors you can see:
   - Broken characters (like "ﬁ" should be "fi")
   - Degree symbols that look like "0" or "o" should be "°"
   - Apostrophes for minutes and quotes for seconds

3. Format the output as clean, readable text with:
   - One sentence per line where natural breaks occur
   - Preserve paragraph breaks

4. DO NOT:
   - Add any commentary or explanations
   - Change any numbers or bearings
   - Skip any text

Just return the extracted text, nothing else.`
            },
          ],
        },
      ],
    });

    const extractedText = message.content[0].text;

    res.status(200).json({
      success: true,
      text: extractedText,
    });

  } catch (error) {
    console.error('OCR error:', error);
    res.status(500).json({ 
      error: 'Failed to extract text', 
      details: error.message 
    });
  }
}
