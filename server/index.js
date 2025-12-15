import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    " https://ai-scam-analyzer.onrender.com/analyze ",
    "https://ghostnet-pro.web.app"
  ]
}));

app.use(express.json({ limit: "1mb" }));

/* ================= ENV ================= */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log("🔑 GEMINI_API_KEY loaded:", !!GEMINI_API_KEY);

/* ================= HEALTH CHECK ================= */
app.get("/", (req, res) => {
  res.json({ status: "GhostNet backend alive 🚀" });
});

/* ================= ANALYZE ================= */
app.post("/analyze", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt missing" });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({
        error: "Gemini API error",
        details: text
      });
    }

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
  console.log(`🚀 Backend running on port ${PORT}`);
});
