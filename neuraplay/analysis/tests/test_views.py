import pytest
from rest_framework.test import APIClient
from unittest.mock import patch

@pytest.fixture
def api_client():
    return APIClient()

@patch("neuraplay_ai.services.gemini_service._call_gemini")
def test_lol_api(mock_gemini, api_client):
    mock_gemini.return_value = "Tip 1: Stay safe.\nDrill 1: CS practice.\nScore: 70%"
    response = api_client.post("/api/analyze/lol/", {
        "champion": "Ahri",
        "role": "mid",
        "kills": 2,
        "deaths": 1,
        "assists": 3,
        "minute": 15
    }, format='json')
    assert response.status_code == 200
    assert "top_tips" in response.data

@patch("neuraplay_ai.services.gemini_service._call_gemini")
def test_fifa_api(mock_gemini, api_client):
    mock_gemini.return_value = "Tip 1: Control possession.\nDrill 1: Passing drill.\nScore: 80%"
    response = api_client.post("/api/analyze/fifa/", {
        "team": "Real Madrid",
        "formation": "4-3-3",
        "possession_pct": 50,
        "scoreline": "1-0",
        "minute": 45,
        "key_events": "Corner kick scored"
    }, format='json')
    assert response.status_code == 200
    assert "top_tips" in response.data
