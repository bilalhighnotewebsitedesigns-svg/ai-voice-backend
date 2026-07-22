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
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        reply: 'GROQ_API_KEY is missing in Vercel environment variables.',
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: promptText }],
        response_format: { type: 'json_object' }
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Groq API Error:', data.error);
      return res.status(200).json({
        reply: `API Error: ${data.error.message}`,
        action: 'none'
      });
    }

    const rawOutput = data.choices?.[0]?.message?.content?.trim() || '';

    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (e) {
      parsed = { reply: rawOutput.slice(0, 200) || 'I am ready to help!', action: 'none' };
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Backend crash:', err);
    return res.status(200).json({
      reply: `Server Exception: ${err.message}`,
      action: 'none'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: Boolean(process.env.GROQ_API_KEY),
    time: new Date().toISOString(),
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;