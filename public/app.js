import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/* ================= FIREBASE ================= */
const firebaseConfig = {
  apiKey: "AIzaSyCe41LBbohagUPC47BmIeCWQQpkJXpT1Ik",
  authDomain: "ghostnet-pro.firebaseapp.com",
  projectId: "ghostnet-pro",
  storageBucket: "ghostnet-pro.appspot.com",
  messagingSenderId: "633279792794",
  appId: "1:633279792794:web:f20dd8e9a7a5e9f5ccc123"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/* ================= DOM ELEMENTS ================= */
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfo = document.getElementById("user-info");
const analyzeBtn = document.getElementById("analyze-btn");
const msgInput = document.getElementById("message-input");
const resultBox = document.getElementById("result-box");
const errorDiv = document.getElementById("error");
const historyDiv = document.getElementById("history");
const themeToggle = document.getElementById("theme-toggle");
console.log("userInfo:", userInfo);
console.log("themeToggle:", themeToggle);

/* ================= THEME LOGIC ================= */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  // Safety check: Ensure button exists before changing text
  if (themeToggle) {
    themeToggle.textContent = theme === "light" ? "🌙 Dark Mode" : "🌞 Light Mode";
  }
}

// Load saved theme
const savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);

// Toggle Event Listener
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "light" ? "dark" : "light");
  });
}

/* ================= AUTH ================= */
if (loginBtn) {
  loginBtn.onclick = async () => {
    try { await signInWithPopup(auth, provider); }
    catch (e) { console.error(e); alert("Login failed"); }
  };
}

if (logoutBtn) {
  logoutBtn.onclick = async () => signOut(auth);
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (userInfo) {
      userInfo.textContent = `Signed in as ${user.email}`;
    }

    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline";



    startRealtimeHistory();
  } else {
    if (userInfo) {
      userInfo.textContent = "Not signed in";
    }

    if (loginBtn) loginBtn.style.display = "inline";
    if (logoutBtn) logoutBtn.style.display = "none";

    if (historyDiv) {
      historyDiv.innerHTML = "Please sign in to view history.";
    }
  }
});


/* ================= HISTORY ================= */
let unsubscribeHistory = null; // To stop listening when logged out

function startRealtimeHistory() {
  if (!auth.currentUser) return;

  // Unsubscribe previous listener if exists
  if (unsubscribeHistory) unsubscribeHistory();

  const q = query(
    collection(db, "scans"),
    where("userId", "==", auth.currentUser.uid),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  unsubscribeHistory = onSnapshot(q, snap => {
    historyDiv.innerHTML = "";
    if (snap.empty) {
      historyDiv.innerHTML = "No scans yet.";
      return;
    }

    snap.forEach(doc => {
      const d = doc.data();
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `
        <div class="history-type">${d.type} | ${d.probability}%</div>
        <div>${d.message}</div>
        <div class="history-time">${d.detectedLanguage || "Unknown"}</div>
      `;
      historyDiv.appendChild(div);
    });
  });
}
/* ================= ANALYZE LOGIC ================= */
if (analyzeBtn) {
  analyzeBtn.onclick = async () => {
    // 1. CLEAR PREVIOUS ERRORS
    errorDiv.textContent = "";

    // 2. CHECK LOGIN STATUS (CRITICAL FIX)
    if (!auth.currentUser) {
      errorDiv.textContent = "⚠️ You must be signed in to analyze messages.";
      return;
    }

    const txt = msgInput.value.trim();
    if (!txt) return;

    resultBox.innerHTML = `<div class="shimmer"></div>`;

    const isURL = /(https?:\/\/|[a-z0-9-]+\.(com|in|xyz|top|shop|cyou|online|net|info))/i.test(txt);

    const prompt = isURL
      ? `You are a cybersecurity expert. Analyze this WEBSITE URL for scams. Return ONLY valid minified JSON: {"probability": number, "type": "Phishing | Fake Login | Malware | Impersonation | Safe | Other", "explanation": "short explanation", "detectedLanguage": "English"} URL: "${txt}"`
      : `You are a cybersecurity fraud detection expert. The message may be in any Indian language. Return ONLY valid minified JSON: {"probability": number, "type": "OTP Scam | UPI Scam | Job Scam | Lottery Scam | Phishing | Safe | Other", "explanation": "short explanation in English", "detectedLanguage": "language name"} Message: "${txt}"`;

    try {
      const BACKEND_URL = "https://ai-scam-analyzer.onrender.com";

      const res = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });


      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Backend error");
      }

      const data = await res.json();

      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = aiText.replace(/```json|```/g, "").trim();

      if (!cleaned.startsWith("{") || !cleaned.endsWith("}")) {
        throw new Error("Invalid AI Response");
      }


      let parsed = JSON.parse(cleaned);
      if (parsed.probability <= 1) parsed.probability = Math.round(parsed.probability * 100);

      // SAVE TO DB
      await addDoc(collection(db, "scans"), {
        userId: auth.currentUser.uid, // This is safe now because we checked login above
        message: txt,
        probability: parsed.probability,
        type: parsed.type,
        explanation: parsed.explanation,
        detectedLanguage: parsed.detectedLanguage,
        createdAt: serverTimestamp()
      });

      // UI UPDATE
      let badgeClass = parsed.probability < 30 ? "badge badge-safe" : parsed.probability < 70 ? "badge badge-warning" : "badge badge-danger";
      let riskColor = parsed.probability < 30 ? "var(--safe)" : parsed.probability < 70 ? "var(--warning)" : "var(--danger)";

      resultBox.innerHTML = `
        <span class="${badgeClass}">${parsed.probability < 30 ? "SAFE" : parsed.probability < 70 ? "SUSPICIOUS" : "HIGH-RISK"}</span>
        <div style="margin-top:12px">
          <strong style="color:${riskColor}">Risk:</strong> ${parsed.probability}%<br><br>
          <strong>Type:</strong> ${parsed.type}<br><br>
          <strong>Language:</strong> ${parsed.detectedLanguage}<br><br>
          <strong>Explanation:</strong><br>${parsed.explanation}
        </div>
      `;

    } catch (err) {
      console.error(err);
      resultBox.innerHTML = "⚠️ Analysis failed. Please try again.";
    }
  };
}
