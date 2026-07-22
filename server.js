const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Web Scraping with Error Handling & Timeout
async function extractPageText(url) {
    try {
        const { data } = await axios.get(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            },
            timeout: 8000 // 8 seconds timeout
        });
        const $ = cheerio.load(data);
        
        $('script, style, iframe, svg, noscript').remove();
        
        const extractedText = $('body').text().replace(/\s+/g, ' ').trim();
        return extractedText.length > 0 ? extractedText.slice(0, 6000) : "No text content found on this page.";
    } catch (error) {
        console.error("Scraping error:", error.message);
        return "Could not fetch live page content automatically.";
    }
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message, currentUrl } = req.body;

        if (!message) {
            return res.status(400).json({ reply: "Please ask a valid question.", action: "none" });
        }

        // Live content extract karna
        const pageContent = await extractPageText(currentUrl);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
You are a helpful AI Voice Assistant on the website page: ${currentUrl}

Page Text Content:
"${pageContent}"

User Query: "${message}"

INSTRUCTIONS:
1. Answer the user's query accurately based on the page content provided above.
2. If the query asks to navigate to another page (e.g., About, Contact, Services), provide the route/url.
3. Keep the "reply" short (1-2 sentences) so it sounds natural when spoken aloud.
4. Respond ONLY with a valid raw JSON object (NO markdown ticks, NO \`\`\`json wrappers).

JSON Structure:
{
  "reply": "Your concise response here.",
  "action": "navigate" OR "none",
  "url": "/page-link" OR null
}
`;

        const result = await model.generateContent(prompt);
        let rawText = result.response.text().trim();

        // Clean markdown backticks if present
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(rawText);
        } catch (parseErr) {
            console.error("JSON Parsing failed. Raw AI output:", rawText);
            jsonResponse = {
                reply: rawText.replace(/["{}]/g, '').slice(0, 150),
                action: "none"
            };
        }

        return res.json(jsonResponse);

    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ reply: "Sorry, I had trouble processing that request.", action: "none" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));