from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from analysis.models import Analysis
from neuraplay_ai.services.analysis_service import (
    MAX_ANALYSES_PER_GAME,
    delete_expired_analyses,
    delete_expired_analyses_for_user,
    get_recent_analyses,
    save_analysis,
)

User = get_user_model()

GEMINI_RESULT = {
    "explanation": "Keep your shape in defence.",
    "top_tips": ["Track back", "Hold possession"],
    "drills": ["Passing drill"],
    "rating": 7.5,
    "estimated_score": 0.75,
    "meta": {"response_type": "detailed"},
}


@pytest.fixture
def user(db):
    return User.objects.create_user(email="coach@example.com", username="coach", password="Str0ng-Passw0rd!")


def test_save_analysis_stores_result_with_expiry(user):
    analysis_id = save_analysis(user.id, "I keep conceding late goals", GEMINI_RESULT, "fifa")

    analysis = Analysis.objects.get(pk=analysis_id)
    assert analysis.user == user
    assert analysis.top_tips == ["Track back", "Hold possession"]
    assert analysis.confidence == 0.75
    assert analysis.expire_at > timezone.now() + timedelta(hours=23)


def test_save_analysis_keeps_only_newest_per_game(user):
    for i in range(MAX_ANALYSES_PER_GAME + 3):
        save_analysis(user.id, f"fifa {i}", GEMINI_RESULT, "fifa")
    save_analysis(user.id, "lol 0", GEMINI_RESULT, "lol")

    fifa = Analysis.objects.filter(user=user, game="fifa")
    assert fifa.count() == MAX_ANALYSES_PER_GAME
    assert not fifa.filter(user_text="fifa 0").exists()
    assert Analysis.objects.filter(user=user, game="lol").count() == 1


def test_get_recent_analyses_uses_frontend_keys_and_skips_expired(user):
    save_analysis(user.id, "fresh", GEMINI_RESULT, "lol")
    expired_id = save_analysis(user.id, "stale", GEMINI_RESULT, "lol")
    Analysis.objects.filter(pk=expired_id).update(expire_at=timezone.now() - timedelta(minutes=1))

    results = get_recent_analyses(user.id, "lol")

    assert [r["user_text"] for r in results] == ["fresh"]
    assert {"topTips", "trainingDrills", "responseType", "created_at"} <= results[0].keys()


def test_delete_expired_analyses(user):
    save_analysis(user.id, "fresh", GEMINI_RESULT, "fifa")
    expired_id = save_analysis(user.id, "stale", GEMINI_RESULT, "fifa")
    Analysis.objects.filter(pk=expired_id).update(expire_at=timezone.now() - timedelta(minutes=1))

    assert delete_expired_analyses() == 1
    assert Analysis.objects.filter(user=user).count() == 1


def test_recent_analyses_endpoint_is_scoped_to_user(user):
    other = User.objects.create_user(email="other@example.com", username="other", password="Str0ng-Passw0rd!")
    save_analysis(user.id, "mine", GEMINI_RESULT, "fifa")
    save_analysis(other.id, "theirs", GEMINI_RESULT, "fifa")

    client = APIClient()
    assert client.get("/api/analyses/recent/fifa/").status_code == 401

    client.force_authenticate(user=user)
    response = client.get("/api/analyses/recent/fifa/")

    assert response.status_code == 200
    assert [a["user_text"] for a in response.data["analyses"]] == ["mine"]


def test_ttl_comes_from_settings(user, settings):
    settings.ANALYSIS_TTL_HOURS = 1
    analysis_id = save_analysis(user.id, "short lived", GEMINI_RESULT, "fifa")

    analysis = Analysis.objects.get(pk=analysis_id)
    assert analysis.expire_at <= timezone.now() + timedelta(hours=1)


def test_reading_history_deletes_only_that_users_expired_analyses(user):
    other = User.objects.create_user(email="other@example.com", username="other", password="Str0ng-Passw0rd!")
    mine = save_analysis(user.id, "mine", GEMINI_RESULT, "lol")
    theirs = save_analysis(other.id, "theirs", GEMINI_RESULT, "lol")
    Analysis.objects.filter(pk__in=[mine, theirs]).update(expire_at=timezone.now() - timedelta(minutes=1))

    get_recent_analyses(user.id, "lol")

    assert not Analysis.objects.filter(pk=mine).exists()
    assert Analysis.objects.filter(pk=theirs).exists()


def test_active_and_expired_querysets(user):
    fresh = save_analysis(user.id, "fresh", GEMINI_RESULT, "fifa")
    stale = save_analysis(user.id, "stale", GEMINI_RESULT, "fifa")
    Analysis.objects.filter(pk=stale).update(expire_at=timezone.now() - timedelta(seconds=1))

    assert list(Analysis.objects.active().values_list("pk", flat=True)) == [int(fresh)]
    assert list(Analysis.objects.expired().values_list("pk", flat=True)) == [int(stale)]
    assert delete_expired_analyses_for_user(user.id) == 1
