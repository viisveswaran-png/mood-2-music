# app/main.py
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline
from PIL import Image
from typing import List, Dict, Any
import io

app = FastAPI()

# Allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Models ----------
# Text sentiment (returns POSITIVE / NEGATIVE, sometimes NEUTRAL)
sentiment_pipe = pipeline("sentiment-analysis")

# Image emotion classification (returns list of emotions with scores)
# Labels often include: Angry, Disgust, Fear, Happy, Neutral, Sad, Surprise
emotion_pipe = pipeline(
    "image-classification",
    model="dima806/facial_emotions_image_detection"
)

# ---------- Helpers ----------
# Normalize image labels to lowercase keywords we use
def normalize_label(label: str) -> str:
    l = label.strip().lower()
    aliases = {
        "angry": "angry",
        "disgust": "disgust",
        "fear": "fear",
        "happy": "happy",
        "neutral": "neutral",
        "sad": "sad",
        "surprise": "surprise",
    }
    return aliases.get(l, l)

# (NEW) Rich playlists: per emotion we include variety buckets (energetic/chill/karoke/desi/gaming/study)
# You can add "thumb" if you want to show a cover image in the UI. (Front-end will handle missing.)
PLAYLISTS: Dict[str, List[Dict[str, str]]] = {
    # Core moods
    "happy": [
        # Energetic / Party
        {"title": "EDM Bangers", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX4dyzvuaRJ0n"},
        {"title": "Pop Party Hits", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX1H4LbvY4OJi"},
        # Karaoke
        {"title": "Sing-Along Classics", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXa2SPUyWl8Y5"},
        # Desi vibes
        {"title": "Bollywood Dance Hits", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX9qNs32fujYe"},
        # Chill/Focus fallback
        {"title": "Feel-Good Chill", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX2sUQwD7tbmL"},
    ],
    "sad": [
        {"title": "Sad Songs", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX7qK8ma5wgG1"},
        {"title": "Indie Sad Songs", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX7qK8ma5wgG1"},
        {"title": "Rainy Day Blues", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn"},
        {"title": "Late Night Vibes", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX82Zzp6AKx64"},
        {"title": "Bollywood Heartbreak", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWYxZmRVbzYl0"},
    ],
    "angry": [
        {"title": "Beast Mode (Hip-Hop)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP"},
        {"title": "Heavy Metal Rage", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWXGFzWd5JuNx"},
        {"title": "Rock Hard", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX1rVvRgjX59F"},
        {"title": "Workout Pump", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX8hY56Fq3fM0"},
        {"title": "Desi Rap Heat", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX8ENNdgFRc1m"},
    ],
    "neutral": [
        {"title": "Daily Mix Chill", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6"},
        {"title": "Cafe Chill", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX6ziVCJnEm59"},
        {"title": "Lo-Fi Beats", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXdPDLmy88MDk"},
        {"title": "Study Zone (Classical)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWWEJlAGA9gs0"},
        {"title": "Gaming / Synthwave", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS"},
    ],
    "disgust": [
        {"title": "Grunge & Alt Rock", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXdeeBJWxwJrR"},
        {"title": "Hardcore Workout", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWVtgG63SDdt8"},
        {"title": "Bass Booster (EDM)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWY4xHQp97fN6"},
        {"title": "Desi Fire (Punjabi/Desi Hip-Hop)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM"},
    ],
    "fear": [
        {"title": "Calm Piano", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO"},
        {"title": "Deep Focus (Ambient)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ"},
        {"title": "Breathing Room (Mindfulness)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY"},
        {"title": "Acoustic Chill", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWXRqgorJj26U"},
    ],
    "surprise": [
        {"title": "Happy Hits!", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXdPec7aLTmlC"},
        {"title": "Dance Pop!", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX0BcQWzuB7ZO"},
        {"title": "Party Bollywood", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWYkaDif7Ztbp"},
        {"title": "EDM Party Starters", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd"},
    ],

    # Extended “semantic” moods (text-heavy; image may map into them based on logic)
    "excited": [
        {"title": "EDM Bangers", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX4dyzvuaRJ0n"},
        {"title": "Bollywood Dance Hits", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX9qNs32fujYe"},
        {"title": "Party Starters (Pop)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX0BcQWzuB7ZO"},
    ],
    "calm": [
        {"title": "Lo-Fi Chill", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXdPDLmy88MDk"},
        {"title": "Coffeehouse Relax", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX6ziVCJnEm59"},
        {"title": "Soft Jazz Evening", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX4wta20PHgwo"},
    ],
    "romantic": [
        {"title": "Bollywood Love Songs", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM"},
        {"title": "R&B Romance", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWXbLOeOIhbc4"},
        {"title": "Love Ballads (English)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX50QitC6Oqtn"},
    ],
    "lonely": [
        {"title": "Indie Sad Songs", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX7qK8ma5wgG1"},
        {"title": "Late Night Vibes", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX82Zzp6AKx64"},
        {"title": "Mellow Acoustic", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX2SK4ytI2KAZ"},
    ],
    "motivated": [
        {"title": "Beast Mode", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP"},
        {"title": "Workout Pump", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX8hY56Fq3fM0"},
        {"title": "Bollywood Workout", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXdxcBWuJkbcy"},
    ],

    # Pure categories (if you want to expose them later via frontend tabs)
    "energetic": [
        {"title": "EDM Bangers", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX4dyzvuaRJ0n"},
        {"title": "Hip-Hop Drive", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX186v583rmzp"},
    ],
    "chill_night": [
        {"title": "Lo-Fi Beats", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXdPDLmy88MDk"},
        {"title": "Acoustic Chill", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWXRqgorJj26U"},
        {"title": "Night Jazz", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX4wta20PHgwo"},
    ],
    "karaoke": [
        {"title": "Bollywood Karaoke", "source": "spotify", "url": "https://open.spotify.com/playlist/1GTSuJbbx1gd3w0oF9yW6Q"},
        {"title": "Sing Along Classics", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXa2SPUyWl8Y5"},
    ],
    "desi": [
        {"title": "Tamil Hits", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX3oM43CtKnRV"},
        {"title": "Telugu Hotshots", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX5xKNgvGnJgG"},
        {"title": "Bollywood Dance Hits", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX9qNs32fujYe"},
    ],
    "gaming": [
        {"title": "Synthwave Gaming", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS"},
        {"title": "Trap / Bass Gaming", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX7e8Dfw4r6he"},
        {"title": "Lo-Fi for Gaming", "source": "spotify", "url": "https://open.spotify.com/playlist/3MegmGDh1q4qkS3gpKxZjq"},
    ],
    "study": [
        {"title": "Deep Focus (Ambient)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ"},
        {"title": "Lo-Fi Beats (Study)", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS"},
        {"title": "Classical Concentration", "source": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DWWEJlAGA9gs0"},
    ],
}

def pick_playlist(mood: str) -> List[Dict[str, str]]:
    m = mood.lower()
    # If we have direct mood list, use it; else fallback to neutral.
    return PLAYLISTS.get(m, PLAYLISTS["neutral"])

def probs_to_dict(items: List[Dict[str, Any]]) -> Dict[str, float]:
    # items like [{'label': 'Happy', 'score': 0.92}, ...]
    out: Dict[str, float] = {}
    for it in items:
        out[normalize_label(it["label"])] = float(it["score"])
    return out

# ---------- Routes ----------
@app.post("/api/predict/text")
async def predict_text(payload: Dict[str, str]):
    text = (payload or {}).get("text", "").strip()
    if not text:
        return {"mood": "neutral", "confidence": 0.0, "playlist": pick_playlist("neutral"), "probs": {"neutral": 1.0}}

    r = sentiment_pipe(text)[0]
    label = r["label"].lower()
    score = float(r["score"])

    # Simple mapping
    # allow extra keyword hints for extended moods (romantic, calm etc.)
    lower = text.lower()
    if any(k in lower for k in ["love", "crush", "romantic", "date", "hearts"]):
        mood = "romantic"
    elif any(k in lower for k in ["calm", "peaceful", "relax", "breathe", "meditate"]):
        mood = "calm"
    elif any(k in lower for k in ["study", "focus", "concentrat"]):
        mood = "study"
    elif any(k in lower for k in ["game", "gaming", "valorant", "pubg", "fortnite"]):
        mood = "gaming"
    elif "positive" in label:
        mood = "happy"
    elif "negative" in label:
        # choose sad or angry based on trigger words
        if any(k in lower for k in ["angry", "mad", "rage"]):
            mood = "angry"
        elif any(k in lower for k in ["lonely", "alone"]):
            mood = "lonely"
        else:
            mood = "sad"
    else:
        mood = "neutral"

    # Build a simple probs for the mini chart
    probs = {"positive": 0.0, "negative": 0.0, "neutral": 0.0}
    if "pos" in label:
        probs["positive"] = score
        probs["negative"] = (1.0 - score) * 0.6
        probs["neutral"]  = (1.0 - score) * 0.4
    elif "neg" in label:
        probs["negative"] = score
        probs["positive"] = (1.0 - score) * 0.3
        probs["neutral"]  = (1.0 - score) * 0.7
    else:
        probs["neutral"]  = 0.6
        probs["positive"] = 0.2
        probs["negative"] = 0.2

    return {
        "mood": mood,
        "confidence": score,
        "playlist": pick_playlist(mood),
        "probs": probs,  # frontend mini-chart
    }

@app.post("/api/predict/image")
async def predict_image(file: UploadFile = File(...)):
    img = Image.open(io.BytesIO(await file.read())).convert("RGB")
    results = emotion_pipe(img, top_k=6)
    # results: list of dicts [{label, score}...], pick max
    best = max(results, key=lambda x: x["score"])
    mood = normalize_label(best["label"])
    return {
        "mood": mood,
        "confidence": float(best["score"]),
        "playlist": pick_playlist(mood),
        "probs": probs_to_dict(results),
    }

@app.post("/api/predict/images")
async def predict_images(files: List[UploadFile] = File(...)):
    # vote over multiple frames
    bag: List[Dict[str, float]] = []
    for f in files:
        img = Image.open(io.BytesIO(await f.read())).convert("RGB")
        results = emotion_pipe(img, top_k=6)
        bag.append(probs_to_dict(results))

    # average probs
    avg: Dict[str, float] = {}
    for d in bag:
        for k, v in d.items():
            avg[k] = avg.get(k, 0.0) + v
    for k in list(avg.keys()):
        avg[k] /= max(1, len(bag))

    # pick best mood
    if avg:
        mood = max(avg.items(), key=lambda kv: kv[1])[0]
        conf = avg[mood]
    else:
        mood, conf = "neutral", 0.0

    return {
        "mood": mood,
        "confidence": float(conf),
        "playlist": pick_playlist(mood),
        "probs": avg,
    }
