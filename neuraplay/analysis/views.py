# analysis/views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from google.cloud import texttospeech
import firebase_admin
from firebase_admin import auth as firebase_auth

from neuraplay_ai.services.gemini_service import analyze_lol_strategy, analyze_fifa_strategy, \
analyze_fifa_voice_input, analyze_lol_voice_input
from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis

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
    client = texttospeech.TextToSpeechClient()
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
# Analyze LoL from voice
# ----------------------
# @api_view(['POST'])
# def analyze_lol_voice(request):
#     id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
#     user_id = verify_firebase_token(id_token)
#     if not user_id:
#         return Response({"error": "Unauthorized"}, status=401)

#     text = request.data.get("stats")
#     if not text:
#         return Response({"error": "No text provided"}, status=400)

#     try:
#         result = analyze_lol_strategy({"text": text})
        
#         # Save to Firestore (non-blocking)
#         try:
#             save_lol_analysis({"user_id": user_id, "text": text}, result)
#         except Exception as e:
#             print(f"Failed to save LoL analysis: {e}")

#         # Convert result to speech
#         audio_content = synthesize_speech(result.get("recommendation", "No recommendation"))

#         return Response({"audio": audio_content})
#     except Exception as e:
#         return Response({"error": str(e)}, status=500)

# ----------------------
# Analyze FIFA from voice
# ----------------------

# @api_view(['POST'])
# def analyze_fifa_voice(request):
#     id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
#     user_id = verify_firebase_token(id_token)

#     if not user_id:
#         return Response({"error": "Unauthorized"}, status=401)

#     text = request.data.get("stats")
#     if not text:
#         return Response({"error": "No text provided"}, status=400)

#     try:
#         result = analyze_fifa_strategy({"text": text})
#         print("✅ FIFA Analysis Result:", result)

#         response_data = {
#             "summary": result.get("explanation", "No summary"),
#             "topTips": result.get("top_tips", []),
#             "trainingDrills": result.get("drills", []),
#             "rating": result.get("rating", None),
#             "confidence": result.get("estimated_score", None),
#         }

#         # Save in Firestore
#         try:
#             save_fifa_analysis({"user_id": user_id, "text": text}, response_data)
#         except Exception as e:
#             print("⚠️ Firestore Save Error:", e)

#         return Response(response_data)

#     except Exception as e:
#         print("❌ FIFA Strategy Error:", e)
#         return Response({"error": str(e)}, status=500)


# @api_view(['POST'])
# def analyze_fifa_voice(request):
#     id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
#     user_id = verify_firebase_token(id_token)
#     if not user_id:
#         return Response({"error": "Unauthorized"}, status=401)

#     text = request.data.get("stats")
#     if not text:
#         return Response({"error": "No text provided"}, status=400)

#     try:
#         result = analyze_fifa_strategy({"text": text})
        
#         # Save to Firestore (non-blocking)
#         try:
#             save_fifa_analysis({"user_id": user_id, "text": text}, result)
#         except Exception as e:
#             print(f"Failed to save FIFA analysis: {e}")

#         # Convert result to speech
#         audio_content = synthesize_speech(result.get("recommendation", "No recommendation"))

#         return Response({"audio": audio_content})
#     except Exception as e:
#         return Response({"error": str(e)}, status=500)

@api_view(['POST'])
def analyze_fifa_voice(request):
    id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user_id = verify_firebase_token(id_token)

    if not user_id:
        return Response({"error": "Unauthorized"}, status=401)

    user_text = request.data.get("stats")  # This is the free-form text from voice
    if not user_text:
        return Response({"error": "No text provided"}, status=400)

    try:
        # Use the new voice analysis function instead of the structured one
        result = analyze_fifa_voice_input(user_text)
        print("✅ FIFA Voice Analysis Result:", result)

        response_data = {
            "summary": result.get("explanation", "No summary"),
            "topTips": result.get("top_tips", []),
            "trainingDrills": result.get("drills", []),
            "rating": result.get("rating", None),
            "confidence": result.get("estimated_score", None),
        }

        # Save in Firestore
        try:
            save_fifa_analysis({"user_id": user_id, "text": user_text}, response_data)
        except Exception as e:
            print("⚠️ Firestore Save Error:", e)

        return Response(response_data)

    except Exception as e:
        print("❌ FIFA Voice Analysis Error:", e)
        return Response({"error": str(e)}, status=500)

@api_view(['POST']) 
def analyze_lol_voice(request):
    id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user_id = verify_firebase_token(id_token)

    if not user_id:
        return Response({"error": "Unauthorized"}, status=401)

    user_text = request.data.get("stats")
    if not user_text:
        return Response({"error": "No text provided"}, status=400)

    try:
        # Use the new voice analysis function for LoL
        result = analyze_lol_voice_input(user_text)
        print("✅ LoL Voice Analysis Result:", result)

        response_data = {
            "summary": result.get("explanation", "No summary"),
            "topTips": result.get("top_tips", []),
            "trainingDrills": result.get("drills", []),
            "rating": result.get("rating", None),
            "confidence": result.get("estimated_score", None),
        }

        # Save in Firestore
        try:
            save_lol_analysis({"user_id": user_id, "text": user_text}, response_data)
        except Exception as e:
            print("⚠️ Firestore Save Error:", e)

        return Response(response_data)

    except Exception as e:
        print("❌ LoL Voice Analysis Error:", e)
        return Response({"error": str(e)}, status=500)










# # analysis/views.py
# from rest_framework.decorators import api_view
# from rest_framework.response import Response
# from rest_framework import status

# from neuraplay_ai.services.gemini_service import analyze_lol_strategy, analyze_fifa_strategy
# # from neuraplay.firebase_client import save_fifa_analysis, save_lol_analysis  # add save_lol_analysis similarly if needed

# from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis


# @api_view(['POST'])
# def analyze_lol(request):
#     stats = request.data
#     if not stats:
#         return Response({"error": "Missing stats."}, status=400)
#     try:
#         result = analyze_lol_strategy(stats)
        
#         # Firestore save (non-blocking, no effect on response)
#         try:
#             save_lol_analysis(stats, result)
#         except Exception as e:
#             # Log the error but do not break the API
#             print(f"Failed to save LoL analysis: {e}")
        
#         return Response(result)
#     except Exception as e:
#         return Response({"error": str(e)}, status=500)

# @api_view(['POST'])
# def analyze_fifa(request):
#     stats = request.data
#     if not stats:
#         return Response({"error": "Missing match stats"}, status=status.HTTP_400_BAD_REQUEST)
#     try:
#         response = analyze_fifa_strategy(stats)
        
#         # Firestore save (non-blocking)
#         try:
#             save_fifa_analysis(stats, response)
#         except Exception as e:
#             # Log the error but do not break the API
#             print(f"Failed to save FIFA analysis: {e}")
        
#         return Response(response)
#     except Exception as e:
#         return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)















# # analysis/views.py
# from rest_framework.decorators import api_view
# from rest_framework.response import Response
# from rest_framework import status

# from neuraplay_ai.services.gemini_service import analyze_lol_strategy, analyze_fifa_strategy

# @api_view(['POST'])
# def analyze_lol(request):
#     stats = request.data
#     if not stats:
#         return Response({"error": "Missing stats."}, status=400)
#     try:
#         result = analyze_lol_strategy(stats)
#         return Response(result)
#     except Exception as e:
#         return Response({"error": str(e)}, status=500)

# @api_view(['POST'])
# def analyze_fifa(request):
#     stats = request.data
#     if not stats:
#         return Response({"error": "Missing match stats"}, status=status.HTTP_400_BAD_REQUEST)
#     try:
#         response = analyze_fifa_strategy(stats)
#         return Response(response)
#     except Exception as e:
#         return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


