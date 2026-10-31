from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed, TokenError


def get_user_from_access_token(raw_token: str):
    """Validate a JWT access token and return its active user, or None if invalid"""
    if not raw_token:
        return None

    jwt_auth = JWTAuthentication()
    try:
        validated_token = jwt_auth.get_validated_token(raw_token)
        return jwt_auth.get_user(validated_token)
    except (InvalidToken, AuthenticationFailed, TokenError) as e:
        print(f"❌ Access token verification failed: {e}")
        return None
