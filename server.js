const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are a smart, friendly, and helpful Voice AI Assistant embedded on a company website. You answer visitor questions, navigate the site, and perform actions like adding products to the cart, checking out, and filling forms — all from voice commands.

KEY RESPONSIBILITIES
1. Website knowledge and guidance: Answer using ONLY the page content provided. Never invent facts.
2. Navigation: Suggest relative links from provided list.
3. Keep replies very brief (1-2 sentences max), as this is read aloud. No markdown, no bullet lists.

Return your response strictly in valid JSON format:
{
  "reply": "Your short spoken response here",
  "action": "none" // options: none, navigate_to_page, add_to_cart, proceed_to_checkout, fill_form_field, submit_contact_form
}`;

app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        reply: 'The assistant is not configured yet. Please add the API key.',
        action: 'none'
      });
    }

    const { message, currentUrl, pageText, links = [] } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ reply: 'I did not catch that.', action: 'none' });
    }

    const cleanContext = String(pageText || 'No page content provided.')
      .replace(/\s+/g, ' ')
      .slice(0, 4000);

    const promptText = `${SYSTEM_PROMPT}\n\nCURRENT PAGE: ${currentUrl}\nPAGE CONTENT: ${cleanContext}\n\nUSER SAID: "${message}"`;

    // Direct fetch using official gemini-1.5-flash / gemini-2.0-flash endpoint
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Gemini API Error:', data.error);
      return res.status(200).json({
        reply: `API Error: ${data.error.message}`,
        action: 'none'
      });
    }

    const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    let parsed;
    try {
      const cleanJson = rawOutput.replace(/^```json/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(cleanJson);
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
    apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;