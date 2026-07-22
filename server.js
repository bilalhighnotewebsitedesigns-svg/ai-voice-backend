const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/chat', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            return res.json({ 
                reply: "Vercel settings mein GEMINI_API_KEY missing hai.", 
                action: "none" 
            });
        }

        const { message, currentUrl, pageText } = req.body;
        const cleanContext = (pageText || "No context provided").replace(/\s+/g, ' ').slice(0, 6000);

        const promptText = `
You are a helpful Voice AI Assistant for the website at: ${currentUrl}

Website Content Context:
"${cleanContext}"

User Question: "${message}"

INSTRUCTIONS:
1. Answer the user's question accurately using ONLY the Website Content above.
2. Keep the answer short and conversational (1-2 sentences).
3. If user asks to navigate to a page (e.g., About Us, Contact), return action as "navigate" with relative URL path.
4. Output MUST be valid raw JSON only. Do not add markdown backticks like \`\`\`json.

JSON Format:
{
  "reply": "Your short answer here.",
  "action": "navigate" OR "none",
  "url": "/page-link" OR null
}
`;

        // Direct Fetch Call to Google Gemini REST API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: promptText }]
                }]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("Gemini API Direct Error:", data.error);
            return res.json({
                reply: "API Connection issue: " + (data.error.message || "Error reaching AI service."),
                action: "none"
            });
        }

        // Extracting Text Output
        let rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        // Clean markdown backticks if any
        rawOutput = rawOutput.replace(/```json/gi, '').replace(/```/gi, '').trim();

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(rawOutput);
        } catch (parseError) {
            jsonResponse = {
                reply: rawOutput.replace(/[{}]/g, '').slice(0, 200),
                action: "none"
            };
        }

        return res.json(jsonResponse);

    } catch (err) {
        console.error("Backend Crash Error:", err.message);
        return res.json({ 
            reply: "Request fail ho gayi. Kripya dobara try karein.", 
            action: "none" 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));