# analysis/views.py
import base64
import json
import os
import threading
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from google.oauth2 import service_account
from google.cloud import texttospeech
from google.cloud import speech
import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials as firebase_credentials
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from datetime import datetime, timedelta, timezone

from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
from neuraplay_ai.services.firestore_service import (
    save_fifa_analysis, 
    save_lol_analysis,
    get_recent_analyses
)

# Initialize Firebase Admin with existing base64 credentials
def initialize_firebase():
    """Initialize Firebase Admin with base64 credentials"""
    try:
        # Check if already initialized
        if not firebase_admin._apps:
            base64_creds = os.environ.get('FIREBASE_CREDENTIALS_BASE64')
            if not base64_creds:
                raise ValueError("FIREBASE_CREDENTIALS_BASE64 environment variable not set")
            
            # Decode base64 credentials
            credentials_json = base64.b64decode(base64_creds).decode('utf-8')
            credentials_info = json.loads(credentials_json)
            
            # Initialize Firebase
            creds = firebase_credentials.Certificate(credentials_info)
            firebase_admin.initialize_app(creds)
            print("✅ Firebase Admin initialized successfully")
        return True
    except Exception as e:
        print(f"❌ Firebase Admin initialization failed: {e}")
        return False

# Initialize Firebase on module import
firebase_initialized = initialize_firebase()

# Google Cloud clients with shared credentials
_google_clients = {}
_google_lock = threading.Lock()

def get_google_credentials():
    """Get Google Cloud credentials from FIREBASE_CREDENTIALS_BASE64"""
    try:
        base64_creds = os.environ.get('FIREBASE_CREDENTIALS_BASE64')
        if not base64_creds:
            raise ValueError("FIREBASE_CREDENTIALS_BASE64 environment variable not set")
        
        # Decode base64 credentials
        credentials_json = base64.b64decode(base64_creds).decode('utf-8')
        credentials_info = json.loads(credentials_json)
        
        # Create Google Cloud credentials
        return service_account.Credentials.from_service_account_info(credentials_info)
    except Exception as e:
        print(f"❌ Failed to get Google credentials: {e}")
        return None

def get_speech_client():
    """Thread-safe Speech client using Firebase credentials"""
    thread_id = threading.get_ident()
    
    with _google_lock:
        if f"speech_{thread_id}" not in _google_clients:
            try:
                google_creds = get_google_credentials()
                if not google_creds:
                    return None
                
                _google_clients[f"speech_{thread_id}"] = speech.SpeechClient(credentials=google_creds)
                print(f"✅ Created Speech client for thread {thread_id}")
            except Exception as e:
                print(f"❌ Failed to create Speech client: {e}")
                return None
        return _google_clients[f"speech_{thread_id}"]

def get_tts_client():
    """Thread-safe TTS client using Firebase credentials"""
    thread_id = threading.get_ident()
    
    with _google_lock:
        if f"tts_{thread_id}" not in _google_clients:
            try:
                google_creds = get_google_credentials()
                if not google_creds:
                    return None
                
                _google_clients[f"tts_{thread_id}"] = texttospeech.TextToSpeechClient(credentials=google_creds)
                print(f"✅ Created TTS client for thread {thread_id}")
            except Exception as e:
                print(f"❌ Failed to create TTS client: {e}")
                return None
        return _google_clients[f"tts_{thread_id}"]

@csrf_exempt
def health_check(request):
    """Health check endpoint"""
    services_status = {
        "firebase": firebase_initialized,
        "speech_client": get_speech_client() is not None,
        "tts_client": get_tts_client() is not None
    }
    
    return JsonResponse({
        "status": "healthy",
        "service": "neuraplay",
        "services": services_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

# ----------------------
# Firebase JWT Verification
# ----------------------
def verify_firebase_token(id_token: str):
    """Verify Firebase JWT token"""
    if not firebase_initialized:
        print("❌ Firebase not initialized")
        return None
        
    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
        return decoded_token["uid"]
    except Exception as e:
        print(f"❌ Firebase token verification failed: {e}")
        return None

# ----------------------
# Helper: Convert text to speech using GCP TTS
# ----------------------
def synthesize_speech(text: str):
    """Convert text to speech using Google TTS"""
    client = get_tts_client()
    if not client:
        raise Exception("TTS client not available")
    
    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code="en-US",
        ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
    )
    audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
    
    try:
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
        return response.audio_content
    except Exception as e:
        print(f"❌ TTS synthesis failed: {e}")
        raise

# ----------------------
# Helper: Transcribe audio using Google Speech-to-Text
# ----------------------
def transcribe_audio(audio_content: bytes):
    """Transcribe audio using Google Speech-to-Text"""
    client = get_speech_client()
    if not client:
        raise Exception("Speech client not available")
    
    audio = speech.RecognitionAudio(content=audio_content)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
        sample_rate_hertz=48000,
        audio_channel_count=1,
        language_code="en-US",
        enable_automatic_punctuation=True,
        model='command_and_search'
    )
    
    try:
        response = client.recognize(config=config, audio=audio)
        return response
    except Exception as e:
        print(f"❌ Speech-to-Text failed: {e}")
        raise

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
    if not firebase_initialized:
        print("⚠️ Firebase not initialized, skipping Firestore save")
        return
        
    user_data = {"user_id": user_id, "text": user_text}
    
    try:
        if game == "fifa":
            save_fifa_analysis(user_data, result)
        else:
            save_lol_analysis(user_data, result)
        print(f"✅ Successfully saved {game} analysis for user {user_id}")
    except Exception as e:
        print(f"❌ Firestore Save Error for {game}: {e}")

# ----------------------
# HTTP Voice Processing Endpoint (Mobile)
# ----------------------
@api_view(['POST'])
@csrf_exempt
def process_voice_input(request):
    """HTTP equivalent of WebSocket voice processing - single endpoint for mobile"""
    # Authentication
    id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user_id = verify_firebase_token(id_token)
    if not user_id:
        return Response({"error": "Unauthorized"}, status=401)

    # Check if audio file is provided
    if 'audio' not in request.FILES:
        return Response({"error": "No audio file provided"}, status=400)
    
    audio_file = request.FILES['audio']
    game = request.POST.get('game', 'fifa')
    
    try:
        # Step 1: Transcribe audio
        audio_content = audio_file.read()
        
        if not audio_content or len(audio_content) == 0:
            return Response({"error": "No audio data received"}, status=400)
        
        # Transcribe using Google Speech-to-Text
        response = transcribe_audio(audio_content)
        
        if not response.results:
            return Response({
                "transcript": "[No speech detected]", 
                "analysis": {
                    "summary": "No speech was detected in the audio. Please try speaking clearly.",
                    "topTips": [],
                    "trainingDrills": [],
                    "rating": None,
                    "confidence": None,
                    "responseType": "simple"
                }
            })
        
        transcript = " ".join([result.alternatives[0].transcript for result in response.results])
        print(f"✅ HTTP Transcription successful: '{transcript}'")

        # Step 2: Analyze with Gemini
        if game == "lol":
            gemini_result = analyze_lol_voice_input(transcript)
        else:
            gemini_result = analyze_fifa_voice_input(transcript)

        # Step 3: Build response data
        response_data = build_response_data(gemini_result)

        # Step 4: Save to Firestore
        save_analysis_data(user_id, transcript, gemini_result, game)

        # Step 5: Generate TTS
        tts_audio_b64 = None
        try:
            tts_text = response_data.get("summary", "No analysis available.")
            audio_bytes = synthesize_speech(tts_text)
            tts_audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            print("✅ TTS generation successful")
        except Exception as tts_error:
            print(f"⚠️ TTS failed but continuing: {tts_error}")
            # Don't fail the whole request if TTS fails

        # Return same structure as WebSocket for frontend compatibility
        response_payload = {
            "transcript": transcript,
            "analysis": response_data
        }
        
        if tts_audio_b64:
            response_payload["tts_audio"] = tts_audio_b64
        
        return Response(response_payload)

    except Exception as e:
        print(f"❌ HTTP Voice processing error: {e}")
        return Response({"error": f"Voice processing failed: {str(e)}"}, status=500)

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

        # Save to Firestore
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

        # Save to Firestore
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

# ----------------------
# Browser Extension Support
# ----------------------
@api_view(['POST'])
@csrf_exempt
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
# import threading
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

# # Simple connection pooling for TTS clients
# _tts_clients = {}
# _tts_lock = threading.Lock()

# def get_tts_client():
#     """Thread-safe TTS client with simple connection pooling"""
#     thread_id = threading.get_ident()
    
#     with _tts_lock:
#         if thread_id not in _tts_clients:
#             try:
#                 _tts_clients[thread_id] = texttospeech.TextToSpeechClient()
#                 print(f"✅ Created TTS client for thread {thread_id}")
#             except Exception as e:
#                 print(f"❌ Failed to create TTS client: {e}")
#                 return None
#         return _tts_clients[thread_id]

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
#     client = get_tts_client()  # Use pooled client
#     if not client:
#         raise Exception("TTS client not available")
    
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
