import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cheerio from "cheerio";

dotenv.config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    "https://ghostnet-pro.web.app",
    "https://ghostnet-pro.firebaseapp.com"
  ]
}));

app.use(express.json({ limit: "1mb" }));

/* ================= ENV ================= */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
console.log("🔑 GEMINI_API_KEY loaded:", !!GEMINI_API_KEY);

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.json({ status: "GhostNet backend alive 🚀" });
});

/* ================= HELPERS ================= */
function extractURL(text) {
  const match = text.match(/https?:\/\/[^\s"]+/i);
  return match ? match[0] : null;
}

async function extractWebsiteContent(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 GhostNet-Scanner" },
    signal: controller.signal
  });

  clearTimeout(timeout);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error("URL does not return HTML");
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();

  const visibleText = $("body")
    .clone()
    .find("script, style, noscript")
    .remove()
    .end()
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  return {
    title,
    visibleText,
    forms: $("form").length,
    passwordFields: $("input[type='password']").length
  };
}

/* ================= ANALYZE ================= */
app.post("/analyze", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt missing" });
  }

  try {
    const url = extractURL(prompt);
    let site = null;

    if (url) {
      site = await extractWebsiteContent(url);
    }

    let finalPrompt = `
You are a cybersecurity fraud detection expert.

Analyze the FULL MESSAGE below.
If a website is present, ALSO analyze the website content.

IMPORTANT RULES:
- Do NOT mark a website as scam only because it uses Firebase, Vercel, or Netlify
- Judge intent using urgency, impersonation, credential requests, threats
- Informational, portfolio, demo, or personal sites should be SAFE
- Website analysis should SUPPORT message analysis, not override it

FULL MESSAGE:
"${prompt}"
`;

    if (site) {
      finalPrompt += `

WEBSITE CONTENT ANALYSIS:

Website URL: ${url}
Title: "${site.title}"

Indicators:
- Forms present: ${site.forms}
- Password fields: ${site.passwordFields}

Visible text excerpt:
"${site.visibleText}"

SAFE INDICATORS:
- No OTP/password/payment requests
- No impersonation of banks/government
- No urgent threats or account suspension warnings
- Educational, portfolio, or demo content

If website is informational or harmless, probability MUST be below 30.
`;
    }

    finalPrompt += `

Return ONLY valid minified JSON:
{
  "probability": number,
  "type": "OTP Scam | UPI Scam | Job Scam | Lottery Scam | Phishing | Safe | Other",
  "explanation": "clear explanation combining message + website",
  "detectedLanguage": "language name"
}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: finalPrompt }] }]
        })
      }
    );

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error("❌ Analysis failed:", err.message);
    res.status(500).json({ error: "AI request failed" });
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
