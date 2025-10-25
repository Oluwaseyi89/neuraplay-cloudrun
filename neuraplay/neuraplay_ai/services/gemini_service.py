import os
import json
import math
import re
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
GENAI_TIMEOUT_SECONDS = int(os.getenv("GENAI_TIMEOUT_SECONDS", "20"))

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in environment (.env or Cloud Run env)")

# Use the modern client approach consistently
try:
    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    _MODERN = True
except ImportError:
    # Fallback to legacy if modern not available
    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)
    _MODERN = False

def _call_gemini(prompt: str) -> str:
    """
    Stable Gemini API call that works with the modern google-genai client
    """
    try:
        if _MODERN:
            # Use the modern client with proper method
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[prompt],
            )
            
            # Modern client returns response with text attribute
            if hasattr(response, 'text') and response.text:
                return response.text.strip()
            else:
                # Fallback: try to extract from response structure
                return str(response).strip()
                
        else:
            # Legacy fallback
            model = genai.GenerativeModel(GEMINI_MODEL)
            response = model.generate_content(prompt)
            return getattr(response, 'text', str(response)).strip()
            
    except Exception as e:
        raise RuntimeError(f"Gemini call failed: {str(e)}")

def _score_to_rating(score: float) -> float:
    """Normalize a 0..1 score to 1..10 rating (rounded to 1 decimal)."""
    score_clamped = max(0.0, min(1.0, score))
    return round(1.0 + score_clamped * 9.0, 1)

def _parse_insights_to_structured(text: str) -> Dict[str, Any]:
    """
    Very small heuristic parser that tries to split the AI text into:
    - top_tips: list[str]
    - drills: list[str]
    - explanation: str
    - estimated_score: float (0..1)
    If the AI returns plain text, this function will fallback gracefully.
    """
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    top_tips: List[str] = []
    drills: List[str] = []
    explanation_parts: List[str] = []
    est_score: Optional[float] = None

    for line in lines:
        lowered = line.lower()
        if lowered.startswith(("tip", "-", "•", "1.", "2.", "3.")):
            # treat as tip/drill heuristically
            if "drill" in lowered or "practice" in lowered or "train" in lowered:
                drills.append(line.lstrip("-•0123456789. ").strip())
            else:
                top_tips.append(line.lstrip("-•0123456789. ").strip())
        elif "score" in lowered or "%" in lowered:
            # attempt to parse a number out
            m = re.search(r"(\d{1,3})(?:\.\d+)?\s*%?", line)
            if m:
                try:
                    val = float(m.group(1))
                    est_score = max(0.0, min(100.0, val)) / 100.0
                except Exception:
                    pass
            explanation_parts.append(line)
        else:
            explanation_parts.append(line)

    # fallback: if no tips parsed, use first 3 sentences as tips
    if not top_tips:
        sentences = re.split(r'(?<=[.!?])\s+', text)
        top_tips = [s.strip() for s in sentences[:3] if s.strip()]

    if not drills:
        drills = []

    if est_score is None:
        # synthetic scoring based on presence of 'good', 'poor', 'mistake' words
        s = text.lower()
        score = 0.5
        if any(k in s for k in ["excellent", "well", "good", "great"]):
            score += 0.2
        if any(k in s for k in ["mistake", "poor", "bad", "missed"]):
            score -= 0.2
        est_score = max(0.0, min(1.0, score))

    rating = _score_to_rating(est_score)

    return {
        "top_tips": top_tips,
        "drills": drills,
        "explanation": " ".join(explanation_parts).strip(),
        "estimated_score": round(est_score, 3),
        "rating": rating,
        "raw_text": text,
    }

def analyze_lol_strategy(stats: Dict[str, Any]) -> Dict[str, Any]:
    """
    stats: a dictionary with keys like:
      - champion, role, kills, deaths, assists, cs, minute, objectives, team_comp (optional)
    returns structured coaching advice dict
    """
    champion = stats.get("champion", "unknown")
    role = stats.get("role", "unknown")
    kills = stats.get("kills", 0)
    deaths = stats.get("deaths", 0)
    assists = stats.get("assists", 0)
    cs = stats.get("cs", None)
    minute = stats.get("minute", None)
    objective_notes = stats.get("objectives", "")
    team_desc = stats.get("team_comp", "")

    # Build a focused prompt for Gemini
    prompt = f"""
You are NeuraPlay, an expert League of Legends coach. Given the player's in-game snapshot below,
produce concise, actionable coaching advice in 3 bullets, suggest 2 training drills, and give a short performance rating (0-100%).
Return a short plain-text analysis.

Player snapshot:
- Champion: {champion}
- Role: {role}
- K/D/A: {kills}/{deaths}/{assists}
- CS: {cs if cs is not None else 'unknown'}
- Game minute: {minute if minute is not None else 'unknown'}
- Recent objective notes: {objective_notes}
- Team composition / notes: {team_desc}

Focus on:
- Immediate next action (what the player should do in the next 1-2 minutes)
- One mechanical improvement (how to practice it)
- One strategic improvement (macro decision)
- Keep the answer short (4-6 sentences), but include 3 clear tips and 2 practice drills.
"""
    try:
        text = _call_gemini(prompt)
        structured = _parse_insights_to_structured(text)
        structured["meta"] = {"game": "league_of_legends", "champion": champion, "role": role}
        return structured
    except Exception as e:
        return {
            "error": f"Analysis failed: {str(e)}",
            "top_tips": [],
            "drills": [],
            "explanation": "",
            "estimated_score": 0.5,
            "rating": 5.0,
            "raw_text": "",
            "meta": {"game": "league_of_legends", "champion": champion, "role": role}
        }

def analyze_fifa_strategy(stats: Dict[str, Any]) -> Dict[str, Any]:
    """
    stats: a dictionary with keys like:
      - team, formation, possession_pct, scoreline, minute, key_events (list), player_position, stamina
    returns structured coaching advice dict
    """
    team = stats.get("team", "unknown")
    formation = stats.get("formation", "")
    possession = stats.get("possession_pct", None)
    scoreline = stats.get("scoreline", "")
    minute = stats.get("minute", None)
    events = stats.get("key_events", "")

    prompt = f"""
You are NeuraPlay, an expert football (EA FC / FIFA) tactical coach. Given the match snapshot below,
produce concise, actionable coaching advice in 3 bullets, suggest 2 training drills, and give a short performance rating (0-100%).
Return a short plain-text analysis.

Match snapshot:
- Team: {team}
- Formation: {formation}
- Possession: {possession if possession is not None else 'unknown'}
- Scoreline: {scoreline}
- Minute: {minute if minute is not None else 'unknown'}
- Key events: {events}

Focus on:
- Immediate next tactical action (what to do in the next 2 minutes)
- One mechanical improvement (passing, first touch, shooting)
- One strategic improvement (formation change, pressing trigger)
- Keep the answer short (4-6 sentences), include 3 clear tips and 2 practice drills.
"""
    try:
        text = _call_gemini(prompt)
        structured = _parse_insights_to_structured(text)
        structured["meta"] = {"game": "fifa", "team": team}
        return structured
    except Exception as e:
        return {
            "error": f"Analysis failed: {str(e)}",
            "top_tips": [],
            "drills": [],
            "explanation": "",
            "estimated_score": 0.5,
            "rating": 5.0,
            "raw_text": "",
            "meta": {"game": "fifa", "team": team}
        }

def generate_coaching_advice(gameplay: str, game_type: str) -> Dict[str, Any]:
    """
    Generate coaching advice based on gameplay description and game type
    """
    if game_type == "lol":
        # Extract basic info from gameplay description for League of Legends
        payload = {
            "champion": "unknown", 
            "role": "unknown", 
            "kills": 0,
            "deaths": 0, 
            "assists": 0,
            "minute": 15,  # default mid-game
            "objectives": gameplay,
            "team_comp": "Standard composition",
            "cs": 100  # default CS
        }
        return analyze_lol_strategy(payload)

    elif game_type == "fifa":
        # Extract basic info from gameplay description for FIFA
        payload = {
            "team": "unknown",
            "formation": "4-3-3",  # default formation
            "possession_pct": 50,  # default possession
            "scoreline": "0-0",  # default score
            "minute": 45,  # default minute
            "key_events": gameplay
        }
        return analyze_fifa_strategy(payload)

    else:
        return {
            "error": "Unsupported game type",
            "top_tips": [],
            "drills": [],
            "explanation": f"Game type '{game_type}' is not supported. Currently supported: lol, fifa",
            "estimated_score": 0.0,
            "rating": 1.0,
            "raw_text": ""
        }
