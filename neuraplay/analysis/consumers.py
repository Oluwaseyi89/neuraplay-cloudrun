# analysis/consumers.py
import json
import base64
import os
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

        # Transcribe audio
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

        # Generate TTS response
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
        """Transcribe audio using Google Speech-to-Text"""
        if not self.speech_client:
            return "[Speech-to-Text not available]"
        
        if not audio_bytes or len(audio_bytes) == 0:
            return "[No audio data received]"
        
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
            print(f"❌ Speech recognition error: {e}")
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
            except Exception:
                pass
            
            return f"[Transcription error: {str(e)}]"

    async def _synthesize_speech(self, text: str) -> bytes:
        """Convert text to speech using Google Text-to-Speech"""
        if not self.tts_client:
            raise Exception("TTS client not available")
        
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
        )
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        
        response = self.tts_client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
        return response.audio_content

    async def send_json(self, data: dict):
        """Helper to send JSON data"""
        await self.send(text_data=json.dumps(data))


















# # analysis/consumers.py
# import json
# import base64
# import os
# from channels.generic.websocket import AsyncWebsocketConsumer
# from google.cloud import speech
# from google.cloud import texttospeech
# from google.oauth2 import service_account

# from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
# from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis
# from analysis.views import verify_firebase_token, build_response_data  # ADD THIS IMPORT

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

#         # Build structured response data (SAME FORMAT AS HTTP)
#         response_data = build_response_data(gemini_result)

#         # Save to Firestore
#         try:
#             user_data = {"user_id": self.user_id, "text": transcript}
#             if game == "lol":
#                 save_lol_analysis(user_data, response_data)  # Save the structured data
#             else:
#                 save_fifa_analysis(user_data, response_data)  # Save the structured data
#         except Exception as e:
#             print(f"⚠️ Firestore Save Error: {e}")

#         # Generate TTS response
#         try:
#             # Use the summary for TTS
#             tts_text = response_data.get("summary", "No analysis available.")
#             audio_bytes = await self._synthesize_speech(tts_text)
#             audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            
#             # Send structured response data (NOT raw gemini_result)
#             await self.send_json({
#                 "analysis": response_data,  # ← This is what frontend expects
#                 "tts_audio": audio_b64
#             })
#         except Exception as e:
#             await self.send_json({
#                 "analysis": response_data,  # ← Still send structured data even if TTS fails
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



















# # analysis/consumers.py
# import json
# import base64
# import os
# from channels.generic.websocket import AsyncWebsocketConsumer
# from google.cloud import speech
# from google.cloud import texttospeech
# from google.oauth2 import service_account
# import json

# from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
# from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis
# from analysis.views import verify_firebase_token

# class VoiceAnalysisConsumer(AsyncWebsocketConsumer):
#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         self.speech_client = None
#         self.tts_client = None
#         self._initialize_clients()
    
#     def _initialize_clients(self):
#         """Initialize Google Cloud clients with base64 credentials"""
#         try:
#             # Get base64 credentials from environment
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
#         self.user_id = None
#         self.buffered_audio = b""
#         self.game = "fifa"

#     async def receive(self, text_data=None, bytes_data=None):
#         data = json.loads(text_data)

#         # Step 1: Handle auth
#         if data.get("type") == "auth":
#             id_token = data.get("token", "")
#             user_id = verify_firebase_token(id_token)
#             if not user_id:
#                 await self.send_json({"error": "Unauthorized"})
#                 await self.close()
#                 return
#             self.user_id = user_id
#             await self.send_json({"status": "authenticated"})
#             return

#         # Step 2: Handle incoming audio chunk
#         if data.get("type") == "audio_chunk":
#             chunk = base64.b64decode(data["audio_base64"])
#             self.buffered_audio += chunk
#             return

#         # Step 3: End of user speech → transcribe, analyze, and respond
#         if data.get("type") == "speech_end":
#             game = data.get("game", "fifa")
#             self.game = game

#             # Transcribe audio
#             transcript = await self._transcribe_audio(self.buffered_audio)
#             await self.send_json({"transcript": transcript})

#             # Analyze
#             if game == "lol":
#                 result = analyze_lol_voice_input(transcript)
#             else:
#                 result = analyze_fifa_voice_input(transcript)

#             # Save to Firestore
#             try:
#                 if game == "lol":
#                     save_lol_analysis({"user_id": self.user_id, "text": transcript}, result)
#                 else:
#                     save_fifa_analysis({"user_id": self.user_id, "text": transcript}, result)
#             except Exception as e:
#                 print("⚠️ Firestore Save Error:", e)

#             # TTS response
#             try:
#                 audio_bytes = await self._synthesize_speech(result.get("explanation", "No analysis available."))
#                 audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                
#                 await self.send_json({
#                     "analysis": result,
#                     "tts_audio": audio_b64
#                 })
#             except Exception as e:
#                 await self.send_json({
#                     "analysis": result,
#                     "error": f"TTS failed: {str(e)}"
#                 })

#             # Reset buffer
#             self.buffered_audio = b""

#     async def _transcribe_audio(self, audio_bytes: bytes) -> str:
#         """Transcribe audio using Google Speech-to-Text"""
#         if not self.speech_client:
#             return "[Speech-to-Text not available]"
        
#         # If no audio data, return early
#         if not audio_bytes or len(audio_bytes) == 0:
#             return "[No audio data received]"
        
#         try:
#             audio = speech.RecognitionAudio(content=audio_bytes)
            
#             # Try different configurations for WebM Opus
#             configs_to_try = [
#                 # WebM Opus with explicit 48kHz
#                 {
#                     'encoding': speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
#                     'sample_rate_hertz': 48000,
#                     'audio_channel_count': 1
#                 },
#                 # WebM Opus with auto-detection
#                 {
#                     'encoding': speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
#                     'sample_rate_hertz': None,
#                     'audio_channel_count': 1
#                 },
#                 # WebM Opus with 48kHz and different language models
#                 {
#                     'encoding': speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
#                     'sample_rate_hertz': 48000,
#                     'audio_channel_count': 1,
#                     'model': 'command_and_search'  # Better for voice commands
#                 },
#                 # Fallback: Try without specifying encoding (let Google detect)
#                 {
#                     'encoding': None,
#                     'sample_rate_hertz': None,
#                     'audio_channel_count': 1
#                 }
#             ]
            
#             transcript = "[No speech detected]"
            
#             for i, config_params in enumerate(configs_to_try):
#                 try:
#                     # Create base config
#                     config = speech.RecognitionConfig(
#                         language_code="en-US",
#                     )
                    
#                     # Add encoding if specified
#                     if config_params['encoding']:
#                         config.encoding = config_params['encoding']
                    
#                     # Add sample rate if specified
#                     if config_params['sample_rate_hertz']:
#                         config.sample_rate_hertz = config_params['sample_rate_hertz']
                    
#                     # Add audio channels
#                     config.audio_channel_count = config_params['audio_channel_count']
                    
#                     # Add model if specified
#                     if config_params.get('model'):
#                         config.model = config_params['model']
                    
#                     # Enable automatic punctuation for better results
#                     config.enable_automatic_punctuation = True
                    
#                     print(f"🔧 Trying config {i+1}: {config_params}")
#                     response = self.speech_client.recognize(config=config, audio=audio)
                    
#                     if response.results:
#                         transcript = " ".join([r.alternatives[0].transcript for r in response.results])
#                         print(f"✅ Transcription successful: '{transcript}'")
#                         break  # Success! Exit the loop
#                     else:
#                         print(f"ℹ️ Config {i+1} succeeded but no speech detected")
                        
#                 except Exception as config_error:
#                     print(f"⚠️ Config {i+1} failed: {str(config_error)}")
#                     continue  # Try next config
            
#             return transcript
            
#         except Exception as e:
#             print(f"❌ Speech recognition error: {e}")
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
#         await self.send(text_data=json.dumps(data))













# # analysis/consumers.py
# import json
# import base64
# import os
# from channels.generic.websocket import AsyncWebsocketConsumer
# from google.cloud import speech
# from google.cloud import texttospeech
# from google.oauth2 import service_account
# import json

# from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
# from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis
# from analysis.views import verify_firebase_token

# class VoiceAnalysisConsumer(AsyncWebsocketConsumer):
#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         self.speech_client = None
#         self.tts_client = None
#         self._initialize_clients()
    
#     def _initialize_clients(self):
#         """Initialize Google Cloud clients with base64 credentials"""
#         try:
#             # Get base64 credentials from environment
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
#         self.user_id = None
#         self.buffered_audio = b""
#         self.game = "fifa"

#     async def receive(self, text_data=None, bytes_data=None):
#         data = json.loads(text_data)

#         # Step 1: Handle auth
#         if data.get("type") == "auth":
#             id_token = data.get("token", "")
#             user_id = verify_firebase_token(id_token)
#             if not user_id:
#                 await self.send_json({"error": "Unauthorized"})
#                 await self.close()
#                 return
#             self.user_id = user_id
#             await self.send_json({"status": "authenticated"})
#             return

#         # Step 2: Handle incoming audio chunk
#         if data.get("type") == "audio_chunk":
#             chunk = base64.b64decode(data["audio_base64"])
#             self.buffered_audio += chunk
#             return

#         # Step 3: End of user speech → transcribe, analyze, and respond
#         if data.get("type") == "speech_end":
#             game = data.get("game", "fifa")
#             self.game = game

#             # Transcribe audio
#             transcript = await self._transcribe_audio(self.buffered_audio)
#             await self.send_json({"transcript": transcript})

#             # Analyze
#             if game == "lol":
#                 result = analyze_lol_voice_input(transcript)
#             else:
#                 result = analyze_fifa_voice_input(transcript)

#             # Save to Firestore
#             try:
#                 if game == "lol":
#                     save_lol_analysis({"user_id": self.user_id, "text": transcript}, result)
#                 else:
#                     save_fifa_analysis({"user_id": self.user_id, "text": transcript}, result)
#             except Exception as e:
#                 print("⚠️ Firestore Save Error:", e)

#             # TTS response
#             try:
#                 audio_bytes = await self._synthesize_speech(result.get("explanation", "No analysis available."))
#                 audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                
#                 await self.send_json({
#                     "analysis": result,
#                     "tts_audio": audio_b64
#                 })
#             except Exception as e:
#                 await self.send_json({
#                     "analysis": result,
#                     "error": f"TTS failed: {str(e)}"
#                 })

#             # Reset buffer
#             self.buffered_audio = b""

#     async def _transcribe_audio(self, audio_bytes: bytes) -> str:
#         """Transcribe audio using Google Speech-to-Text"""
#         if not self.speech_client:
#             return "[Speech-to-Text not available]"
        
#         try:
#             audio = speech.RecognitionAudio(content=audio_bytes)
            
#             # Try multiple encoding configurations to handle different audio formats
#             configs_to_try = [
#                 # First try: WebM Opus format (48kHz) - most likely from browser
#                 {
#                     'encoding': speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
#                     'sample_rate_hertz': 48000
#                 },
#                 # Second try: WebM Opus without specifying sample rate (auto-detect)
#                 {
#                     'encoding': speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
#                     'sample_rate_hertz': None  # Let Google auto-detect
#                 },
#                 # Third try: Linear16 format (16kHz) - fallback
#                 {
#                     'encoding': speech.RecognitionConfig.AudioEncoding.LINEAR16,
#                     'sample_rate_hertz': 16000
#                 }
#             ]
            
#             transcript = "[No speech detected]"
            
#             for config_params in configs_to_try:
#                 try:
#                     config = speech.RecognitionConfig(
#                         encoding=config_params['encoding'],
#                         language_code="en-US",
#                     )
                    
#                     # Only add sample_rate_hertz if specified
#                     if config_params['sample_rate_hertz']:
#                         config.sample_rate_hertz = config_params['sample_rate_hertz']
                    
#                     print(f"🔧 Trying config: {config_params}")
#                     response = self.speech_client.recognize(config=config, audio=audio)
                    
#                     if response.results:
#                         transcript = " ".join([r.alternatives[0].transcript for r in response.results])
#                         print(f"✅ Transcription successful with config: {config_params}")
#                         break  # Success! Exit the loop
                        
#                 except Exception as config_error:
#                     print(f"⚠️ Config failed {config_params}: {config_error}")
#                     continue  # Try next config
            
#             return transcript
            
#         except Exception as e:
#             print(f"❌ Speech recognition error: {e}")
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
#         await self.send(text_data=json.dumps(data))












# # analysis/consumers.py
# import json
# import base64
# import os
# from channels.generic.websocket import AsyncWebsocketConsumer
# from google.cloud import speech
# from google.cloud import texttospeech
# from google.oauth2 import service_account
# import json

# from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
# from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis
# from analysis.views import verify_firebase_token

# class VoiceAnalysisConsumer(AsyncWebsocketConsumer):
#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         self.speech_client = None
#         self.tts_client = None
#         self._initialize_clients()
    
#     def _initialize_clients(self):
#         """Initialize Google Cloud clients with base64 credentials"""
#         try:
#             # Get base64 credentials from environment
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
#         self.user_id = None
#         self.buffered_audio = b""
#         self.game = "fifa"

#     async def receive(self, text_data=None, bytes_data=None):
#         data = json.loads(text_data)

#         # Step 1: Handle auth
#         if data.get("type") == "auth":
#             id_token = data.get("token", "")
#             user_id = verify_firebase_token(id_token)
#             if not user_id:
#                 await self.send_json({"error": "Unauthorized"})
#                 await self.close()
#                 return
#             self.user_id = user_id
#             await self.send_json({"status": "authenticated"})
#             return

#         # Step 2: Handle incoming audio chunk
#         if data.get("type") == "audio_chunk":
#             chunk = base64.b64decode(data["audio_base64"])
#             self.buffered_audio += chunk
#             return

#         # Step 3: End of user speech → transcribe, analyze, and respond
#         if data.get("type") == "speech_end":
#             game = data.get("game", "fifa")
#             self.game = game

#             # Transcribe audio
#             transcript = await self._transcribe_audio(self.buffered_audio)
#             await self.send_json({"transcript": transcript})

#             # Analyze
#             if game == "lol":
#                 result = analyze_lol_voice_input(transcript)
#             else:
#                 result = analyze_fifa_voice_input(transcript)

#             # Save to Firestore
#             try:
#                 if game == "lol":
#                     save_lol_analysis({"user_id": self.user_id, "text": transcript}, result)
#                 else:
#                     save_fifa_analysis({"user_id": self.user_id, "text": transcript}, result)
#             except Exception as e:
#                 print("⚠️ Firestore Save Error:", e)

#             # TTS response
#             try:
#                 audio_bytes = await self._synthesize_speech(result.get("explanation", "No analysis available."))
#                 audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                
#                 await self.send_json({
#                     "analysis": result,
#                     "tts_audio": audio_b64
#                 })
#             except Exception as e:
#                 await self.send_json({
#                     "analysis": result,
#                     "error": f"TTS failed: {str(e)}"
#                 })

#             # Reset buffer
#             self.buffered_audio = b""

#     async def _transcribe_audio(self, audio_bytes: bytes) -> str:
#         """Transcribe audio using Google Speech-to-Text"""
#         if not self.speech_client:
#             return "[Speech-to-Text not available]"
        
#         try:
#             audio = speech.RecognitionAudio(content=audio_bytes)
#             config = speech.RecognitionConfig(
#                 encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
#                 sample_rate_hertz=16000,
#                 language_code="en-US",
#             )
#             response = self.speech_client.recognize(config=config, audio=audio)
#             transcript = " ".join([r.alternatives[0].transcript for r in response.results])
#             return transcript if transcript else "[No speech detected]"
#         except Exception as e:
#             print(f"❌ Speech recognition error: {e}")
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
#         await self.send(text_data=json.dumps(data))













# # analysis/consumers.py
# import json
# import base64
# from channels.generic.websocket import AsyncWebsocketConsumer
# from google.cloud import speech_v1p1beta1 as speech
# from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
# from neuraplay_ai.services.firestore_service import save_fifa_analysis, save_lol_analysis
# from analysis.views import synthesize_speech, verify_firebase_token

# class VoiceAnalysisConsumer(AsyncWebsocketConsumer):
#     async def connect(self):
#         await self.accept()
#         self.user_id = None
#         self.buffered_audio = b""
#         self.game = "fifa"

#     async def receive(self, text_data=None, bytes_data=None):
#         data = json.loads(text_data)

#         # Step 1: Handle auth
#         if data.get("type") == "auth":
#             id_token = data.get("token", "")
#             user_id = verify_firebase_token(id_token)
#             if not user_id:
#                 await self.send_json({"error": "Unauthorized"})
#                 await self.close()
#                 return
#             self.user_id = user_id
#             await self.send_json({"status": "authenticated"})
#             return

#         # Step 2: Handle incoming audio chunk
#         if data.get("type") == "audio_chunk":
#             chunk = base64.b64decode(data["audio_base64"])
#             self.buffered_audio += chunk
#             return

#         # Step 3: End of user speech → transcribe, analyze, and respond
#         if data.get("type") == "speech_end":
#             game = data.get("game", "fifa")
#             self.game = game

#             transcript = await self._transcribe_audio(self.buffered_audio)
#             await self.send_json({"transcript": transcript})

#             if game == "lol":
#                 result = analyze_lol_voice_input(transcript)
#             else:
#                 result = analyze_fifa_voice_input(transcript)

#             # Save to Firestore
#             try:
#                 if game == "lol":
#                     save_lol_analysis({"user_id": self.user_id, "text": transcript}, result)
#                 else:
#                     save_fifa_analysis({"user_id": self.user_id, "text": transcript}, result)
#             except Exception as e:
#                 print("⚠️ Firestore Save Error:", e)

#             # TTS response
#             audio_bytes = synthesize_speech(result.get("explanation", "No analysis available."))
#             audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

#             await self.send_json({
#                 "analysis": result,
#                 "tts_audio": audio_b64
#             })

#             # Reset buffer
#             self.buffered_audio = b""

#     async def _transcribe_audio(self, audio_bytes: bytes) -> str:
#         client = speech.SpeechClient()
#         audio = speech.RecognitionAudio(content=audio_bytes)
#         config = speech.RecognitionConfig(
#             encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
#             sample_rate_hertz=16000,
#             language_code="en-US",
#         )
#         response = client.recognize(config=config, audio=audio)
#         transcript = " ".join([r.alternatives[0].transcript for r in response.results])
#         return transcript

#     async def send_json(self, data: dict):
#         await self.send(text_data=json.dumps(data))
