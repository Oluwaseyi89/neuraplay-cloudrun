import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from authentication.tokens import get_user_from_access_token

User = get_user_model()

PASSWORD = "Str0ng-Passw0rd!"


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="player@example.com", username="player", password=PASSWORD)


def _register(api_client, **overrides):
    payload = {
        "email": "New.Player@Example.com",
        "username": "newplayer",
        "first_name": "New",
        "password": PASSWORD,
        "password_confirm": PASSWORD,
        **overrides,
    }
    return api_client.post("/api/auth/register/", payload, format="json")


@pytest.mark.django_db
def test_register_creates_user_and_returns_tokens(api_client):
    response = _register(api_client)

    assert response.status_code == 201
    assert response.data["user"]["email"] == "new.player@example.com"
    assert response.data["access"] and response.data["refresh"]
    assert User.objects.get(email="new.player@example.com").check_password(PASSWORD)


@pytest.mark.django_db
def test_register_rejects_mismatched_passwords(api_client):
    response = _register(api_client, password_confirm="something-else-123")

    assert response.status_code == 400
    assert "password_confirm" in response.data


@pytest.mark.django_db
def test_register_rejects_weak_password(api_client):
    response = _register(api_client, password="12345", password_confirm="12345")

    assert response.status_code == 400


def test_register_rejects_duplicate_email(api_client, user):
    response = _register(api_client, email="PLAYER@example.com", username="other")

    assert response.status_code == 400
    assert "email" in response.data


def test_login_returns_tokens_and_user(api_client, user):
    response = api_client.post(
        "/api/auth/login/", {"email": "Player@Example.com", "password": PASSWORD}, format="json"
    )

    assert response.status_code == 200
    assert response.data["user"]["username"] == "player"
    assert response.data["access"] and response.data["refresh"]


def test_login_rejects_wrong_password(api_client, user):
    response = api_client.post(
        "/api/auth/login/", {"email": "player@example.com", "password": "wrong"}, format="json"
    )

    assert response.status_code == 401


def test_me_requires_authentication(api_client, db):
    assert api_client.get("/api/auth/me/").status_code == 401


def test_me_returns_current_user(api_client, user):
    tokens = api_client.post(
        "/api/auth/login/", {"email": user.email, "password": PASSWORD}, format="json"
    ).data
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

    response = api_client.get("/api/auth/me/")

    assert response.status_code == 200
    assert response.data["email"] == user.email


def test_logout_blacklists_refresh_token(api_client, user):
    tokens = api_client.post(
        "/api/auth/login/", {"email": user.email, "password": PASSWORD}, format="json"
    ).data
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

    logout = api_client.post("/api/auth/logout/", {"refresh": tokens["refresh"]}, format="json")
    refresh = api_client.post("/api/auth/token/refresh/", {"refresh": tokens["refresh"]}, format="json")

    assert logout.status_code == 205
    assert refresh.status_code == 401


def test_refresh_rotates_tokens(api_client, user):
    tokens = api_client.post(
        "/api/auth/login/", {"email": user.email, "password": PASSWORD}, format="json"
    ).data

    response = api_client.post("/api/auth/token/refresh/", {"refresh": tokens["refresh"]}, format="json")

    assert response.status_code == 200
    assert response.data["access"] and response.data["refresh"] != tokens["refresh"]


def test_get_user_from_access_token(api_client, user):
    tokens = api_client.post(
        "/api/auth/login/", {"email": user.email, "password": PASSWORD}, format="json"
    ).data

    assert get_user_from_access_token(tokens["access"]) == user
    assert get_user_from_access_token(tokens["refresh"]) is None
    assert get_user_from_access_token("not-a-token") is None
    assert get_user_from_access_token("") is None
