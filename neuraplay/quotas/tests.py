from datetime import date, datetime, timezone as dt_timezone
from unittest.mock import patch

import pytest
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from analysis.consumers import VoiceAnalysisConsumer
from quotas.client_ip import client_ip_from_scope, resolve_client_ip
from quotas.models import DailyUsage
from quotas.services import QuotaExceeded, consume_analysis_quota, hash_ip, seconds_until_reset

User = get_user_model()

GEMINI_RESULT = {
    "explanation": "Hold your defensive line.",
    "top_tips": [],
    "drills": [],
    "rating": None,
    "estimated_score": None,
    "meta": {"response_type": "simple"},
}


@pytest.fixture
def make_user(db):
    def _make(name):
        return User.objects.create_user(email=f"{name}@example.com", username=name, password="Str0ng-Passw0rd!")
    return _make


@pytest.fixture
def limits(settings):
    settings.ANALYSIS_DAILY_LIMIT_PER_USER = 3
    settings.ANALYSIS_DAILY_LIMIT_PER_IP = 5
    settings.TRUSTED_PROXY_COUNT = 0
    return settings


# ----------------------
# Client IP resolution
# ----------------------
def test_ignores_forwarded_for_without_trusted_proxies():
    assert resolve_client_ip("10.0.0.1", "1.2.3.4", trusted_proxies=0) == "10.0.0.1"


def test_uses_address_appended_by_trusted_proxy_not_spoofed_entries():
    # Client forged "6.6.6.6"; Render appended the real address last
    assert resolve_client_ip("10.0.0.1", "6.6.6.6, 203.0.113.7", trusted_proxies=1) == "203.0.113.7"


def test_falls_back_to_remote_addr_when_header_is_too_short():
    assert resolve_client_ip("10.0.0.1", "203.0.113.7", trusted_proxies=2) == "10.0.0.1"


def test_reads_forwarded_for_from_asgi_scope(settings):
    settings.TRUSTED_PROXY_COUNT = 1
    scope = {"client": ("10.0.0.1", 5000), "headers": [(b"x-forwarded-for", b"6.6.6.6, 203.0.113.7")]}
    assert client_ip_from_scope(scope) == "203.0.113.7"


# ----------------------
# Daily counters
# ----------------------
def test_user_limit(make_user, limits):
    user = make_user("alice")
    for _ in range(3):
        consume_analysis_quota(user_id=user.id, ip="203.0.113.1")

    with pytest.raises(QuotaExceeded) as exc:
        consume_analysis_quota(user_id=user.id, ip="203.0.113.1")

    assert exc.value.scope == DailyUsage.SCOPE_USER
    assert exc.value.limit == 3


def test_ip_limit_is_shared_across_users_and_rejection_costs_nothing(make_user, limits):
    alice, bob = make_user("alice"), make_user("bob")
    for _ in range(3):
        consume_analysis_quota(user_id=alice.id, ip="203.0.113.1")
    for _ in range(2):
        consume_analysis_quota(user_id=bob.id, ip="203.0.113.1")

    with pytest.raises(QuotaExceeded) as exc:
        consume_analysis_quota(user_id=bob.id, ip="203.0.113.1")

    assert exc.value.scope == DailyUsage.SCOPE_IP
    # The rejected request must not have used one of Bob's 3
    assert DailyUsage.objects.get(scope=DailyUsage.SCOPE_USER, key=str(bob.id)).count == 2
    # Bob still has quota from a different network
    consume_analysis_quota(user_id=bob.id, ip="198.51.100.9")


def test_counters_reset_each_day_and_old_rows_are_removed(make_user, limits):
    user = make_user("alice")
    with patch("quotas.services._today", return_value=date(2026, 11, 1)):
        for _ in range(3):
            consume_analysis_quota(user_id=user.id, ip="203.0.113.1")

    with patch("quotas.services._today", return_value=date(2026, 11, 2)):
        consume_analysis_quota(user_id=user.id, ip="203.0.113.1")

    # One user row and one IP row, both for the new day only
    rows = sorted(DailyUsage.objects.values_list("scope", "day", "count"))
    assert rows == [("ip", date(2026, 11, 2), 1), ("user", date(2026, 11, 2), 1)]


def test_empty_limit_disables_that_check(make_user, limits):
    limits.ANALYSIS_DAILY_LIMIT_PER_USER = None
    user = make_user("alice")
    for _ in range(5):
        consume_analysis_quota(user_id=user.id, ip=f"203.0.113.{_}")


def test_ip_addresses_are_stored_hashed(make_user, limits):
    consume_analysis_quota(user_id=None, ip="203.0.113.1")

    row = DailyUsage.objects.get(scope=DailyUsage.SCOPE_IP)
    assert row.key == hash_ip("203.0.113.1")
    assert "203.0.113.1" not in row.key


def test_seconds_until_reset_counts_to_utc_midnight():
    now = datetime(2026, 11, 1, 22, 30, tzinfo=dt_timezone.utc)
    assert seconds_until_reset(now) == 90 * 60


# ----------------------
# HTTP endpoints
# ----------------------
@patch("analysis.views.analyze_fifa_voice_input", return_value=GEMINI_RESULT)
def test_analysis_endpoint_returns_429_after_user_limit(mock_gemini, make_user, limits):
    client = APIClient()
    client.force_authenticate(user=make_user("alice"))

    statuses = [client.post("/api/analyze/fifa/", {"stats": "I concede late goals"}, format="json").status_code
                for _ in range(4)]

    assert statuses == [200, 200, 200, 429]
    assert mock_gemini.call_count == 3


@patch("analysis.views.analyze_fifa_voice_input", return_value=GEMINI_RESULT)
def test_429_explains_the_limit(mock_gemini, make_user, limits):
    limits.ANALYSIS_DAILY_LIMIT_PER_USER = 0
    client = APIClient()
    client.force_authenticate(user=make_user("alice"))

    response = client.post("/api/analyze/fifa/", {"stats": "help"}, format="json")

    assert response.status_code == 429
    assert response.data["code"] == "rate_limited"
    assert response.data["scope"] == "user"
    assert int(response["Retry-After"]) == response.data["retry_after"] > 0
    mock_gemini.assert_not_called()


@patch("analysis.views.analyze_fifa_voice_input", return_value=GEMINI_RESULT)
def test_invalid_requests_do_not_use_quota(mock_gemini, make_user, limits):
    user = make_user("alice")
    client = APIClient()
    client.force_authenticate(user=user)

    assert client.post("/api/analyze/fifa/", {}, format="json").status_code == 400
    assert not DailyUsage.objects.exists()


@patch("analysis.views.analyze_lol_voice_input", return_value=GEMINI_RESULT)
def test_anonymous_browser_endpoint_is_limited_per_ip(mock_gemini, db, limits):
    client = APIClient()
    payload = {"game": "lol", "stats": {"kda": "2/5/3"}}

    statuses = [client.post("/api/analyze/browser-stats/", payload, format="json", REMOTE_ADDR="203.0.113.1").status_code
                for _ in range(6)]
    other_network = client.post("/api/analyze/browser-stats/", payload, format="json", REMOTE_ADDR="198.51.100.9")

    assert statuses == [200] * 5 + [429]
    assert other_network.status_code == 200
    assert not DailyUsage.objects.filter(scope=DailyUsage.SCOPE_USER).exists()


# ----------------------
# WebSocket
# ----------------------
async def _connect_authenticated(user):
    communicator = WebsocketCommunicator(VoiceAnalysisConsumer.as_asgi(), "/ws/voice-analysis/")
    connected, _ = await communicator.connect()
    assert connected
    await communicator.send_json_to({"type": "auth", "token": str(AccessToken.for_user(user))})
    assert await communicator.receive_json_from() == {"status": "authenticated"}
    return communicator


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_websocket_rejects_speech_over_the_limit(limits):
    limits.ANALYSIS_DAILY_LIMIT_PER_USER = 0
    from asgiref.sync import sync_to_async
    user = await sync_to_async(User.objects.create_user)(email="ws@example.com", username="ws", password="Str0ng-Passw0rd!")

    communicator = await _connect_authenticated(user)
    with patch.object(VoiceAnalysisConsumer, "_transcribe_audio") as transcribe:
        await communicator.send_json_to({"type": "audio_chunk", "audio_base64": "AAAA"})
        await communicator.send_json_to({"type": "speech_end", "game": "fifa"})
        response = await communicator.receive_json_from()

    assert response["code"] == "rate_limited"
    transcribe.assert_not_called()
    await communicator.disconnect()


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_websocket_empty_speech_does_not_use_quota(limits):
    from asgiref.sync import sync_to_async
    user = await sync_to_async(User.objects.create_user)(email="ws2@example.com", username="ws2", password="Str0ng-Passw0rd!")

    communicator = await _connect_authenticated(user)
    await communicator.send_json_to({"type": "speech_end", "game": "fifa"})

    assert await communicator.receive_json_from() == {"error": "No audio data received"}
    assert not await sync_to_async(DailyUsage.objects.exists)()
    await communicator.disconnect()
