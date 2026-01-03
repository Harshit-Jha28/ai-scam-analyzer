import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cheerio from "cheerio";


dotenv.config();

const app = express();

app.use(cors({
  origin: [
    "https://ghostnet-pro.web.app",
    "https://ghostnet-pro.firebaseapp.com"
  ]
}));


app.use(express.json({ limit: "1mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
console.log("GEMINI_API_KEY loaded:", !!GEMINI_API_KEY);


app.get("/", (req, res) => {
  res.json({ status: "GhostNet backend alive" });
});
function isURL(text) {
  return /^(https?:\/\/)/i.test(text.trim());
}

async function extractWebsiteContent(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 GhostNet-Scanner"
    },
    signal: controller.signal
  });

  clearTimeout(timeout);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error("URL does not return HTML content");
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

  const forms = $("form").length;
  const passwordFields = $("input[type='password']").length;

  return {
    title,
    visibleText,
    forms,
    passwordFields
  };
}

app.post("/analyze", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt missing" });
  }

  try {
    let finalPrompt = "";

    // 🟢 CASE 1: URL ANALYSIS (CONTENT-BASED)
    if (isURL(prompt)) {
      const site = await extractWebsiteContent(prompt);

      finalPrompt = `
You are a cybersecurity expert.

Analyze the WEBSITE CONTENT below and determine if it is malicious.

Website Title:
"${site.title}"

Indicators:
- Number of forms: ${site.forms}
- Password fields present: ${site.passwordFields}

Visible text excerpt:
"${site.visibleText}"

Return ONLY valid minified JSON:
{
  "probability": number,
  "type": "Phishing | Fake Login | Malware | Impersonation | Safe | Other",
  "explanation": "clear explanation based on content",
  "detectedLanguage": "language name"
}
`;
    }

    // 🟢 CASE 2: MESSAGE ANALYSIS (UNCHANGED)
    else {
      finalPrompt = `
You are a cybersecurity fraud detection expert.
The message may be in any Indian language.

Return ONLY valid minified JSON:
{
  "probability": number,
  "type": "OTP Scam | UPI Scam | Job Scam | Lottery Scam | Phishing | Safe | Other",
  "explanation": "short explanation in English",
  "detectedLanguage": "language name"
}

Message:
"${prompt}"
`;
    }

    // 🔥 CALL GEMINI
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    console.error("❌ AI request failed:", err.message);
    res.status(500).json({ error: "AI request failed" });
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
