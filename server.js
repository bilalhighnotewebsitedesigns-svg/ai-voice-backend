const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Smart Prompt for Navigation, Form Filling, and Multi-language Support
const SYSTEM_PROMPT = `You are an interactive, smart Voice AI Assistant embedded on a website.
Your job is to answer questions, navigate pages, fill forms, and trigger actions based on user spoken commands.

PAGE NAVIGATION & LINK MATCHING:
- If the user says "go to about page", "about us kholo", "take me to contact", "contact page par jao", etc., check the provided "AVAILABLE LINKS ON PAGE" array or "PAGE CONTENT".
- Match the intended target page URL and return action: "navigate_to_page" with the exact "url" path (e.g. "/about", "/about-us", "/contact", "/checkout").

FORM FILLING & FIELD DETECTING:
- If the user asks to fill a form field (e.g., "my name is Ali", "mera email test@gmail.com hai", "fill contact form with..."):
  - Return action: "fill_form_field" with "field" name (e.g. "name", "email", "phone", "message") and "value".
- If user says "submit form", "form submit kar do", or "send message":
  - Return action: "submit_contact_form".

AVAILABLE ACTIONS:
1. {"reply": "Navigating to About page...", "action": "navigate_to_page", "url": "/about"}
2. {"reply": "Filling your email address.", "action": "fill_form_field", "field": "email", "value": "user@example.com"}
3. {"reply": "Submitting the form now.", "action": "submit_contact_form"}
4. {"reply": "Adding product to cart.", "action": "add_to_cart", "product": "blue mug", "quantity": 1}
5. {"reply": "Your short message reply here", "action": "none"}

RULES:
- Language Matching: ALWAYS reply strictly in the EXACT SAME LANGUAGE and SCRIPT as the user's input message (e.g. Roman Urdu -> Roman Urdu, English -> English, Urdu -> Urdu).
- Keep "reply" very short (1-2 sentences max) as it will be spoken out loud. No markdown, no bullet points.
- ALWAYS return response strictly in valid JSON format.`;

app.post('/api/chat', async (req, res) => {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    const elevenApiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'eXpIbVcVbLo8ZJQDlDnl';

    if (!groqApiKey) {
      return res.status(200).json({
        reply: 'GROQ_API_KEY is missing in environment variables.',
        action: 'none'
      });
    }

    const { message, currentUrl, pageText, links } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ reply: 'I did not catch that.', action: 'none' });
    }

    const cleanContext = String(pageText || 'No page content provided.')
      .replace(/\s+/g, ' ')
      .slice(0, 4000);

    const linksList = JSON.stringify(links || []);

    const promptText = `${SYSTEM_PROMPT}\n\nCURRENT PAGE: ${currentUrl}\nAVAILABLE LINKS ON PAGE: ${linksList}\nPAGE CONTENT: ${cleanContext}\n\nUSER SAID: "${message}"`;

    // 1. Fetch AI Response & Action Decision from Groq AI
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: promptText }],
        response_format: { type: 'json_object' }
      }),
    });

    const data = await groqResponse.json();

    if (data.error) {
      console.error('Groq API Error:', data.error);
      return res.status(200).json({ reply: `API Error: ${data.error.message}`, action: 'none' });
    }

    const rawOutput = data.choices?.[0]?.message?.content?.trim() || '';

    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (e) {
      parsed = { reply: rawOutput.slice(0, 200) || 'I am ready to help!', action: 'none' };
    }

    let audioBase64 = null;

    // 2. Fetch HD Real Human Voice from ElevenLabs API
    if (elevenApiKey && parsed.reply) {
      try {
        const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': elevenApiKey
          },
          body: JSON.stringify({
            text: parsed.reply,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        });

        if (elevenRes.ok) {
          const audioBuffer = await elevenRes.arrayBuffer();
          audioBase64 = Buffer.from(audioBuffer).toString('base64');
        } else {
          const errText = await elevenRes.text();
          console.error('ElevenLabs Error Response:', errText);
        }
      } catch (err) {
        console.error('ElevenLabs Exception:', err);
      }
    }

    return res.status(200).json({
      reply: parsed.reply,
      action: parsed.action || 'none',
      url: parsed.url || null,
      field: parsed.field || null,
      value: parsed.value || null,
      product: parsed.product || null,
      quantity: parsed.quantity || 1,
      audio: audioBase64
    });

  } catch (err) {
    console.error('Backend crash:', err);
    return res.status(200).json({ reply: `Server Exception: ${err.message}`, action: 'none' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    groqKeyConfigured: Boolean(process.env.GROQ_API_KEY),
    elevenLabsKeyConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    time: new Date().toISOString(),
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;