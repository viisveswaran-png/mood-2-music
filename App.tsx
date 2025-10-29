import React, { useEffect, useMemo, useRef, useState } from "react";
import "./app.css";

type Item = { title: string; source: string; url: string; thumb?: string };
type HistoryRow = {
  when: string;
  mood: string;
  emoji: string;
  confidence: number;
  from: "camera" | "upload" | "text";
  title?: string;
};

type Probs = Record<string, number>;
type Tab = "camera" | "upload" | "text";

const API = "http://127.0.0.1:8000";

const EMOJI: Record<string, string> = {
  happy: "😃",
  positive: "😃",
  excited: "🔥",
  calm: "😴",
  romantic: "💖",
  lonely: "😔",
  motivated: "💪",
  sad: "😢",
  angry: "😡",
  fear: "😨",
  surprise: "😲",
  disgust: "🤢",
  neutral: "😐",
};

const MOOD_GRADIENT: Record<string, string> = {
  happy: "linear-gradient(-45deg,#ffd86f,#fc6c8f,#6a85f1,#72edf2)",
  excited: "linear-gradient(-45deg,#ff7eb3,#ff758c,#ff6a88,#ff99ac)",
  calm: "linear-gradient(-45deg,#142850,#27496d,#0c7b93,#00a8cc)",
  romantic: "linear-gradient(-45deg,#ffafbd,#ffc3a0,#ff9a9e,#fecfef)",
  lonely: "linear-gradient(-45deg,#434343,#2c3e50,#3a6073,#16222a)",
  motivated: "linear-gradient(-45deg,#00c6ff,#0072ff,#1a2980,#26d0ce)",
  sad: "linear-gradient(-45deg,#2c3e50,#4ca1af,#2b5876,#4e4376)",
  angry: "linear-gradient(-45deg,#ff512f,#dd2476,#ff5f6d,#ffc371)",
  fear: "linear-gradient(-45deg,#232526,#414345,#000000,#434343)",
  surprise: "linear-gradient(-45deg,#ffe259,#ffa751,#f6d365,#fda085)",
  disgust: "linear-gradient(-45deg,#56ab2f,#a8e063,#76b852,#8dc26f)",
  neutral: "linear-gradient(-45deg,#0b0b12,#121225,#171733,#10101a)",
};

function moodColor(mood: string) {
  switch (mood) {
    case "happy":
    case "positive":
    case "excited":
      return "#27d17f";
    case "angry":
      return "#ff6b6b";
    case "sad":
      return "#6ca3ff";
    case "surprise":
      return "#ffb84d";
    case "fear":
      return "#ff7ab6";
    case "disgust":
      return "#88d36f";
    case "romantic":
      return "#ff70a6";
    case "calm":
      return "#7bdff2";
    case "lonely":
      return "#a0a3b1";
    case "motivated":
      return "#5ee07f";
    default:
      return "#aab0ff";
  }
}

/** Convert Spotify URL -> embeddable iframe src */
function toSpotifyEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("open.spotify.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const type = parts[0];
        const id = parts[1].split("?")[0];
        return `https://open.spotify.com/embed/${type}/${id}`;
      }
    }
  } catch {}
  return null;
}

// Tiny helper to clamp [0..1]
const clamp01 = (n: number) => Math.max(0, Math.min(1, n || 0));

// Make a compact bar chart from probs
function MiniChart({ probs }: { probs: Probs | null }) {
  if (!probs) return null;
  const entries = Object.entries(probs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "110px 1fr 46px", alignItems: "center", gap: 10 }}>
          <div className="muted" style={{ textTransform: "capitalize" }}>{k}</div>
          <div className="bar">
            <span style={{ width: `${Math.round(clamp01(v) * 100)}%`, background: moodColor(k) }} />
          </div>
          <small className="muted" style={{ textAlign: "right" }}>{Math.round(clamp01(v) * 100)}%</small>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  // --- UI State ---
  const [tab, setTab] = useState<Tab>("camera");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Results ---
  const [mood, setMood] = useState("");
  const [emoji, setEmoji] = useState("🎧");
  const [conf, setConf] = useState(0);
  const [list, setList] = useState<Item[]>([]);
  const [mode, setMode] = useState<"all" | "focus" | "chill" | "workout">("all");
  const [probs, setProbs] = useState<Probs | null>(null);

  // --- History ---
  const [history, setHistory] = useState<HistoryRow[]>(() => {
    try { return JSON.parse(localStorage.getItem("mood_history") || "[]"); }
    catch { return []; }
  });

  // --- Text input ---
  const [text, setText] = useState("");

  // --- Camera refs ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1400);
  }

  // Persist history
  useEffect(() => {
    localStorage.setItem("mood_history", JSON.stringify(history));
  }, [history]);

  // Mood → background gradient on <body>
  useEffect(() => {
    const g = MOOD_GRADIENT[mood] || MOOD_GRADIENT["neutral"];
    // fallback to root wrapper if you prefer:
    (document.querySelector(".app-bg") as HTMLElement | null)?.style.setProperty("background", g);
    (document.querySelector(".app-bg") as HTMLElement | null)?.style.setProperty("backgroundSize", "400% 400%");
  }, [mood]);

  // ---------------------------
  // Backend calls
  // ---------------------------
  async function analyzeText() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/predict/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await res.json();
      updateResults(j, "text");
    } catch {
      showToast("Failed to analyze text");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeImagesBlobs(blobs: Blob[], from: "camera" | "upload") {
    const fd = new FormData();
    blobs.forEach((b, i) => fd.append("files", b, `frame${i}.jpg`));
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/predict/images`, { method: "POST", body: fd });
      const j = await res.json();
      updateResults(j, from);
    } catch {
      try {
        if (blobs[0]) {
          const fd2 = new FormData();
          fd2.append("file", blobs[0], "frame0.jpg");
          const r2 = await fetch(`${API}/api/predict/image`, { method: "POST", body: fd2 });
          const j2 = await r2.json();
          updateResults(j2, from);
        } else {
          showToast("Failed to analyze image");
        }
      } catch {
        showToast("Failed to analyze image");
      }
    } finally {
      setLoading(false);
    }
  }

  function updateResults(j: any, from: HistoryRow["from"]) {
    const m = (j.mood || "").toLowerCase();
    const e = j.emoji || EMOJI[m] || "🎧";
    const c = Number(j.confidence || 0);

    setMood(m);
    setEmoji(e);
    setConf(c);
    setList(Array.isArray(j.playlist) ? j.playlist : []);
    setProbs(j.probs || null);

    // Add to history (cap 8)
    setHistory((h) => [
      {
        when: new Date().toLocaleTimeString(),
        mood: m || "neutral",
        emoji: e,
        confidence: c,
        from,
        title: j.playlist?.[0]?.title,
      },
      ...h,
    ].slice(0, 8));

    // mood-specific confetti
    pulse(m);
  }

  // ---------------------------
  // Camera control
  // ---------------------------
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (e: any) {
      showToast("Camera error: " + (e?.message || "permission denied"));
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  // Capture 3 frames ~300ms apart
  async function captureAndAnalyze() {
    const video = videoRef.current;
    if (!video) return;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frames: Blob[] = [];
    for (let i = 0; i < 3; i++) {
      ctx.drawImage(video, 0, 0, w, h);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
      );
      if (blob) frames.push(blob);
      await new Promise((r) => setTimeout(r, 300));
    }

    await analyzeImagesBlobs(frames, "camera");
  }

  // ---------------------------
  // Playlist filter tabs (still useful)
  // ---------------------------
  const filteredList = useMemo(() => {
    if (mode === "all") return list;
    const kw =
      mode === "focus"
        ? ["focus", "study", "lofi", "instrumental", "ambient", "concentration", "classical"]
        : mode === "chill"
        ? ["chill", "relax", "calm", "soothing", "coffee", "vibes", "jazz", "acoustic"]
        : ["workout", "pump", "gym", "energy", "power", "motivation", "edm", "hip-hop"];
    return list.filter((it) => kw.some((k) => (it.title || "").toLowerCase().includes(k)));
  }, [list, mode]);

  // Mood-specific confetti
  function pulse(m: string) {
    const moodEmoji = EMOJI[m] || "✨";
    for (let i = 0; i < 10; i++) {
      const el = document.createElement("div");
      el.textContent = moodEmoji;
      el.style.position = "fixed";
      el.style.left = Math.random() * 90 + 5 + "vw";
      el.style.top = "65vh";
      el.style.fontSize = 20 + Math.random() * 8 + "px";
      el.style.opacity = "0.95";
      el.style.transition = "all 1200ms ease";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform = `translateY(-${120 + Math.random() * 120}px) rotate(${(Math.random() - 0.5) * 120}deg)`;
        el.style.opacity = "0";
      });
      setTimeout(() => el.remove(), 1300 + Math.random() * 300);
    }
  }

  return (
    <div className="app-bg">
      {/* floating notes */}
      <div className="notes" aria-hidden>
        <div className="note n1">🎵</div>
        <div className="note n2">🎶</div>
        <div className="note n3">🎼</div>
        <div className="note n4">🎶</div>
        <div className="note n5">🎵</div>
        <div className="note n6">🎶</div>
      </div>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 5, backdropFilter: "blur(6px)", borderBottom: "1px solid #1f1f33" }}>
        <div className="container" style={{ paddingTop: 16, paddingBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 56, height: 56, fontSize: 28, borderRadius: 14, display: "grid", placeItems: "center",
                background: "linear-gradient(135deg,#6d5df6,#a17cf5)"
              }}>🎧</div>
              <h1 className="gradient-text" style={{ margin: 0, fontSize: "2.2rem" }}>Mood2Music</h1>
            </div>
            <nav className="tabs" role="tablist">
              {(["camera", "upload", "text"] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`tab ${tab === t ? "active" : ""}`}
                >
                  {t === "camera" ? "📸 Camera" : t === "upload" ? "📂 Upload" : "✍️ Text"}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main (full width grid) */}
      <main className="container" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        {/* Left column */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Text */}
          <section className="card" style={{ display: tab === "text" ? "grid" : "none", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Analyze Text</h3>
            <input
              className="input"
              placeholder="Type how you feel… (e.g., 'I'm super happy today!')"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="row">
              <button className="btn btn-primary" onClick={analyzeText} disabled={loading}>
                {loading ? "Analyzing…" : "Analyze Text"}
              </button>
            </div>
          </section>

          {/* Upload */}
          <section className="card" style={{ display: tab === "upload" ? "grid" : "none", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Upload a Selfie</h3>
            <label className="btn">Choose Image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await analyzeImagesBlobs([f], "upload");
                }}
              />
            </label>
            <p className="muted" style={{ margin: 0 }}>Tip: face forward, good lighting, hold expression.</p>
          </section>

          {/* Camera */}
          <section className="card" style={{ display: tab === "camera" ? "grid" : "none", gap: 10, placeItems: "start" }}>
            <h3 style={{ margin: 0 }}>Live Camera</h3>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "320px", height: "240px", borderRadius: "12px", border: "1px solid #2a2a44",
                background: "#000", display: cameraOn ? "block" : "none", objectFit: "cover", transform: "scaleX(-1)",
              }}
            />
            {!cameraOn && <p className="muted" style={{ margin: 0 }}>Camera is off</p>}

            <div className="row">
              {!cameraOn ? (
                <button className="btn btn-primary" onClick={startCamera}>Start Camera</button>
              ) : (
                <>
                  <button className="btn" onClick={captureAndAnalyze} disabled={loading}>
                    {loading ? "Analyzing…" : "Capture 3 Frames & Analyze"}
                  </button>
                  <button className="btn" onClick={stopCamera}>Stop</button>
                </>
              )}
            </div>

            <p className="muted" style={{ margin: 0 }}>
              Works on <b>localhost</b> or <b>https</b>. Hold your smile for ~1s before capture.
            </p>
          </section>

          {/* Results */}
          <section className="card" style={{ display: "grid", gap: 16 }}>
            {!mood ? (
              <p className="muted" style={{ margin: 0 }}>Results will appear here.</p>
            ) : (
              <>
                <div className="row" style={{ gap: 12 }}>
                  <div style={{ fontSize: 30, lineHeight: 1 }}>{emoji || EMOJI[mood] || "🎧"}</div>
                  <div>
                    <b style={{ fontSize: 18, textTransform: "uppercase" }}>{mood}</b>
                    <div className="bar" style={{ width: 220, marginTop: 6, marginBottom: 6 }}>
                      <span style={{ width: `${Math.round(conf * 100)}%`, background: moodColor(mood) }} />
                    </div>
                    <small className="muted">{Math.round(conf * 100)}% confidence</small>
                  </div>
                </div>

                {/* Mini confidence chart */}
                {probs && (
                  <div>
                    <h4 style={{ margin: "8px 0 6px 0" }}>Confidence by emotion</h4>
                    <MiniChart probs={probs} />
                  </div>
                )}

                {/* Filter tabs */}
                <div className="tabs">
                  {(["all", "focus", "chill", "workout"] as const).map((m) => (
                    <button key={m} className={`tab ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
                      {m}
                    </button>
                  ))}
                </div>

                {/* Playlist list (thumb-ready) */}
                {filteredList.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No playlists match this filter. Try “All”.</p>
                ) : (
                  filteredList.map((it, i) => {
                    const embed = toSpotifyEmbed(it.url);
                    return (
                      <div key={i} className="linkRow" style={{ alignItems: "stretch", flexDirection: "column" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
                          {/* Thumb or mood badge */}
                          {it.thumb ? (
                            <img src={it.thumb} alt="" width={42} height={42} style={{ borderRadius: 8, objectFit: "cover" }} />
                          ) : (
                            <div style={{
                              width: 42, height: 42, borderRadius: 8, display: "grid", placeItems: "center",
                              background: moodColor(mood), opacity: .85, color: "#000"
                            }}>{(EMOJI[mood] || "🎶")}</div>
                          )}
                          <div>🎶 {it.title} <span className="muted">({it.source})</span></div>
                          <a href={it.url} target="_blank" rel="noreferrer" className="btn">Open</a>
                        </div>
                        {embed && (
                          <div style={{ marginTop: 10 }}>
                            <iframe
                              title={`spotify-${i}`}
                              src={embed}
                              width="100%"
                              height="80"
                              frameBorder="0"
                              allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                              loading="lazy"
                              style={{ borderRadius: 8 }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </section>
        </div>

        {/* Right column: history */}
        <aside className="card" style={{ position: "sticky", top: 76, height: "fit-content", display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Recent</h3>
          {history.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No history yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {history.map((r, i) => (
                <li key={i} style={{ background: "#121226", border: "1px solid #23233a", borderRadius: 10, padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{r.emoji}</span>
                      <b style={{ letterSpacing: 0.3 }}>{r.mood.toUpperCase()}</b>
                    </div>
                    <small className="muted">{Math.round(r.confidence * 100)}%</small>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {r.when} • {r.from}{r.title ? ` • ${r.title}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>

      {/* Footer */}
      <div className="container" style={{ padding: 20, textAlign: "center" }}>
        <p className="muted" style={{ margin: 0 }}>
          Tip: If camera reads “neutral”, use <b>Capture 3 Frames</b> and hold expression 1–2s.
          &nbsp;·&nbsp;
          <a href={`${API}/docs`} target="_blank" rel="noreferrer" style={{ color: "#79c1ff" }}>API Docs</a>
        </p>
      </div>
      {/* AI / ML Models Section */}
      <div className="container" style={{ padding: 20, textAlign: "center" }}>
        <div className="card" style={{ background: "#141428", display: "inline-block", textAlign: "left" }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>🤖 AI & ML Models Used</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li><b>HuggingFace Transformers</b> — text sentiment analysis</li>
            <li><b>Facial Emotion Detection</b> — pretrained CNN model from HuggingFace</li>
            <li><b>PyTorch Backend</b> — for efficient deep learning inference</li>
            <li><b>Custom Mood → Playlist Mapping</b> — curated rules + filters</li>
          </ul>
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            These models run locally via FastAPI backend and are combined with curated Spotify playlists.
          </p>
        </div>
      </div>


      {toast && (
        <div className="card" style={{ position: "fixed", bottom: 18, right: 18, background: "#1a1a2c", border: "1px solid #2a2a44" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
