const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Corrected & Active Google Gemini Model Identifiers
const MODEL_CHAIN = (process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : []
).concat(['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro']);

const SYSTEM_PROMPT = `You are a smart, friendly, and helpful Voice AI Assistant embedded on a company website. You answer visitor questions, navigate the site, and perform actions like adding products to the cart, checking out, and filling forms — all from voice commands.

KEY RESPONSIBILITIES

1. Website knowledge and guidance
   - Answer using ONLY the page content and link list provided in the context. Never invent products, prices, or policies.
   - If the answer is not in the context, say so briefly and offer to open a page that likely has it.

2. Website navigation
   - When the user asks to visit or open a page, set action to "navigate_to_page" and put the matching path in "url".
   - Pick the url from the AVAILABLE LINKS list. Never guess a path that is not in that list.

3. E-commerce actions
   - To add an item to the cart, set action to "add_to_cart", put the product name in "product" and the count in "quantity" (default 1).
   - To check out, set action to "proceed_to_checkout".

4. Form automation
   - Collect form details one field at a time. Ask for the next field in your reply.
   - As each detail arrives, set action to "fill_form_field" with "field" (name, email, phone, subject, or message) and "value".
   - Once every field is collected and the user confirms, set action to "submit_contact_form".

BEHAVIOR RULES
- Tone: professional, enthusiastic, clear, helpful.
- Speech style: 1-2 short sentences. This is read aloud, so no lists, no markdown, no URLs spoken out.
- Confirmation: always say what you are doing, e.g. "Sure, opening the About Us page now!"
- One action per reply. If nothing needs doing, action is "none".
- Reply in the same language the user speaks.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING', description: 'Short spoken answer, 1-2 sentences.' },
    action: {
      type: 'STRING',
      enum: [
        'none',
        'navigate_to_page',
        'add_to_cart',
        'proceed_to_checkout',
        'fill_form_field',
        'submit_contact_form',
      ],
    },
    url: { type: 'STRING', description: 'Relative path for navigate_to_page.' },
    product: { type: 'STRING', description: 'Product name for add_to_cart.' },
    quantity: { type: 'NUMBER', description: 'Quantity for add_to_cart.' },
    field: { type: 'STRING', description: 'Field key for fill_form_field.' },
    value: { type: 'STRING', description: 'Field value for fill_form_field.' },
  },
  required: ['reply', 'action'],
};

async function callGemini(apiKey, payload) {
  let lastError = 'No model responded.';

  for (const model of MODEL_CHAIN) {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      lastError = `Network error: ${netErr.message}`;
      continue;
    }

    const data = await response.json();

    if (data.error) {
      lastError = `${model}: ${data.error.message}`;
      if (response.status === 404) continue;
      return { error: lastError };
    }

    return { data, model };
  }

  return { error: lastError };
}

app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        reply: 'The assistant is not configured yet. Please add the API key.',
        action: 'none',
        debug: 'GEMINI_API_KEY missing in Vercel environment variables.',
      });
    }

    const { message, currentUrl, pageText, links = [], history = [] } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ reply: 'I did not catch that.', action: 'none' });
    }

    const cleanContext = String(pageText || 'No page content provided.')
      .replace(/\s+/g, ' ')
      .slice(0, 8000);

    const linkList = Array.isArray(links)
      ? links.slice(0, 40).map((l) => `- "${l.text}" -> ${l.href}`).join('\n')
      : '';

    const contextBlock = `CURRENT PAGE: ${currentUrl || 'unknown'}

AVAILABLE LINKS ON THIS SITE:
${linkList || '- (none detected)'}

PAGE CONTENT:
"""
${cleanContext}
"""

USER SAID: "${message}"`;

    const contents = [];
    for (const turn of history.slice(-12)) {
      if (!turn || !turn.text) continue;
      contents.push({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(turn.text).slice(0, 2000) }],
      });
    }
    contents.push({ role: 'user', parts: [{ text: contextBlock }] });

    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    const result = await callGemini(apiKey, payload);

    if (result.error) {
      console.error('Gemini error:', result.error);
      return res.status(200).json({
        reply: 'I am having trouble reaching my brain right now. Please try again.',
        action: 'none',
        debug: result.error,
      });
    }

    const rawOutput =
      result.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    let parsed;
    try {
      parsed = JSON.parse(rawOutput.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (e) {
      parsed = { reply: rawOutput.slice(0, 300) || 'Sorry, I did not understand.', action: 'none' };
    }

    if (!parsed.action) parsed.action = 'none';
    parsed.model = result.model;

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Backend crash:', err);
    return res.status(200).json({
      reply: 'Something went wrong on my end. Please try again.',
      action: 'none',
      debug: err.message,
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    modelChain: MODEL_CHAIN,
    time: new Date().toISOString(),
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;