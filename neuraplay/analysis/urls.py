# analysis/urls.py
from django.urls import path
from .views import (
    analyze_lol_voice, 
    analyze_fifa_voice,
    get_recent_lol_analyses,
    get_recent_fifa_analyses
)

urlpatterns = [
    # Voice Analysis Endpoints
    path("analyze/lol/", analyze_lol_voice, name="analyze_lol_voice"),
    path("analyze/fifa/", analyze_fifa_voice, name="analyze_fifa_voice"),
    
    # Recent Analyses Endpoints  
    path("analyses/recent/lol/", get_recent_lol_analyses, name="recent_lol_analyses"),
    path("analyses/recent/fifa/", get_recent_fifa_analyses, name="recent_fifa_analyses"),
]







# from django.urls import path
# from .views import analyze_lol_voice, analyze_fifa_voice
# # from .views import analyze_lol, analyze_fifa


# urlpatterns = [
#     path("analyze/lol/", analyze_lol_voice),
#     path("analyze/fifa/", analyze_fifa_voice),
#     #  path("analyze/lol/", analyze_lol),
#     # path("analyze/fifa/", analyze_fifa),
#     #  path("analyze/lol/voice/", analyze_lol_voice),  # For voice input
#     # path("analyze/fifa/voice/", analyze_fifa_voice),  # For voice input
# ]