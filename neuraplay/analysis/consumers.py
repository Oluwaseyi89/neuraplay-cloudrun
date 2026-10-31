import json
import base64
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from google.cloud import speech
from google.cloud import texttospeech

from neuraplay_ai.services.gemini_service import analyze_fifa_voice_input, analyze_lol_voice_input
from neuraplay_ai.services.analysis_service import save_analysis
from analysis.views import build_response_data, get_google_credentials
from authentication.tokens import get_user_from_access_token


class VoiceAnalysisConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.speech_client = None
        self.tts_client = None
        self.user_id = None
        self.buffered_audio = b""
        self.game = "fifa"
        self.thread_pool = ThreadPoolExecutor(max_workers=3)
        self._initialize_clients()
    
    def _initialize_clients(self):
        """Initialize Google Cloud clients with base64 credentials"""
        try:
            os.environ['GRPC_DNS_RESOLVER'] = 'native'
            
            credentials = get_google_credentials()

            # No fallback to Application Default Credentials: outside Google Cloud the
            # lookup probes the metadata server and blocks the event loop for ~12s
            if credentials:
                self.speech_client = speech.SpeechClient(credentials=credentials)
                self.tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
                print("✅ Google Cloud clients initialized with base64 credentials")
            else:
                print("⚠️ GOOGLE_CLOUD_CREDENTIALS_BASE64 not set - Speech-to-Text and TTS disabled")
                
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
        access_token = data.get("token", "")
        user = await database_sync_to_async(get_user_from_access_token)(access_token)

        if not user:
            await self.send_json({"error": "Unauthorized"})
            await self.close()
            return

        self.user_id = user.id
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

        transcript = await self._transcribe_audio(self.buffered_audio)
        await self.send_json({"transcript": transcript})

        try:
            if game == "lol":
                gemini_result = analyze_lol_voice_input(transcript)
            else:
                gemini_result = analyze_fifa_voice_input(transcript)
        except Exception as e:
            await self.send_json({"error": f"Analysis failed: {str(e)}"})
            return

        response_data = build_response_data(gemini_result)

        try:
            await database_sync_to_async(save_analysis)(self.user_id, transcript, gemini_result, game)
            print(f"✅ Saved {game} analysis to database")
        except Exception as e:
            print(f"❌ Database Save Error: {e}")

        tts_audio_b64 = None
        try:
            tts_text = response_data.get("summary", "No analysis available.")
            audio_bytes = await self._synthesize_speech(tts_text)
            if audio_bytes and len(audio_bytes) > 0:
                tts_audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                print("✅ TTS generation successful")
            else:
                print("⚠️ TTS returned empty audio, continuing without voice")
        except Exception as e:
            print(f"⚠️ TTS failed but continuing: {e}")

        response_payload = {
            "analysis": response_data,
            "transcript": transcript
        }
        
        if tts_audio_b64:
            response_payload["tts_audio"] = tts_audio_b64
        
        await self.send_json(response_payload)

        self.buffered_audio = b""

    async def _transcribe_audio(self, audio_bytes: bytes) -> str:
        """Transcribe audio using Google Speech-to-Text (async)"""
        if not self.speech_client:
            return "[Speech-to-Text not available]"
        
        if not audio_bytes or len(audio_bytes) == 0:
            return "[No audio data received]"
        
        try:
            loop = asyncio.get_event_loop()
            transcript = await asyncio.wait_for(
                loop.run_in_executor(
                    self.thread_pool,
                    self._transcribe_audio_sync,
                    audio_bytes
                ),
                timeout=30.0  
            )
            return transcript
            
        except asyncio.TimeoutError:
            print("❌ Speech recognition timeout after 30 seconds")
            return "[Speech recognition timeout - service slow]"
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
            try:
                print("🔄 Trying fallback speech recognition config...")
                config = speech.RecognitionConfig(
                    encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                    sample_rate_hertz=None, 
                    audio_channel_count=1,
                    language_code="en-US",
                )
                response = self.speech_client.recognize(config=config, audio=audio)
                if response.results:
                    transcript = " ".join([r.alternatives[0].transcript for r in response.results])
                    print(f"✅ Fallback transcription successful: '{transcript}'")
                    return transcript
                else:
                    return "[No speech detected in fallback]"
            except Exception as fallback_error:
                print(f"❌ Fallback speech recognition also failed: {fallback_error}")
            
            return f"[Transcription error: {str(e)}]"

    async def _synthesize_speech(self, text: str) -> bytes:
        """Convert text to speech using Google Text-to-Speech (async)"""
        if not self.tts_client:
            print("❌ TTS client not available")
            return b""
        
        try:
            loop = asyncio.get_event_loop()
            audio_bytes = await asyncio.wait_for(
                loop.run_in_executor(
                    self.thread_pool,
                    self._synthesize_speech_sync,
                    text
                ),
                timeout=30.0 
            )
            return audio_bytes
            
        except asyncio.TimeoutError:
            print("❌ TTS timeout after 30 seconds")
            return b""  
        except Exception as e:
            print(f"❌ TTS async error: {e}")
            return b""  

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
            try:
                print("🔄 Trying TTS with fallback text...")
                fallback_text = "Analysis complete." if len(text) > 50 else text
                synthesis_input = texttospeech.SynthesisInput(text=fallback_text)
                response = self.tts_client.synthesize_speech(
                    input=synthesis_input, voice=voice, audio_config=audio_config
                )
                print("✅ Fallback TTS generation successful")
                return response.audio_content
            except Exception as fallback_error:
                print(f"❌ Fallback TTS also failed: {fallback_error}")
                return b"" 

    async def send_json(self, data: dict):
        """Helper to send JSON data"""
        await self.send(text_data=json.dumps(data))

    async def disconnect(self, close_code):
        """Clean up thread pool on disconnect"""
        print(f"🔌 WebSocket disconnected, cleaning up thread pool")
        self.thread_pool.shutdown(wait=False)

