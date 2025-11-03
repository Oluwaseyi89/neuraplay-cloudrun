# analysis/views.py
import base64
import threading
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from google.cloud import texttospeech
import firebase_admin
from firebase_admin import auth as firebase_auth
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from datetime import datetime, timedelta, timezone

from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
from neuraplay_ai.services.firestore_service import (
    save_fifa_analysis, 
    save_lol_analysis,
    get_recent_analyses
)

# Simple connection pooling for TTS clients
_tts_clients = {}
_tts_lock = threading.Lock()

def get_tts_client():
    """Thread-safe TTS client with simple connection pooling"""
    thread_id = threading.get_ident()
    
    with _tts_lock:
        if thread_id not in _tts_clients:
            try:
                _tts_clients[thread_id] = texttospeech.TextToSpeechClient()
                print(f"✅ Created TTS client for thread {thread_id}")
            except Exception as e:
                print(f"❌ Failed to create TTS client: {e}")
                return None
        return _tts_clients[thread_id]

@csrf_exempt
def health_check(request):
    return JsonResponse({
        "status": "healthy",
        "service": "neuraplay",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

# ----------------------
# Firebase JWT Verification
# ----------------------
def verify_firebase_token(id_token: str):
    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
        return decoded_token["uid"]
    except Exception:
        return None

# ----------------------
# Helper: Convert text to speech using GCP TTS
# ----------------------
def synthesize_speech(text: str):
    client = get_tts_client()  # Use pooled client
    if not client:
        raise Exception("TTS client not available")
    
    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code="en-US",
        ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
    )
    audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
    response = client.synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config
    )
    return response.audio_content

# ----------------------
# Helper: Build standardized response data for frontend
# ----------------------
def build_response_data(result: dict) -> dict:
    """Build standardized response data from Gemini result"""
    is_simple_response = result.get("rating") is None and result.get("estimated_score") is None
    
    if is_simple_response:
        return {
            "summary": result.get("explanation", "No summary"),
            "topTips": [],  # Empty for simple responses
            "trainingDrills": [],  # Empty for simple responses
            "rating": None,
            "confidence": None,
            "responseType": "simple"
        }
    else:
        return {
            "summary": result.get("explanation", "No summary"),
            "topTips": result.get("top_tips", []),
            "trainingDrills": result.get("drills", []),
            "rating": result.get("rating", None),
            "confidence": result.get("estimated_score", None),
            "responseType": "detailed"
        }

# ----------------------
# Helper: Save analysis to Firestore
# ----------------------
def save_analysis_data(user_id: str, user_text: str, result: dict, game: str):
    """Save analysis data to Firestore"""
    user_data = {"user_id": user_id, "text": user_text}
    
    try:
        if game == "fifa":
            save_fifa_analysis(user_data, result)  # Pass raw result directly
        else:
            save_lol_analysis(user_data, result)   # Pass raw result directly
        print(f"✅ Successfully saved {game} analysis for user {user_id}")
    except Exception as e:
        print(f"❌ Firestore Save Error for {game}: {e}")

# ----------------------
# Main Analysis Views
# ----------------------
@api_view(['POST'])
def analyze_fifa_voice(request):
    """Analyze FIFA gameplay from voice input"""
    # Authentication
    id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user_id = verify_firebase_token(id_token)
    if not user_id:
        return Response({"error": "Unauthorized"}, status=401)

    # Input validation
    user_text = request.data.get("stats")
    if not user_text:
        return Response({"error": "No text provided"}, status=400)

    try:
        # Analyze with Gemini
        result = analyze_fifa_voice_input(user_text)
        print("✅ FIFA Voice Analysis Result:", result)

        # Build frontend response
        response_data = build_response_data(result)

        # Save to Firestore - pass raw Gemini result
        save_analysis_data(user_id, user_text, result, "fifa")

        return Response(response_data)

    except Exception as e:
        print("❌ FIFA Voice Analysis Error:", e)
        return Response({"error": str(e)}, status=500)

@api_view(['POST']) 
def analyze_lol_voice(request):
    """Analyze LoL gameplay from voice input"""
    # Authentication
    id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user_id = verify_firebase_token(id_token)
    if not user_id:
        return Response({"error": "Unauthorized"}, status=401)

    # Input validation
    user_text = request.data.get("stats")
    if not user_text:
        return Response({"error": "No text provided"}, status=400)

    try:
        # Analyze with Gemini
        result = analyze_lol_voice_input(user_text)
        print("✅ LoL Voice Analysis Result:", result)

        # Build frontend response
        response_data = build_response_data(result)

        # Save to Firestore - pass raw Gemini result
        save_analysis_data(user_id, user_text, result, "lol")

        return Response(response_data)

    except Exception as e:
        print("❌ LoL Voice Analysis Error:", e)
        return Response({"error": str(e)}, status=500)

# ----------------------
# Recent Analyses Views
# ----------------------
@api_view(['GET'])
def get_recent_fifa_analyses(request):
    """Get recent FIFA analyses for authenticated user"""
    # Authentication
    id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user_id = verify_firebase_token(id_token)
    if not user_id:
        return Response({"error": "Unauthorized"}, status=401)

    try:
        # Get limit from query params, default to 10
        limit = int(request.GET.get('limit', 10))
        analyses = get_recent_analyses(user_id, 'fifa', limit)
        
        print(f"📊 Returning {len(analyses)} FIFA analyses for user {user_id}")
        
        return Response({
            "analyses": analyses,
            "count": len(analyses),
            "game": "fifa"
        })
    except Exception as e:
        print("❌ Error fetching recent FIFA analyses:", e)
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
def get_recent_lol_analyses(request):
    """Get recent LoL analyses for authenticated user"""
    # Authentication
    id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user_id = verify_firebase_token(id_token)
    if not user_id:
        return Response({"error": "Unauthorized"}, status=401)

    try:
        # Get limit from query params, default to 10
        limit = int(request.GET.get('limit', 10))
        analyses = get_recent_analyses(user_id, 'lol', limit)
        
        print(f"📊 Returning {len(analyses)} LoL analyses for user {user_id}")
        
        return Response({
            "analyses": analyses,
            "count": len(analyses),
            "game": "lol"
        })
    except Exception as e:
        print("❌ Error fetching recent LoL analyses:", e)
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
@csrf_exempt  # Since it's coming from extension
def analyze_browser_stats(request):
    """
    Analyze game stats from browser extension
    Reuses your existing analysis logic!
    """
    try:
        game = request.data.get('game')
        stats_data = request.data.get('stats', {})
        
        # Convert stats to text format for your existing analysis
        stats_text = _format_stats_for_analysis(stats_data, game)
        
        # Reuse your existing analysis functions!
        if game == 'lol':
            result = analyze_lol_voice_input(stats_text)
        elif game == 'fifa':
            result = analyze_fifa_voice_input(stats_text)
        else:
            return Response({"error": "Unsupported game"}, status=400)
        
        # Reuse your response formatting
        response_data = build_response_data(result)
        
        print(f"✅ Browser extension analysis completed for {game}")
        return Response(response_data)
        
    except Exception as e:
        print(f"❌ Browser analysis error: {e}")
        return Response({"error": str(e)}, status=500)

def _format_stats_for_analysis(stats, game):
    """Format scraped stats into text for analysis"""
    if game == 'lol':
        return f"""
        League of Legends Match Stats:
        KDA: {stats.get('kda', 'N/A')}
        CS: {stats.get('cs', 'N/A')}
        Vision Score: {stats.get('vision', 'N/A')}
        Damage: {stats.get('damage', 'N/A')}
        Gold: {stats.get('gold', 'N/A')}
        """
    elif game == 'fifa':
        return f"""
        FIFA Match Stats:
        Possession: {stats.get('possession', 'N/A')}
        Shots: {stats.get('shots', 'N/A')}
        Pass Accuracy: {stats.get('passes', 'N/A')}
        Tackles: {stats.get('tackles', 'N/A')}
        Score: {stats.get('score', 'N/A')}
        """

















# # analysis/views.py
# import base64
# from rest_framework.decorators import api_view
# from rest_framework.response import Response
# from rest_framework import status
# from google.cloud import texttospeech
# import firebase_admin
# from firebase_admin import auth as firebase_auth
# from django.views.decorators.csrf import csrf_exempt
# from django.http import JsonResponse
# from datetime import datetime, timedelta, timezone



# from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
# from neuraplay_ai.services.firestore_service import (
#     save_fifa_analysis, 
#     save_lol_analysis,
#     get_recent_analyses
# )


# @csrf_exempt
# def health_check(request):
#     return JsonResponse({
#         "status": "healthy",
#         "service": "neuraplay",
#         "timestamp": datetime.now(timezone.utc).isoformat()
#     })

# # ----------------------
# # Firebase JWT Verification
# # ----------------------
# def verify_firebase_token(id_token: str):
#     try:
#         decoded_token = firebase_auth.verify_id_token(id_token)
#         return decoded_token["uid"]
#     except Exception:
#         return None

# # ----------------------
# # Helper: Convert text to speech using GCP TTS
# # ----------------------
# def synthesize_speech(text: str):
#     client = texttospeech.TextToSpeechClient()
#     synthesis_input = texttospeech.SynthesisInput(text=text)
#     voice = texttospeech.VoiceSelectionParams(
#         language_code="en-US",
#         ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
#     )
#     audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
#     response = client.synthesize_speech(
#         input=synthesis_input, voice=voice, audio_config=audio_config
#     )
#     return response.audio_content

# # ----------------------
# # Helper: Build standardized response data for frontend
# # ----------------------
# def build_response_data(result: dict) -> dict:
#     """Build standardized response data from Gemini result"""
#     is_simple_response = result.get("rating") is None and result.get("estimated_score") is None
    
#     if is_simple_response:
#         return {
#             "summary": result.get("explanation", "No summary"),
#             "topTips": [],  # Empty for simple responses
#             "trainingDrills": [],  # Empty for simple responses
#             "rating": None,
#             "confidence": None,
#             "responseType": "simple"
#         }
#     else:
#         return {
#             "summary": result.get("explanation", "No summary"),
#             "topTips": result.get("top_tips", []),
#             "trainingDrills": result.get("drills", []),
#             "rating": result.get("rating", None),
#             "confidence": result.get("estimated_score", None),
#             "responseType": "detailed"
#         }

# # ----------------------
# # Helper: Save analysis to Firestore
# # ----------------------
# def save_analysis_data(user_id: str, user_text: str, result: dict, game: str):
#     """Save analysis data to Firestore"""
#     user_data = {"user_id": user_id, "text": user_text}
    
#     try:
#         if game == "fifa":
#             save_fifa_analysis(user_data, result)  # Pass raw result directly
#         else:
#             save_lol_analysis(user_data, result)   # Pass raw result directly
#         print(f"✅ Successfully saved {game} analysis for user {user_id}")
#     except Exception as e:
#         print(f"❌ Firestore Save Error for {game}: {e}")

# # ----------------------
# # Main Analysis Views
# # ----------------------
# @api_view(['POST'])
# def analyze_fifa_voice(request):
#     """Analyze FIFA gameplay from voice input"""
#     # Authentication
#     id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
#     user_id = verify_firebase_token(id_token)
#     if not user_id:
#         return Response({"error": "Unauthorized"}, status=401)

#     # Input validation
#     user_text = request.data.get("stats")
#     if not user_text:
#         return Response({"error": "No text provided"}, status=400)

#     try:
#         # Analyze with Gemini
#         result = analyze_fifa_voice_input(user_text)
#         print("✅ FIFA Voice Analysis Result:", result)

#         # Build frontend response
#         response_data = build_response_data(result)

#         # Save to Firestore - pass raw Gemini result
#         save_analysis_data(user_id, user_text, result, "fifa")

#         return Response(response_data)

#     except Exception as e:
#         print("❌ FIFA Voice Analysis Error:", e)
#         return Response({"error": str(e)}, status=500)

# @api_view(['POST']) 
# def analyze_lol_voice(request):
#     """Analyze LoL gameplay from voice input"""
#     # Authentication
#     id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
#     user_id = verify_firebase_token(id_token)
#     if not user_id:
#         return Response({"error": "Unauthorized"}, status=401)

#     # Input validation
#     user_text = request.data.get("stats")
#     if not user_text:
#         return Response({"error": "No text provided"}, status=400)

#     try:
#         # Analyze with Gemini
#         result = analyze_lol_voice_input(user_text)
#         print("✅ LoL Voice Analysis Result:", result)

#         # Build frontend response
#         response_data = build_response_data(result)

#         # Save to Firestore - pass raw Gemini result
#         save_analysis_data(user_id, user_text, result, "lol")

#         return Response(response_data)

#     except Exception as e:
#         print("❌ LoL Voice Analysis Error:", e)
#         return Response({"error": str(e)}, status=500)

# # ----------------------
# # Recent Analyses Views
# # ----------------------
# @api_view(['GET'])
# def get_recent_fifa_analyses(request):
#     """Get recent FIFA analyses for authenticated user"""
#     # Authentication
#     id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
#     user_id = verify_firebase_token(id_token)
#     if not user_id:
#         return Response({"error": "Unauthorized"}, status=401)

#     try:
#         # Get limit from query params, default to 10
#         limit = int(request.GET.get('limit', 10))
#         analyses = get_recent_analyses(user_id, 'fifa', limit)
        
#         print(f"📊 Returning {len(analyses)} FIFA analyses for user {user_id}")
        
#         return Response({
#             "analyses": analyses,
#             "count": len(analyses),
#             "game": "fifa"
#         })
#     except Exception as e:
#         print("❌ Error fetching recent FIFA analyses:", e)
#         return Response({"error": str(e)}, status=500)

# @api_view(['GET'])
# def get_recent_lol_analyses(request):
#     """Get recent LoL analyses for authenticated user"""
#     # Authentication
#     id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
#     user_id = verify_firebase_token(id_token)
#     if not user_id:
#         return Response({"error": "Unauthorized"}, status=401)

#     try:
#         # Get limit from query params, default to 10
#         limit = int(request.GET.get('limit', 10))
#         analyses = get_recent_analyses(user_id, 'lol', limit)
        
#         print(f"📊 Returning {len(analyses)} LoL analyses for user {user_id}")
        
#         return Response({
#             "analyses": analyses,
#             "count": len(analyses),
#             "game": "lol"
#         })
#     except Exception as e:
#         print("❌ Error fetching recent LoL analyses:", e)
#         return Response({"error": str(e)}, status=500)

# @api_view(['POST'])
# @csrf_exempt  # Since it's coming from extension
# def analyze_browser_stats(request):
#     """
#     Analyze game stats from browser extension
#     Reuses your existing analysis logic!
#     """
#     try:
#         game = request.data.get('game')
#         stats_data = request.data.get('stats', {})
        
#         # Convert stats to text format for your existing analysis
#         stats_text = _format_stats_for_analysis(stats_data, game)
        
#         # Reuse your existing analysis functions!
#         if game == 'lol':
#             result = analyze_lol_voice_input(stats_text)
#         elif game == 'fifa':
#             result = analyze_fifa_voice_input(stats_text)
#         else:
#             return Response({"error": "Unsupported game"}, status=400)
        
#         # Reuse your response formatting
#         response_data = build_response_data(result)
        
#         print(f"✅ Browser extension analysis completed for {game}")
#         return Response(response_data)
        
#     except Exception as e:
#         print(f"❌ Browser analysis error: {e}")
#         return Response({"error": str(e)}, status=500)

# def _format_stats_for_analysis(stats, game):
#     """Format scraped stats into text for analysis"""
#     if game == 'lol':
#         return f"""
#         League of Legends Match Stats:
#         KDA: {stats.get('kda', 'N/A')}
#         CS: {stats.get('cs', 'N/A')}
#         Vision Score: {stats.get('vision', 'N/A')}
#         Damage: {stats.get('damage', 'N/A')}
#         Gold: {stats.get('gold', 'N/A')}
#         """
#     elif game == 'fifa':
#         return f"""
#         FIFA Match Stats:
#         Possession: {stats.get('possession', 'N/A')}
#         Shots: {stats.get('shots', 'N/A')}
#         Pass Accuracy: {stats.get('passes', 'N/A')}
#         Tackles: {stats.get('tackles', 'N/A')}
#         Score: {stats.get('score', 'N/A')}
#         """

