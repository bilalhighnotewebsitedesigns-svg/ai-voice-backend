const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// API Key Render ke Environment Variables se aaye gi
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractPageText(url) {
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        $('script, style, nav, footer, iframe').remove();
        return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 7000);
    } catch (error) {
        return "Content could not be extracted automatically.";
    }
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message, currentUrl } = req.body;
        const pageContent = await extractPageText(currentUrl);

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        You are a voice assistant operating on the website page: ${currentUrl}.
        Page Content: ${pageContent}

        User Question: ${message}

        Respond STRICTLY in JSON format with two keys:
        1. "reply": A short, conversational response for the user (1-2 sentences).
        2. "action": "navigate" (if user wants to go to another page like /about, /contact) or "none".
        3. "url": The relative URL path to open if action is "navigate", otherwise null.
        `;

        const result = await model.generateContent(prompt);
        res.json(JSON.parse(result.response.text()));
    } catch (err) {
        res.status(500).json({ reply: "Error processing request", action: "none" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));