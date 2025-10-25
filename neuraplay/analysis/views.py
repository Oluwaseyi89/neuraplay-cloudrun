# analysis/views.py
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from neuraplay_ai.services.gemini_service import analyze_lol_strategy, analyze_fifa_strategy

@api_view(['POST'])
def analyze_lol(request):
    stats = request.data
    if not stats:
        return Response({"error": "Missing stats."}, status=400)
    try:
        result = analyze_lol_strategy(stats)
        return Response(result)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
def analyze_fifa(request):
    stats = request.data
    if not stats:
        return Response({"error": "Missing match stats"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        response = analyze_fifa_strategy(stats)
        return Response(response)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
