from django.urls import path
from .views import analyze_lol_voice, analyze_fifa_voice

urlpatterns = [
    path("analyze/lol/", analyze_lol_voice),
    path("analyze/fifa/", analyze_fifa_voice),
]