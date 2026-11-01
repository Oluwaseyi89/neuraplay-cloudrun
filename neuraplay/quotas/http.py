from typing import Optional

from rest_framework import status
from rest_framework.response import Response

from .client_ip import client_ip_from_request
from .services import QuotaExceeded, consume_analysis_quota


def quota_exceeded_payload(exc: QuotaExceeded) -> dict:
    return {
        "error": exc.message,
        "code": "rate_limited",
        "scope": exc.scope,
        "limit": exc.limit,
        "retry_after": exc.retry_after,
    }


def enforce_analysis_quota(request) -> Optional[Response]:
    """
    Count this request against the daily analysis limits.
    Returns a 429 response to send back if a limit is reached, otherwise None.
    Anonymous requests (browser extension) are limited by IP only.
    """
    user = getattr(request, "user", None)
    user_id = user.id if user is not None and user.is_authenticated else None

    try:
        consume_analysis_quota(user_id=user_id, ip=client_ip_from_request(request))
    except QuotaExceeded as exc:
        return Response(
            quota_exceeded_payload(exc),
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(exc.retry_after)},
        )
    return None
