# neuraplay/asgi.py
import os
import django
from django.core.asgi import get_asgi_application

# Set Django settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "neuraplay.settings")

# Setup Django
django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.urls import path
from analysis.consumers import VoiceAnalysisConsumer

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter([
            path("ws/voice-analysis/", VoiceAnalysisConsumer.as_asgi()),
        ])
    ),
})











# import os
# from django.core.asgi import get_asgi_application
# from channels.routing import ProtocolTypeRouter, URLRouter
# from channels.auth import AuthMiddlewareStack
# from django.urls import path
# from analysis.consumers import VoiceAnalysisConsumer

# os.environ.setdefault("DJANGO_SETTINGS_MODULE", "neuraplay.settings")

# application = ProtocolTypeRouter({
#     "http": get_asgi_application(),
#     "websocket": AuthMiddlewareStack(
#         URLRouter([
#             path("ws/voice-analysis/", VoiceAnalysisConsumer.as_asgi()),
#         ])
#     ),
# })









# """
# ASGI config for neuraplay project.

# It exposes the ASGI callable as a module-level variable named ``application``.

# For more information on this file, see
# https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
# """

# import os

# from django.core.asgi import get_asgi_application

# os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'neuraplay.settings')

# application = get_asgi_application()
