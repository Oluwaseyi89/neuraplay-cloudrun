import os
import json
import math
import re
import time
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")  # Changed to flash for faster responses
GENAI_TIMEOUT_SECONDS = int(os.getenv("GENAI_TIMEOUT_SECONDS", "30"))
MAX_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "3"))
RETRY_DELAY = float(os.getenv("GEMINI_RETRY_DELAY", "2.0"))

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

def _call_gemini_with_retry(prompt: str, max_retries: int = MAX_RETRIES) -> str:
    """
    Stable Gemini API call with retry logic for overloaded/503 errors
    """
    last_exception = None
    
    for attempt in range(max_retries):
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
            last_exception = e
            error_str = str(e).lower()
            
            # Check if this is a retryable error
            is_retryable = any(keyword in error_str for keyword in [
                "overloaded", "503", "unavailable", "timeout", "busy", "quota"
            ])
            
            if is_retryable and attempt < max_retries - 1:
                wait_time = RETRY_DELAY * (2 ** attempt)  # Exponential backoff
                print(f"⚠️ Gemini overloaded (attempt {attempt + 1}/{max_retries}), retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            else:
                # If it's not retryable or we've exhausted retries, break
                break
    
    # If we get here, all retries failed
    raise RuntimeError(f"Gemini call failed after {max_retries} attempts: {str(last_exception)}")

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
        if any(k in s for k in ["excellent", "well", "good", "great", "improving", "better"]):
            score += 0.2
        if any(k in s for k in ["mistake", "poor", "bad", "missed", "struggling", "weakness"]):
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

def _create_error_response(game: str, error_msg: str, input_type: str = "structured", user_text: str = "") -> Dict[str, Any]:
    """Create a consistent error response structure"""
    base_response = {
        "error": error_msg,
        "top_tips": [],
        "drills": [],
        "explanation": "I'm having trouble connecting to the analysis service right now. Please try again in a moment.",
        "estimated_score": 0.5,
        "rating": 5.0,
        "raw_text": "",
    }
    
    # Add metadata based on input type
    if input_type == "voice":
        base_response["meta"] = {
            "game": game, 
            "input_type": "voice", 
            "user_text": user_text,
            "response_type": "error"
        }
    else:
        base_response["meta"] = {"game": game, "input_type": input_type}
    
    return base_response

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
        text = _call_gemini_with_retry(prompt)
        structured = _parse_insights_to_structured(text)
        structured["meta"] = {"game": "league_of_legends", "champion": champion, "role": role}
        return structured
    except Exception as e:
        return _create_error_response("league_of_legends", f"Analysis failed: {str(e)}")

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
        text = _call_gemini_with_retry(prompt)
        structured = _parse_insights_to_structured(text)
        structured["meta"] = {"game": "fifa", "team": team}
        return structured
    except Exception as e:
        return _create_error_response("fifa", f"Analysis failed: {str(e)}")

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
        return _create_error_response("unknown", f"Unsupported game type: {game_type}")

def analyze_fifa_voice_input(user_text: str) -> Dict[str, Any]:
    """
    Analyze free-form FIFA voice input and extract structured insights
    """
    # Check if user wants detailed analysis
    wants_detailed = any(keyword in user_text.lower() for keyword in [
        "detailed", "comprehensive", "full analysis", "complete"
    ])
    
    if wants_detailed:
        prompt = f"""
You are an expert FIFA/EA FC analyst. A player is describing their gameplay issues in natural language.

Player's description: "{user_text}"

FIRST, extract the key gameplay elements mentioned:
- Team and formation (if mentioned)
- Current scoreline or match situation  
- Possession and control issues
- Defensive problems (conceding goals, defensive errors)
- Attacking problems (scoring chances, finishing)
- Specific events or patterns mentioned

SECOND, provide detailed coaching advice based on the extracted context:
- 3 immediate tactical adjustments
- 2 specific practice drills to address the issues
- Performance rating (0-100%) based on described problems

Keep the analysis focused on the specific issues mentioned in the player's description.
Return your analysis in a structured format.
"""
    else:
        prompt = f"""
You are an expert FIFA/EA FC analyst. A player is describing their gameplay issues.

Player's description: "{user_text}"

Provide exactly 3 concise sentences of coaching advice:
1. Identify the main issue from their description
2. Suggest one immediate tactical adjustment  
3. Recommend one quick practice tip

Keep it very brief and focused - maximum 3 sentences total.
Do not include bullet points, lists, or ratings.
"""
    
    try:
        text = _call_gemini_with_retry(prompt)
        
        if wants_detailed:
            # Use the existing structured parser for detailed responses
            structured = _parse_insights_to_structured(text)
            structured["meta"] = {
                "game": "fifa", 
                "input_type": "voice", 
                "user_text": user_text, 
                "response_type": "detailed"
            }
            return structured
        else:
            # For simple responses, create a minimal structured response
            # Clean up the response to ensure it's exactly 3 sentences
            sentences = re.split(r'(?<=[.!?])\s+', text.strip())
            simple_summary = ' '.join(sentences[:3])  # Take first 3 sentences
            
            return {
                "top_tips": [],
                "drills": [],
                "explanation": simple_summary,
                "estimated_score": None,  # No score for simple responses
                "rating": None,  # No rating for simple responses
                "raw_text": text,
                "meta": {
                    "game": "fifa", 
                    "input_type": "voice", 
                    "user_text": user_text, 
                    "response_type": "simple"
                }
            }
            
    except Exception as e:
        return _create_error_response("fifa", f"Voice analysis failed: {str(e)}", "voice", user_text)

def analyze_lol_voice_input(user_text: str) -> Dict[str, Any]:
    """
    Analyze free-form League of Legends voice input and extract structured insights
    """
    # Check if user wants detailed analysis
    wants_detailed = any(keyword in user_text.lower() for keyword in [
        "detailed", "comprehensive", "full analysis", "complete"
    ])
    
    if wants_detailed:
        prompt = f"""
You are an expert League of Legends coach. A player is describing their gameplay issues in natural language.

Player's description: "{user_text}"

FIRST, extract the key gameplay elements mentioned:
- Champion and role (if mentioned)
- Lane phase issues (CS, trading, positioning)
- Team fight problems (positioning, target selection)
- Objective control (dragons, barons, towers)
- Specific match situations described

SECOND, provide detailed coaching advice based on the extracted context:
- 3 immediate in-game actions
- 2 specific practice drills to address the issues  
- Performance rating (0-100%) based on described problems

Focus on the specific pain points mentioned by the player.
Return your analysis in a structured format.
"""
    else:
        prompt = f"""
You are an expert League of Legends coach. A player is describing their gameplay issues.

Player's description: "{user_text}"

Provide exactly 3 concise sentences of coaching advice:
1. Identify the main issue from their description
2. Suggest one immediate in-game action  
3. Recommend one quick improvement tip

Keep it very brief and focused - maximum 3 sentences total.
Do not include bullet points, lists, or ratings.
"""
    
    try:
        text = _call_gemini_with_retry(prompt)
        
        if wants_detailed:
            # Use the existing structured parser for detailed responses
            structured = _parse_insights_to_structured(text)
            structured["meta"] = {
                "game": "league_of_legends", 
                "input_type": "voice", 
                "user_text": user_text, 
                "response_type": "detailed"
            }
            return structured
        else:
            # For simple responses, create a minimal structured response
            sentences = re.split(r'(?<=[.!?])\s+', text.strip())
            simple_summary = ' '.join(sentences[:3])  # Take first 3 sentences
            
            return {
                "top_tips": [],
                "drills": [],
                "explanation": simple_summary,
                "estimated_score": None,  # No score for simple responses
                "rating": None,  # No rating for simple responses
                "raw_text": text,
                "meta": {
                    "game": "league_of_legends", 
                    "input_type": "voice", 
                    "user_text": user_text, 
                    "response_type": "simple"
                }
            }
            
    except Exception as e:
        return _create_error_response("league_of_legends", f"Voice analysis failed: {str(e)}", "voice", user_text)


















# import os
# import json
# import math
# import re
# from typing import Dict, Any, List, Optional
# from dotenv import load_dotenv

# load_dotenv()

# GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
# GENAI_TIMEOUT_SECONDS = int(os.getenv("GENAI_TIMEOUT_SECONDS", "20"))

# if not GEMINI_API_KEY:
#     raise RuntimeError("GEMINI_API_KEY not set in environment (.env or Cloud Run env)")

# # Use the modern client approach consistently
# try:
#     from google import genai
#     client = genai.Client(api_key=GEMINI_API_KEY)
#     _MODERN = True
# except ImportError:
#     # Fallback to legacy if modern not available
#     import google.generativeai as genai
#     genai.configure(api_key=GEMINI_API_KEY)
#     _MODERN = False

# def _call_gemini(prompt: str) -> str:
#     """
#     Stable Gemini API call that works with the modern google-genai client
#     """
#     try:
#         if _MODERN:
#             # Use the modern client with proper method
#             response = client.models.generate_content(
#                 model=GEMINI_MODEL,
#                 contents=[prompt],
#             )
            
#             # Modern client returns response with text attribute
#             if hasattr(response, 'text') and response.text:
#                 return response.text.strip()
#             else:
#                 # Fallback: try to extract from response structure
#                 return str(response).strip()
                
#         else:
#             # Legacy fallback
#             model = genai.GenerativeModel(GEMINI_MODEL)
#             response = model.generate_content(prompt)
#             return getattr(response, 'text', str(response)).strip()
            
#     except Exception as e:
#         raise RuntimeError(f"Gemini call failed: {str(e)}")

# def _score_to_rating(score: float) -> float:
#     """Normalize a 0..1 score to 1..10 rating (rounded to 1 decimal)."""
#     score_clamped = max(0.0, min(1.0, score))
#     return round(1.0 + score_clamped * 9.0, 1)

# def _parse_insights_to_structured(text: str) -> Dict[str, Any]:
#     """
#     Very small heuristic parser that tries to split the AI text into:
#     - top_tips: list[str]
#     - drills: list[str]
#     - explanation: str
#     - estimated_score: float (0..1)
#     If the AI returns plain text, this function will fallback gracefully.
#     """
#     lines = [l.strip() for l in text.splitlines() if l.strip()]
#     top_tips: List[str] = []
#     drills: List[str] = []
#     explanation_parts: List[str] = []
#     est_score: Optional[float] = None

#     for line in lines:
#         lowered = line.lower()
#         if lowered.startswith(("tip", "-", "•", "1.", "2.", "3.")):
#             # treat as tip/drill heuristically
#             if "drill" in lowered or "practice" in lowered or "train" in lowered:
#                 drills.append(line.lstrip("-•0123456789. ").strip())
#             else:
#                 top_tips.append(line.lstrip("-•0123456789. ").strip())
#         elif "score" in lowered or "%" in lowered:
#             # attempt to parse a number out
#             m = re.search(r"(\d{1,3})(?:\.\d+)?\s*%?", line)
#             if m:
#                 try:
#                     val = float(m.group(1))
#                     est_score = max(0.0, min(100.0, val)) / 100.0
#                 except Exception:
#                     pass
#             explanation_parts.append(line)
#         else:
#             explanation_parts.append(line)

#     # fallback: if no tips parsed, use first 3 sentences as tips
#     if not top_tips:
#         sentences = re.split(r'(?<=[.!?])\s+', text)
#         top_tips = [s.strip() for s in sentences[:3] if s.strip()]

#     if not drills:
#         drills = []

#     if est_score is None:
#         # synthetic scoring based on presence of 'good', 'poor', 'mistake' words
#         s = text.lower()
#         score = 0.5
#         if any(k in s for k in ["excellent", "well", "good", "great"]):
#             score += 0.2
#         if any(k in s for k in ["mistake", "poor", "bad", "missed"]):
#             score -= 0.2
#         est_score = max(0.0, min(1.0, score))

#     rating = _score_to_rating(est_score)

#     return {
#         "top_tips": top_tips,
#         "drills": drills,
#         "explanation": " ".join(explanation_parts).strip(),
#         "estimated_score": round(est_score, 3),
#         "rating": rating,
#         "raw_text": text,
#     }

# def analyze_lol_strategy(stats: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     stats: a dictionary with keys like:
#       - champion, role, kills, deaths, assists, cs, minute, objectives, team_comp (optional)
#     returns structured coaching advice dict
#     """
#     champion = stats.get("champion", "unknown")
#     role = stats.get("role", "unknown")
#     kills = stats.get("kills", 0)
#     deaths = stats.get("deaths", 0)
#     assists = stats.get("assists", 0)
#     cs = stats.get("cs", None)
#     minute = stats.get("minute", None)
#     objective_notes = stats.get("objectives", "")
#     team_desc = stats.get("team_comp", "")

#     # Build a focused prompt for Gemini
#     prompt = f"""
# You are NeuraPlay, an expert League of Legends coach. Given the player's in-game snapshot below,
# produce concise, actionable coaching advice in 3 bullets, suggest 2 training drills, and give a short performance rating (0-100%).
# Return a short plain-text analysis.

# Player snapshot:
# - Champion: {champion}
# - Role: {role}
# - K/D/A: {kills}/{deaths}/{assists}
# - CS: {cs if cs is not None else 'unknown'}
# - Game minute: {minute if minute is not None else 'unknown'}
# - Recent objective notes: {objective_notes}
# - Team composition / notes: {team_desc}

# Focus on:
# - Immediate next action (what the player should do in the next 1-2 minutes)
# - One mechanical improvement (how to practice it)
# - One strategic improvement (macro decision)
# - Keep the answer short (4-6 sentences), but include 3 clear tips and 2 practice drills.
# """
#     try:
#         text = _call_gemini(prompt)
#         structured = _parse_insights_to_structured(text)
#         structured["meta"] = {"game": "league_of_legends", "champion": champion, "role": role}
#         return structured
#     except Exception as e:
#         return {
#             "error": f"Analysis failed: {str(e)}",
#             "top_tips": [],
#             "drills": [],
#             "explanation": "",
#             "estimated_score": 0.5,
#             "rating": 5.0,
#             "raw_text": "",
#             "meta": {"game": "league_of_legends", "champion": champion, "role": role}
#         }

# def analyze_fifa_strategy(stats: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     stats: a dictionary with keys like:
#       - team, formation, possession_pct, scoreline, minute, key_events (list), player_position, stamina
#     returns structured coaching advice dict
#     """
#     team = stats.get("team", "unknown")
#     formation = stats.get("formation", "")
#     possession = stats.get("possession_pct", None)
#     scoreline = stats.get("scoreline", "")
#     minute = stats.get("minute", None)
#     events = stats.get("key_events", "")

#     prompt = f"""
# You are NeuraPlay, an expert football (EA FC / FIFA) tactical coach. Given the match snapshot below,
# produce concise, actionable coaching advice in 3 bullets, suggest 2 training drills, and give a short performance rating (0-100%).
# Return a short plain-text analysis.

# Match snapshot:
# - Team: {team}
# - Formation: {formation}
# - Possession: {possession if possession is not None else 'unknown'}
# - Scoreline: {scoreline}
# - Minute: {minute if minute is not None else 'unknown'}
# - Key events: {events}

# Focus on:
# - Immediate next tactical action (what to do in the next 2 minutes)
# - One mechanical improvement (passing, first touch, shooting)
# - One strategic improvement (formation change, pressing trigger)
# - Keep the answer short (4-6 sentences), include 3 clear tips and 2 practice drills.
# """
#     try:
#         text = _call_gemini(prompt)
#         structured = _parse_insights_to_structured(text)
#         structured["meta"] = {"game": "fifa", "team": team}
#         return structured
#     except Exception as e:
#         return {
#             "error": f"Analysis failed: {str(e)}",
#             "top_tips": [],
#             "drills": [],
#             "explanation": "",
#             "estimated_score": 0.5,
#             "rating": 5.0,
#             "raw_text": "",
#             "meta": {"game": "fifa", "team": team}
#         }

# def generate_coaching_advice(gameplay: str, game_type: str) -> Dict[str, Any]:
#     """
#     Generate coaching advice based on gameplay description and game type
#     """
#     if game_type == "lol":
#         # Extract basic info from gameplay description for League of Legends
#         payload = {
#             "champion": "unknown", 
#             "role": "unknown", 
#             "kills": 0,
#             "deaths": 0, 
#             "assists": 0,
#             "minute": 15,  # default mid-game
#             "objectives": gameplay,
#             "team_comp": "Standard composition",
#             "cs": 100  # default CS
#         }
#         return analyze_lol_strategy(payload)

#     elif game_type == "fifa":
#         # Extract basic info from gameplay description for FIFA
#         payload = {
#             "team": "unknown",
#             "formation": "4-3-3",  # default formation
#             "possession_pct": 50,  # default possession
#             "scoreline": "0-0",  # default score
#             "minute": 45,  # default minute
#             "key_events": gameplay
#         }
#         return analyze_fifa_strategy(payload)

#     else:
#         return {
#             "error": "Unsupported game type",
#             "top_tips": [],
#             "drills": [],
#             "explanation": f"Game type '{game_type}' is not supported. Currently supported: lol, fifa",
#             "estimated_score": 0.0,
#             "rating": 1.0,
#             "raw_text": ""
#         }

# # def analyze_fifa_voice_input(user_text: str) -> Dict[str, Any]:
# #     """
# #     Analyze free-form FIFA voice input and extract structured insights
# #     """
# #     prompt = f"""
# # You are an expert FIFA/EA FC analyst. A player is describing their gameplay issues in natural language.

# # Player's description: "{user_text}"

# # FIRST, extract the key gameplay elements mentioned:
# # - Team and formation (if mentioned)
# # - Current scoreline or match situation  
# # - Possession and control issues
# # - Defensive problems (conceding goals, defensive errors)
# # - Attacking problems (scoring chances, finishing)
# # - Specific events or patterns mentioned

# # SECOND, provide coaching advice based on the extracted context:
# # - 3 immediate tactical adjustments
# # - 2 specific practice drills to address the issues
# # - Performance rating (0-100%) based on described problems

# # Keep the analysis focused on the specific issues mentioned in the player's description.
# # Return your analysis in a structured format.
# # """
    
# #     try:
# #         text = _call_gemini(prompt)
# #         structured = _parse_insights_to_structured(text)
# #         structured["meta"] = {"game": "fifa", "input_type": "voice", "user_text": user_text}
# #         return structured
# #     except Exception as e:
# #         return {
# #             "error": f"Voice analysis failed: {str(e)}",
# #             "top_tips": [],
# #             "drills": [],
# #             "explanation": "",
# #             "estimated_score": 0.5,
# #             "rating": 5.0,
# #             "raw_text": "",
# #             "meta": {"game": "fifa", "input_type": "voice"}
# #         }

# # def analyze_lol_voice_input(user_text: str) -> Dict[str, Any]:
# #     """
# #     Analyze free-form League of Legends voice input and extract structured insights
# #     """
# #     prompt = f"""
# # You are an expert League of Legends coach. A player is describing their gameplay issues in natural language.

# # Player's description: "{user_text}"

# # FIRST, extract the key gameplay elements mentioned:
# # - Champion and role (if mentioned)
# # - Lane phase issues (CS, trading, positioning)
# # - Team fight problems (positioning, target selection)
# # - Objective control (dragons, barons, towers)
# # - Specific match situations described

# # SECOND, provide coaching advice based on the extracted context:
# # - 3 immediate in-game actions
# # - 2 specific practice drills to address the issues  
# # - Performance rating (0-100%) based on described problems

# # Focus on the specific pain points mentioned by the player.
# # Return your analysis in a structured format.
# # """
    
# #     try:
# #         text = _call_gemini(prompt)
# #         structured = _parse_insights_to_structured(text)
# #         structured["meta"] = {"game": "league_of_legends", "input_type": "voice", "user_text": user_text}
# #         return structured
# #     except Exception as e:
# #         return {
# #             "error": f"Voice analysis failed: {str(e)}",
# #             "top_tips": [],
# #             "drills": [],
# #             "explanation": "",
# #             "estimated_score": 0.5,
# #             "rating": 5.0,
# #             "raw_text": "",
# #             "meta": {"game": "league_of_legends", "input_type": "voice"}
# #         }


# def analyze_fifa_voice_input(user_text: str) -> Dict[str, Any]:
#     """
#     Analyze free-form FIFA voice input and extract structured insights
#     """
#     # Check if user wants detailed analysis
#     wants_detailed = "detailed" in user_text.lower()
    
#     if wants_detailed:
#         prompt = f"""
# You are an expert FIFA/EA FC analyst. A player is describing their gameplay issues in natural language.

# Player's description: "{user_text}"

# FIRST, extract the key gameplay elements mentioned:
# - Team and formation (if mentioned)
# - Current scoreline or match situation  
# - Possession and control issues
# - Defensive problems (conceding goals, defensive errors)
# - Attacking problems (scoring chances, finishing)
# - Specific events or patterns mentioned

# SECOND, provide detailed coaching advice based on the extracted context:
# - 3 immediate tactical adjustments
# - 2 specific practice drills to address the issues
# - Performance rating (0-100%) based on described problems

# Keep the analysis focused on the specific issues mentioned in the player's description.
# Return your analysis in a structured format.
# """
#     else:
#         prompt = f"""
# You are an expert FIFA/EA FC analyst. A player is describing their gameplay issues.

# Player's description: "{user_text}"

# Provide exactly 3 concise sentences of coaching advice:
# 1. Identify the main issue from their description
# 2. Suggest one immediate tactical adjustment  
# 3. Recommend one quick practice tip

# Keep it very brief and focused - maximum 3 sentences total.
# Do not include bullet points, lists, or ratings.
# """
    
#     try:
#         text = _call_gemini(prompt)
        
#         if wants_detailed:
#             # Use the existing structured parser for detailed responses
#             structured = _parse_insights_to_structured(text)
#             structured["meta"] = {"game": "fifa", "input_type": "voice", "user_text": user_text, "response_type": "detailed"}
#             return structured
#         else:
#             # For simple responses, create a minimal structured response
#             # Clean up the response to ensure it's exactly 3 sentences
#             sentences = re.split(r'(?<=[.!?])\s+', text.strip())
#             simple_summary = ' '.join(sentences[:3])  # Take first 3 sentences
            
#             return {
#                 "top_tips": [],
#                 "drills": [],
#                 "explanation": simple_summary,
#                 "estimated_score": None,  # No score for simple responses
#                 "rating": None,  # No rating for simple responses
#                 "raw_text": text,
#                 "meta": {"game": "fifa", "input_type": "voice", "user_text": user_text, "response_type": "simple"}
#             }
            
#     except Exception as e:
#         return {
#             "error": f"Voice analysis failed: {str(e)}",
#             "top_tips": [],
#             "drills": [],
#             "explanation": "",
#             "estimated_score": 0.5,
#             "rating": 5.0,
#             "raw_text": "",
#             "meta": {"game": "fifa", "input_type": "voice"}
#         }

# def analyze_lol_voice_input(user_text: str) -> Dict[str, Any]:
#     """
#     Analyze free-form League of Legends voice input and extract structured insights
#     """
#     # Check if user wants detailed analysis
#     wants_detailed = "detailed" in user_text.lower()
    
#     if wants_detailed:
#         prompt = f"""
# You are an expert League of Legends coach. A player is describing their gameplay issues in natural language.

# Player's description: "{user_text}"

# FIRST, extract the key gameplay elements mentioned:
# - Champion and role (if mentioned)
# - Lane phase issues (CS, trading, positioning)
# - Team fight problems (positioning, target selection)
# - Objective control (dragons, barons, towers)
# - Specific match situations described

# SECOND, provide detailed coaching advice based on the extracted context:
# - 3 immediate in-game actions
# - 2 specific practice drills to address the issues  
# - Performance rating (0-100%) based on described problems

# Focus on the specific pain points mentioned by the player.
# Return your analysis in a structured format.
# """
#     else:
#         prompt = f"""
# You are an expert League of Legends coach. A player is describing their gameplay issues.

# Player's description: "{user_text}"

# Provide exactly 3 concise sentences of coaching advice:
# 1. Identify the main issue from their description
# 2. Suggest one immediate in-game action  
# 3. Recommend one quick improvement tip

# Keep it very brief and focused - maximum 3 sentences total.
# Do not include bullet points, lists, or ratings.
# """
    
#     try:
#         text = _call_gemini(prompt)
        
#         if wants_detailed:
#             # Use the existing structured parser for detailed responses
#             structured = _parse_insights_to_structured(text)
#             structured["meta"] = {"game": "league_of_legends", "input_type": "voice", "user_text": user_text, "response_type": "detailed"}
#             return structured
#         else:
#             # For simple responses, create a minimal structured response
#             sentences = re.split(r'(?<=[.!?])\s+', text.strip())
#             simple_summary = ' '.join(sentences[:3])  # Take first 3 sentences
            
#             return {
#                 "top_tips": [],
#                 "drills": [],
#                 "explanation": simple_summary,
#                 "estimated_score": None,  # No score for simple responses
#                 "rating": None,  # No rating for simple responses
#                 "raw_text": text,
#                 "meta": {"game": "league_of_legends", "input_type": "voice", "user_text": user_text, "response_type": "simple"}
#             }
            
#     except Exception as e:
#         return {
#             "error": f"Voice analysis failed: {str(e)}",
#             "top_tips": [],
#             "drills": [],
#             "explanation": "",
#             "estimated_score": 0.5,
#             "rating": 5.0,
#             "raw_text": "",
#             "meta": {"game": "league_of_legends", "input_type": "voice"}
#         }

















# # neuraplay_ai/services/gemini_service.py
# import os
# import json
# import math
# from typing import Dict, Any, List, Optional

# # Try both modern and legacy clients — prefer google-genai if available
# try:
#     # modern client
#     from google import genai
#     _MODERN = True
# except Exception:
#     # fallback older package
#     import google.generativeai as genai
#     _MODERN = False

# from dotenv import load_dotenv

# load_dotenv()  # Only for local dev; Cloud Run will use env vars

# GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")  # override via env if needed
# GENAI_TIMEOUT_SECONDS = int(os.getenv("GENAI_TIMEOUT_SECONDS", "20"))

# if not GEMINI_API_KEY:
#     raise RuntimeError("GEMINI_API_KEY not set in environment (.env or Cloud Run env)")

# # Initialize client
# if _MODERN:
#     client = genai.Client(api_key=GEMINI_API_KEY)
# else:
#     genai.configure(api_key=GEMINI_API_KEY)
#     # older API uses model objects directly; we'll call via a wrapper below


# def _call_gemini(prompt: str, max_output_tokens: int = 512) -> str:
#     """
#     Call Gemini and return plain text output. This wrapper supports both `google-genai` and legacy `google.generativeai`.
#     """
#     try:
#         if _MODERN:
#             # modern usage: client.models.generate_content or client.models.generate
#             # we use generate_content which accepts `model` and `contents`
#             # keep a simple string payload; adjust if required by your installed version
#             resp = client.models.generate_content(
#                 model=GEMINI_MODEL,
#                 contents=[{"type": "text", "text": prompt}],
#                 max_output_tokens=max_output_tokens,
#                 timeout=GENAI_TIMEOUT_SECONDS,
#             )
#             # modern objects expose `.text` or a list of outputs; guard for both
#             if hasattr(resp, "text"):
#                 return resp.text
#             # some client versions return dict-like structures
#             try:
#                 return resp["candidates"][0]["content"]
#             except Exception:
#                 return str(resp)
#         else:
#             # legacy `google.generativeai` package
#             model = genai.GenerativeModel(GEMINI_MODEL)
#             # older method names vary — try generate_content then fallback to generate
#             try:
#                 response = model.generate_content(prompt)
#                 return getattr(response, "text", str(response))
#             except Exception:
#                 try:
#                     response = model.generate(prompt)
#                     return getattr(response, "text", str(response))
#                 except Exception:
#                     return str(response)
#     except Exception as e:
#         # bubble up a helpful message, but not the raw key
#         raise RuntimeError(f"Gemini call failed: {str(e)}")


# def _score_to_rating(score: float) -> float:
#     """Normalize a 0..1 score to 1..10 rating (rounded to 1 decimal)."""
#     score_clamped = max(0.0, min(1.0, score))
#     return round(1.0 + score_clamped * 9.0, 1)


# def _parse_insights_to_structured(text: str) -> Dict[str, Any]:
#     """
#     Very small heuristic parser that tries to split the AI text into:
#     - top_tips: list[str]
#     - drills: list[str]
#     - explanation: str
#     - estimated_score: float (0..1)
#     If the AI returns plain text, this function will fallback gracefully.
#     """
#     lines = [l.strip() for l in text.splitlines() if l.strip()]
#     top_tips: List[str] = []
#     drills: List[str] = []
#     explanation_parts: List[str] = []
#     est_score: Optional[float] = None

#     for line in lines:
#         lowered = line.lower()
#         if lowered.startswith(("tip", "-", "•", "1.", "2.", "3.")):
#             # treat as tip/drill heuristically
#             if "drill" in lowered or "practice" in lowered or "train" in lowered:
#                 drills.append(line.lstrip("-•0123456789. ").strip())
#             else:
#                 top_tips.append(line.lstrip("-•0123456789. ").strip())
#         elif "score" in lowered or "%" in lowered:
#             # attempt to parse a number out
#             import re
#             m = re.search(r"(\d{1,3})(?:\.\d+)?\s*%?", line)
#             if m:
#                 try:
#                     val = float(m.group(1))
#                     est_score = max(0.0, min(100.0, val)) / 100.0
#                 except Exception:
#                     pass
#             explanation_parts.append(line)
#         else:
#             explanation_parts.append(line)

#     # fallback: if no tips parsed, use first 3 sentences as tips
#     if not top_tips:
#         # naive sentence split
#         import re
#         sentences = re.split(r'(?<=[.!?])\s+', text)
#         top_tips = [s.strip() for s in sentences[:3] if s.strip()]

#     if not drills:
#         drills = []

#     if est_score is None:
#         # synthetic scoring based on presence of 'good', 'poor', 'mistake' words
#         s = text.lower()
#         score = 0.5
#         if any(k in s for k in ["excellent", "well", "good", "great"]):
#             score += 0.2
#         if any(k in s for k in ["mistake", "poor", "bad", "missed"]):
#             score -= 0.2
#         est_score = max(0.0, min(1.0, score))

#     rating = _score_to_rating(est_score)

#     return {
#         "top_tips": top_tips,
#         "drills": drills,
#         "explanation": " ".join(explanation_parts).strip(),
#         "estimated_score": round(est_score, 3),
#         "rating": rating,
#         "raw_text": text,
#     }


# def analyze_lol_strategy(stats: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     stats: a dictionary with keys like:
#       - champion, role, kills, deaths, assists, cs, minute, objectives, team_comp (optional)
#     returns structured coaching advice dict
#     """
#     champion = stats.get("champion", "unknown")
#     role = stats.get("role", "unknown")
#     kills = stats.get("kills", 0)
#     deaths = stats.get("deaths", 0)
#     assists = stats.get("assists", 0)
#     cs = stats.get("cs", None)
#     minute = stats.get("minute", None)
#     objective_notes = stats.get("objectives", "")
#     team_desc = stats.get("team_comp", "")

#     # Build a focused prompt for Gemini
#     prompt = f"""
# You are NeuraPlay, an expert League of Legends coach. Given the player's in-game snapshot below,
# produce concise, actionable coaching advice in 3 bullets, suggest 2 training drills, and give a short performance rating (0-100%).
# Return a short plain-text analysis.

# Player snapshot:
# - Champion: {champion}
# - Role: {role}
# - K/D/A: {kills}/{deaths}/{assists}
# - CS: {cs if cs is not None else 'unknown'}
# - Game minute: {minute if minute is not None else 'unknown'}
# - Recent objective notes: {objective_notes}
# - Team composition / notes: {team_desc}

# Focus on:
# - Immediate next action (what the player should do in the next 1-2 minutes)
# - One mechanical improvement (how to practice it)
# - One strategic improvement (macro decision)
# - Keep the answer short (4-6 sentences), but include 3 clear tips and 2 practice drills.
# """
#     text = _call_gemini(prompt)
#     structured = _parse_insights_to_structured(text)
#     structured["meta"] = {"game": "league_of_legends", "champion": champion, "role": role}
#     return structured


# def analyze_fifa_strategy(stats: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     stats: a dictionary with keys like:
#       - team, formation, possession_pct, scoreline, minute, key_events (list), player_position, stamina
#     returns structured coaching advice dict
#     """
#     team = stats.get("team", "unknown")
#     formation = stats.get("formation", "")
#     possession = stats.get("possession_pct", None)
#     scoreline = stats.get("scoreline", "")
#     minute = stats.get("minute", None)
#     events = stats.get("key_events", "")

#     prompt = f"""
# You are NeuraPlay, an expert football (EA FC / FIFA) tactical coach. Given the match snapshot below,
# produce concise, actionable coaching advice in 3 bullets, suggest 2 training drills, and give a short performance rating (0-100%).
# Return a short plain-text analysis.

# Match snapshot:
# - Team: {team}
# - Formation: {formation}
# - Possession: {possession if possession is not None else 'unknown'}
# - Scoreline: {scoreline}
# - Minute: {minute if minute is not None else 'unknown'}
# - Key events: {events}

# Focus on:
# - Immediate next tactical action (what to do in the next 2 minutes)
# - One mechanical improvement (passing, first touch, shooting)
# - One strategic improvement (formation change, pressing trigger)
# - Keep the answer short (4-6 sentences), include 3 clear tips and 2 practice drills.
# """
#     text = _call_gemini(prompt)
#     structured = _parse_insights_to_structured(text)
#     structured["meta"] = {"game": "fifa", "team": team}
#     return structured

# # def analyze_fifa_strategy(stats: Dict[str, Any]) -> Dict[str, Any]:
# #     """
# #     Accepts natural spoken match context and extracts:
# #     - scoreline, tactics, issues, strengths, minute, player concerns
# #     Then returns structured FIFA coaching advice.
# #     """

# #     user_text = stats.get("text", "").strip()

# #     if not user_text:
# #         raise ValueError("No speech text provided")

# #     prompt = f"""
# # You are **NeuraPlay**, an elite FIFA/EA FC tactical coach.
# # A player describes their current match situation using natural speech.
# # Your job: extract meaning and give **tailored coaching**.

# # PLAYER SPEECH:
# # \"\"\"{user_text}\"\"\"

# # You MUST:
# # 1️⃣ Extract specific game insights (even if uncertain):
# #    - Match score or goal difference
# #    - Formation (guessed if not stated)
# #    - Tactical struggles (ex: defending crosses, breaking lines)
# #    - Mechanical flaws (first touch, shooting timing, skill misuse)
# #    - Emotional struggle (rushed play, tilt, frustration)
# #    - Stamina or pressing concerns
# #    - Minute estimation (early/mid/late game)

# # 2️⃣ Provide **real actionable coaching**:
# #    ✅ 3 short tactical tips (1 sentence each)
# #    ✅ 2 practice drills relevant to the issue
# #    ✅ A 4-6 sentence tactical summary
# #    ✅ Performance rating (0-100%) w/ confidence score

# # Rules:
# # - NEVER say “I need more info” — infer always.
# # - NO generic advice — reflect exactly what the player says.
# # - Keep tone friendly coach, not generic assistant.
# # - Plain text output, short lines.
# # """

# #     text_output = _call_gemini(prompt)
# #     structured = _parse_insights_to_structured(text_output)

# #     structured["meta"] = {
# #         "game": "fifa",
# #         "source": "voice",
# #         "input_text": user_text[:200]  # store short reference
# #     }

# #     return structured

