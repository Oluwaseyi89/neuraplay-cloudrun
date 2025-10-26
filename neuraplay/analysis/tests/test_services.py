import pytest
from unittest.mock import patch
from neuraplay_ai.services.gemini_service import analyze_lol_strategy, analyze_fifa_strategy

@pytest.fixture
def lol_stats():
    return {
        "champion": "Ahri",
        "role": "mid",
        "kills": 2,
        "deaths": 1,
        "assists": 3,
        "minute": 15
    }

@pytest.fixture
def fifa_stats():
    return {
        "team": "Real Madrid",
        "formation": "4-3-3",
        "possession_pct": 50,
        "scoreline": "1-0",
        "minute": 45,
        "key_events": "Corner kick scored"
    }

@patch("neuraplay_ai.services.gemini_service._call_gemini")
def test_analyze_lol_strategy(mock_gemini, lol_stats):
    mock_gemini.return_value = "Tip 1: Stay safe.\nDrill 1: CS practice.\nScore: 70%"
    result = analyze_lol_strategy(lol_stats)
    assert "top_tips" in result
    assert "drills" in result
    assert result["rating"] > 0
    assert result["estimated_score"] > 0

@patch("neuraplay_ai.services.gemini_service._call_gemini")
def test_analyze_fifa_strategy(mock_gemini, fifa_stats):
    mock_gemini.return_value = "Tip 1: Control possession.\nDrill 1: Passing drill.\nScore: 80%"
    result = analyze_fifa_strategy(fifa_stats)
    assert "top_tips" in result
    assert "drills" in result
    assert result["rating"] > 0
    assert result["estimated_score"] > 0
