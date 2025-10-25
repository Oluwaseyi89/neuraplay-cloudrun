from django.urls import path
from .views import analyze_lol, analyze_fifa

urlpatterns = [
    path("analyze/lol/", analyze_lol),
    path("analyze/fifa/", analyze_fifa),
]