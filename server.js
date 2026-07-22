const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Multi-Model Fallback Helper
async function generateWithFallback(prompt) {
    // List of model names to try sequentially
    const modelsToTry = [
        "gemini-1.5-flash",
        "gemini-2.0-flash-exp",
        "gemini-1.5-pro",
        "gemini-1.0-pro"
    ];

    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            console.error(`Model ${modelName} failed:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error("All Gemini models failed.");
}

app.post('/api/chat', async (req, res) => {
    try {
        if (!genAI) {
            return res.json({ 
                reply: "Vercel par GEMINI_API_KEY missing hai. System Settings check karein.", 
                action: "none" 
            });
        }

        const { message, currentUrl, pageText } = req.body;

        // Limiting text to avoid token overflows
        const cleanContext = (pageText || "No page content").replace(/\s+/g, ' ').slice(0, 6000);

        const prompt = `
You are a helpful Voice AI Assistant for the website at: ${currentUrl}

Website Context:
"${cleanContext}"

User Question: "${message}"

INSTRUCTIONS:
1. Answer the user's question accurately using ONLY the Website Context above.
2. Keep the answer concise (1-2 short sentences) for speech synthesis.
3. If user asks to navigate to a page (e.g. About, Contact), return action "navigate" with the relative URL path.
4. Output MUST be valid RAW JSON only. No markdown formatting.

Format:
{
  "reply": "Your concise response here.",
  "action": "navigate" OR "none",
  "url": "/page-link" OR null
}
`;

        const rawOutput = await generateWithFallback(prompt);
        
        // Clean markdown backticks
        const cleanedText = rawOutput.replace(/```json/gi, '').replace(/```/gi, '').trim();

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(cleanedText);
        } catch (pErr) {
            jsonResponse = {
                reply: cleanedText.replace(/[{}]/g, '').slice(0, 200),
                action: "none"
            };
        }

        return res.json(jsonResponse);

    } catch (err) {
        console.error("Final Processing Error:", err.message);
        return res.json({ 
            reply: "Main abhi is page ka response process nahi kar pa raha. Kripya thodi der baad try karein.", 
            action: "none" 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));