import json
import base64
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from channels.generic.websocket import AsyncWebsocketConsumer
from google.cloud import speech
from google.cloud import texttospeech
from google.oauth2 import service_account

from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis
from analysis.views import verify_firebase_token, build_response_data


class VoiceAnalysisConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.speech_client = None
        self.tts_client = None
        self.user_id = None
        self.buffered_audio = b""
        self.game = "fifa"
        # Create thread pool for running sync Google API calls
        self.thread_pool = ThreadPoolExecutor(max_workers=3)
        self._initialize_clients()
    
    def _initialize_clients(self):
        """Initialize Google Cloud clients with base64 credentials"""
        try:
            credentials_b64 = os.environ.get('FIREBASE_CREDENTIALS_BASE64')
            
            if credentials_b64:
                # Decode base64 to JSON
                credentials_json = base64.b64decode(credentials_b64).decode('utf-8')
                credentials_info = json.loads(credentials_json)
                
                # Create credentials object
                credentials = service_account.Credentials.from_service_account_info(credentials_info)
                
                # Initialize clients with credentials
                self.speech_client = speech.SpeechClient(credentials=credentials)
                self.tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
                print("✅ Google Cloud clients initialized with base64 credentials")
            else:
                # Fallback to default credentials
                self.speech_client = speech.SpeechClient()
                self.tts_client = texttospeech.TextToSpeechClient()
                print("✅ Google Cloud clients initialized with default credentials")
                
        except Exception as e:
            print(f"❌ Failed to initialize Google Cloud clients: {e}")
            self.speech_client = None
            self.tts_client = None

    async def connect(self):
        await self.accept()

    async def receive(self, text_data=None, bytes_data=None):
        data = json.loads(text_data)
        message_type = data.get("type")

        if message_type == "auth":
            await self._handle_auth(data)
        elif message_type == "audio_chunk":
            await self._handle_audio_chunk(data)
        elif message_type == "speech_end":
            await self._handle_speech_end(data)

    async def _handle_auth(self, data):
        """Handle authentication"""
        id_token = data.get("token", "")
        user_id = verify_firebase_token(id_token)
        
        if not user_id:
            await self.send_json({"error": "Unauthorized"})
            await self.close()
            return
            
        self.user_id = user_id
        await self.send_json({"status": "authenticated"})

    async def _handle_audio_chunk(self, data):
        """Handle incoming audio chunks"""
        chunk = base64.b64decode(data["audio_base64"])
        self.buffered_audio += chunk

    async def _handle_speech_end(self, data):
        """Handle end of speech - transcribe, analyze, and respond"""
        if not self.user_id:
            await self.send_json({"error": "Not authenticated"})
            return

        game = data.get("game", "fifa")
        self.game = game

        # Transcribe audio (async)
        transcript = await self._transcribe_audio(self.buffered_audio)
        await self.send_json({"transcript": transcript})

        # Analyze with Gemini
        try:
            if game == "lol":
                gemini_result = analyze_lol_voice_input(transcript)
            else:
                gemini_result = analyze_fifa_voice_input(transcript)
        except Exception as e:
            await self.send_json({"error": f"Analysis failed: {str(e)}"})
            return

        # Build structured response data for frontend
        response_data = build_response_data(gemini_result)

        # Save to Firestore - PASS RAW GEMINI RESULT for proper storage
        try:
            user_data = {"user_id": self.user_id, "text": transcript}
            if game == "lol":
                save_lol_analysis(user_data, gemini_result)  # ✅ Save raw Gemini result
            else:
                save_fifa_analysis(user_data, gemini_result)  # ✅ Save raw Gemini result
            print(f"✅ Saved {game} analysis to Firestore")
        except Exception as e:
            print(f"❌ Firestore Save Error: {e}")

        # Generate TTS response (async with timeout)
        try:
            # Use the summary for TTS
            tts_text = response_data.get("summary", "No analysis available.")
            audio_bytes = await self._synthesize_speech(tts_text)
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            
            # Send structured response data to frontend
            await self.send_json({
                "analysis": response_data,  # ← Formatted data for frontend
                "tts_audio": audio_b64
            })
        except Exception as e:
            await self.send_json({
                "analysis": response_data,  # ← Still send analysis even if TTS fails
                "error": f"TTS failed: {str(e)}"
            })

        # Reset buffer
        self.buffered_audio = b""

    async def _transcribe_audio(self, audio_bytes: bytes) -> str:
        """Transcribe audio using Google Speech-to-Text (async)"""
        if not self.speech_client:
            return "[Speech-to-Text not available]"
        
        if not audio_bytes or len(audio_bytes) == 0:
            return "[No audio data received]"
        
        try:
            # Run speech recognition in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            transcript = await asyncio.wait_for(
                loop.run_in_executor(
                    self.thread_pool,
                    self._transcribe_audio_sync,
                    audio_bytes
                ),
                timeout=15.0  # 15 second timeout for speech recognition
            )
            return transcript
            
        except asyncio.TimeoutError:
            print("❌ Speech recognition timeout after 15 seconds")
            return "[Speech recognition timeout]"
        except Exception as e:
            print(f"❌ Speech recognition error: {e}")
            return f"[Transcription error: {str(e)}]"

    def _transcribe_audio_sync(self, audio_bytes: bytes) -> str:
        """Synchronous speech recognition - runs in thread pool"""
        try:
            audio = speech.RecognitionAudio(content=audio_bytes)
            
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                sample_rate_hertz=48000,
                audio_channel_count=1,
                language_code="en-US",
                enable_automatic_punctuation=True,
                model='command_and_search'
            )
            
            response = self.speech_client.recognize(config=config, audio=audio)
            
            if response.results:
                transcript = " ".join([r.alternatives[0].transcript for r in response.results])
                print(f"✅ Transcription successful: '{transcript}'")
                return transcript
            else:
                return "[No speech detected]"
            
        except Exception as e:
            print(f"❌ Speech recognition sync error: {e}")
            # Try fallback config
            try:
                config = speech.RecognitionConfig(
                    encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                    sample_rate_hertz=None,  # Auto-detect
                    audio_channel_count=1,
                    language_code="en-US",
                )
                response = self.speech_client.recognize(config=config, audio=audio)
                if response.results:
                    transcript = " ".join([r.alternatives[0].transcript for r in response.results])
                    return transcript
            except Exception as fallback_error:
                print(f"❌ Fallback speech recognition also failed: {fallback_error}")
            
            return f"[Transcription error: {str(e)}]"

    async def _synthesize_speech(self, text: str) -> bytes:
        """Convert text to speech using Google Text-to-Speech (async)"""
        if not self.tts_client:
            raise Exception("TTS client not available")
        
        try:
            # Run TTS in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            audio_bytes = await asyncio.wait_for(
                loop.run_in_executor(
                    self.thread_pool,
                    self._synthesize_speech_sync,
                    text
                ),
                timeout=10.0  # 10 second timeout for TTS
            )
            return audio_bytes
            
        except asyncio.TimeoutError:
            print("❌ TTS timeout after 10 seconds")
            raise Exception("TTS service timeout")
        except Exception as e:
            print(f"❌ TTS async error: {e}")
            raise e

    def _synthesize_speech_sync(self, text: str) -> bytes:
        """Synchronous TTS implementation - runs in thread pool"""
        try:
            synthesis_input = texttospeech.SynthesisInput(text=text)
            voice = texttospeech.VoiceSelectionParams(
                language_code="en-US",
                ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3
            )
            
            response = self.tts_client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            print("✅ TTS generation successful")
            return response.audio_content
            
        except Exception as e:
            print(f"❌ TTS sync error: {e}")
            raise e

    async def send_json(self, data: dict):
        """Helper to send JSON data"""
        await self.send(text_data=json.dumps(data))

    async def disconnect(self, close_code):
        """Clean up thread pool on disconnect"""
        print(f"🔌 WebSocket disconnected, cleaning up thread pool")
        self.thread_pool.shutdown(wait=False)















# import json
# import base64
# import os
# from channels.generic.websocket import AsyncWebsocketConsumer
# from google.cloud import speech
# from google.cloud import texttospeech
# from google.oauth2 import service_account

# from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
# from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis
# from analysis.views import verify_firebase_token, build_response_data

# class VoiceAnalysisConsumer(AsyncWebsocketConsumer):
#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         self.speech_client = None
#         self.tts_client = None
#         self.user_id = None
#         self.buffered_audio = b""
#         self.game = "fifa"
#         self._initialize_clients()
    
#     def _initialize_clients(self):
#         """Initialize Google Cloud clients with base64 credentials"""
#         try:
#             credentials_b64 = os.environ.get('FIREBASE_CREDENTIALS_BASE64')
            
#             if credentials_b64:
#                 # Decode base64 to JSON
#                 credentials_json = base64.b64decode(credentials_b64).decode('utf-8')
#                 credentials_info = json.loads(credentials_json)
                
#                 # Create credentials object
#                 credentials = service_account.Credentials.from_service_account_info(credentials_info)
                
#                 # Initialize clients with credentials
#                 self.speech_client = speech.SpeechClient(credentials=credentials)
#                 self.tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
#                 print("✅ Google Cloud clients initialized with base64 credentials")
#             else:
#                 # Fallback to default credentials
#                 self.speech_client = speech.SpeechClient()
#                 self.tts_client = texttospeech.TextToSpeechClient()
#                 print("✅ Google Cloud clients initialized with default credentials")
                
#         except Exception as e:
#             print(f"❌ Failed to initialize Google Cloud clients: {e}")
#             self.speech_client = None
#             self.tts_client = None

#     async def connect(self):
#         await self.accept()

#     async def receive(self, text_data=None, bytes_data=None):
#         data = json.loads(text_data)
#         message_type = data.get("type")

#         if message_type == "auth":
#             await self._handle_auth(data)
#         elif message_type == "audio_chunk":
#             await self._handle_audio_chunk(data)
#         elif message_type == "speech_end":
#             await self._handle_speech_end(data)

#     async def _handle_auth(self, data):
#         """Handle authentication"""
#         id_token = data.get("token", "")
#         user_id = verify_firebase_token(id_token)
        
#         if not user_id:
#             await self.send_json({"error": "Unauthorized"})
#             await self.close()
#             return
            
#         self.user_id = user_id
#         await self.send_json({"status": "authenticated"})

#     async def _handle_audio_chunk(self, data):
#         """Handle incoming audio chunks"""
#         chunk = base64.b64decode(data["audio_base64"])
#         self.buffered_audio += chunk

#     async def _handle_speech_end(self, data):
#         """Handle end of speech - transcribe, analyze, and respond"""
#         if not self.user_id:
#             await self.send_json({"error": "Not authenticated"})
#             return

#         game = data.get("game", "fifa")
#         self.game = game

#         # Transcribe audio
#         transcript = await self._transcribe_audio(self.buffered_audio)
#         await self.send_json({"transcript": transcript})

#         # Analyze with Gemini
#         try:
#             if game == "lol":
#                 gemini_result = analyze_lol_voice_input(transcript)
#             else:
#                 gemini_result = analyze_fifa_voice_input(transcript)
#         except Exception as e:
#             await self.send_json({"error": f"Analysis failed: {str(e)}"})
#             return

#         # Build structured response data for frontend
#         response_data = build_response_data(gemini_result)

#         # Save to Firestore - PASS RAW GEMINI RESULT for proper storage
#         try:
#             user_data = {"user_id": self.user_id, "text": transcript}
#             if game == "lol":
#                 save_lol_analysis(user_data, gemini_result)  # ✅ Save raw Gemini result
#             else:
#                 save_fifa_analysis(user_data, gemini_result)  # ✅ Save raw Gemini result
#             print(f"✅ Saved {game} analysis to Firestore")
#         except Exception as e:
#             print(f"❌ Firestore Save Error: {e}")

#         # Generate TTS response
#         try:
#             # Use the summary for TTS
#             tts_text = response_data.get("summary", "No analysis available.")
#             audio_bytes = await self._synthesize_speech(tts_text)
#             audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            
#             # Send structured response data to frontend
#             await self.send_json({
#                 "analysis": response_data,  # ← Formatted data for frontend
#                 "tts_audio": audio_b64
#             })
#         except Exception as e:
#             await self.send_json({
#                 "analysis": response_data,  # ← Still send analysis even if TTS fails
#                 "error": f"TTS failed: {str(e)}"
#             })

#         # Reset buffer
#         self.buffered_audio = b""

#     async def _transcribe_audio(self, audio_bytes: bytes) -> str:
#         """Transcribe audio using Google Speech-to-Text"""
#         if not self.speech_client:
#             return "[Speech-to-Text not available]"
        
#         if not audio_bytes or len(audio_bytes) == 0:
#             return "[No audio data received]"
        
#         try:
#             audio = speech.RecognitionAudio(content=audio_bytes)
            
#             config = speech.RecognitionConfig(
#                 encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
#                 sample_rate_hertz=48000,
#                 audio_channel_count=1,
#                 language_code="en-US",
#                 enable_automatic_punctuation=True,
#                 model='command_and_search'
#             )
            
#             response = self.speech_client.recognize(config=config, audio=audio)
            
#             if response.results:
#                 transcript = " ".join([r.alternatives[0].transcript for r in response.results])
#                 print(f"✅ Transcription successful: '{transcript}'")
#                 return transcript
#             else:
#                 return "[No speech detected]"
            
#         except Exception as e:
#             print(f"❌ Speech recognition error: {e}")
#             # Try fallback config
#             try:
#                 config = speech.RecognitionConfig(
#                     encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
#                     sample_rate_hertz=None,  # Auto-detect
#                     audio_channel_count=1,
#                     language_code="en-US",
#                 )
#                 response = self.speech_client.recognize(config=config, audio=audio)
#                 if response.results:
#                     transcript = " ".join([r.alternatives[0].transcript for r in response.results])
#                     return transcript
#             except Exception:
#                 pass
            
#             return f"[Transcription error: {str(e)}]"

#     async def _synthesize_speech(self, text: str) -> bytes:
#         """Convert text to speech using Google Text-to-Speech"""
#         if not self.tts_client:
#             raise Exception("TTS client not available")
        
#         synthesis_input = texttospeech.SynthesisInput(text=text)
#         voice = texttospeech.VoiceSelectionParams(
#             language_code="en-US",
#             ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
#         )
#         audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        
#         response = self.tts_client.synthesize_speech(
#             input=synthesis_input, voice=voice, audio_config=audio_config
#         )
#         return response.audio_content

#     async def send_json(self, data: dict):
#         """Helper to send JSON data"""
#         await self.send(text_data=json.dumps(data))
