const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are a smart, friendly, and helpful Voice AI Assistant embedded on a company website. You answer visitor questions, navigate the site, and perform actions like adding products to the cart, checking out, and filling forms — all from voice commands.

KEY RESPONSIBILITIES
1. Website knowledge and guidance: Answer using ONLY the page content provided.
2. Language Matching: ALWAYS reply strictly in the EXACT SAME LANGUAGE and SCRIPT as the user's input message (e.g., if asked in Roman Urdu, answer in Roman Urdu; if Urdu script, answer in Urdu script; if Spanish, answer in Spanish).
3. Keep replies very brief (1-2 sentences max), as this is read aloud. No markdown, no bullet lists.

Return your response strictly in valid JSON format:
{
  "reply": "Your short spoken response here in the user's language",
  "action": "none"
}`;

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

    const { message, currentUrl, pageText } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ reply: 'I did not catch that.', action: 'none' });
    }

    const cleanContext = String(pageText || 'No page content provided.')
      .replace(/\s+/g, ' ')
      .slice(0, 4000);

    const promptText = `${SYSTEM_PROMPT}\n\nCURRENT PAGE: ${currentUrl}\nPAGE CONTENT: ${cleanContext}\n\nUSER SAID: "${message}"`;

    // 1. Fetch AI Text Response from Groq
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

    // 2. Fetch Human Voice Audio from ElevenLabs API
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
            model_id: 'eleven_multilingual_v2', // Supports English, Urdu, Hindi, Spanish, etc.
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