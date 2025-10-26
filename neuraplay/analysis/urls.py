from django.urls import path
from .views import analyze_lol_voice, analyze_fifa_voice
# from .views import analyze_lol, analyze_fifa


urlpatterns = [
    path("analyze/lol/", analyze_lol_voice),
    path("analyze/fifa/", analyze_fifa_voice),
    #  path("analyze/lol/", analyze_lol),
    # path("analyze/fifa/", analyze_fifa),
    #  path("analyze/lol/voice/", analyze_lol_voice),  # For voice input
    # path("analyze/fifa/voice/", analyze_fifa_voice),  # For voice input
]