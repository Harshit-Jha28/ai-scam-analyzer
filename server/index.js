import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
console.log("GEMINI_API_KEY loaded:", !!process.env.GEMINI_API_KEY);


const app = express();

/* ================= SECURITY ================= */
app.use(cors({
  origin: [
    "http://localhost:5500",        // local dev
    "https://ghostnet-pro.web.app"  // production frontend
  ]
}));

app.use(express.json({ limit: "1mb" }));

/* ================= ENV CHECK ================= */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is missing in environment variables");
  process.exit(1);
}

/* ================= HEALTH CHECK ================= */
app.get("/", (req, res) => {
  res.json({
    status: "GhostNet AI backend is running 🚀"
  });
});


/* ================= ANALYZE ENDPOINT ================= */
app.post("/analyze", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt missing" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

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
app.listen(PORT, () =>
  console.log(`🚀 Backend running on port ${PORT}`)
);
