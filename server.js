const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Large page text support

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

app.post('/api/chat', async (req, res) => {
    try {
        if (!genAI) {
            return res.status(500).json({ reply: "API Key Vercel settings mein missing hai.", action: "none" });
        }

        const { message, currentUrl, pageText } = req.body;

        // Clean page text to keep under context limit
        const cleanContext = (pageText || "No context provided").replace(/\s+/g, ' ').slice(0, 8000);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
You are a helpful Voice AI Assistant for the website at: ${currentUrl}

Website Content:
"${cleanContext}"

User Question: "${message}"

INSTRUCTIONS:
1. Answer the user's question accurately using ONLY the Website Content above.
2. Keep the answer concise (1-2 short sentences) so it sounds natural when spoken aloud.
3. If the user asks to open/visit a page (e.g., About Us, Contact, Portfolio), return action as "navigate" with the relative URL.
4. Respond STRICTLY in raw JSON without any markdown formatting or code blocks.

JSON Output Format:
{
  "reply": "Your short answer here.",
  "action": "navigate" OR "none",
  "url": "/page-link" OR null
}
`;

        const result = await model.generateContent(prompt);
        let rawText = result.response.text().trim();

        // Clean markdown backticks if Gemini adds them
        rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(rawText);
        } catch (pErr) {
            jsonResponse = {
                reply: rawText.replace(/[{}]/g, '').slice(0, 150),
                action: "none"
            };
        }

        return res.json(jsonResponse);

    } catch (err) {
        console.error("Backend Error:", err);
        return res.status(500).json({ 
            reply: "Main is waqt is page ki details parh nahi pa raha, aap dobara poochain.", 
            action: "none" 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));