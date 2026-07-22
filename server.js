const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(cors());
app.use(express.json());

// Check if API key exists
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Safe Scraping
async function extractPageText(url) {
    try {
        const { data } = await axios.get(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            },
            timeout: 5000 
        });
        const $ = cheerio.load(data);
        $('script, style, iframe, svg, noscript').remove();
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        return text.length > 0 ? text.slice(0, 5000) : "General Salvador project testing page.";
    } catch (error) {
        console.error("Scraping fallback triggered:", error.message);
        return "This is the Salvador testing website page.";
    }
}

app.post('/api/chat', async (req, res) => {
    try {
        if (!genAI) {
            return res.status(500).json({ reply: "API Key is missing in Vercel settings.", action: "none" });
        }

        const { message, currentUrl } = req.body;
        const pageContent = await extractPageText(currentUrl || "");

        // Try gemini-1.5-flash or fallback
        let model;
        try {
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        } catch (e) {
            model = genAI.getGenerativeModel({ model: "gemini-pro" });
        }

        const prompt = `
You are an AI Voice Assistant for the website at ${currentUrl}.
Page text content: "${pageContent}"

User asked: "${message}"

Respond strictly in JSON format without markdown ticks:
{
  "reply": "Your short 1-2 sentence answer based on website content.",
  "action": "navigate" OR "none",
  "url": "/page-path" OR null
}
`;

        const result = await model.generateContent(prompt);
        let rawText = result.response.text().trim();
        
        // Remove markdown formatting if generated
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
        console.error("Backend Error Details:", err.message);
        return res.json({ 
            reply: "I am having trouble reading this page details right now, but feel free to ask another question!", 
            action: "none" 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));