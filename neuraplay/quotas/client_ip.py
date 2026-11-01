from typing import Iterable, Optional, Tuple

from django.conf import settings


def resolve_client_ip(remote_addr: Optional[str], forwarded_for: Optional[str], trusted_proxies: int) -> str:
    """
    The client's IP address.

    Behind N trusted proxies (Render adds one), each proxy appends the address it
    received the request from to X-Forwarded-For, so the real client is the Nth
    entry from the right. Entries further left are client-supplied and can be
    forged, so they are never used. With no trusted proxies the header is ignored.
    """
    if trusted_proxies > 0 and forwarded_for:
        addresses = [addr.strip() for addr in forwarded_for.split(",") if addr.strip()]
        if len(addresses) >= trusted_proxies:
            return addresses[-trusted_proxies]
    return remote_addr or "unknown"


def client_ip_from_request(request) -> str:
    meta = request.META
    return resolve_client_ip(
        meta.get("REMOTE_ADDR"),
        meta.get("HTTP_X_FORWARDED_FOR"),
        settings.TRUSTED_PROXY_COUNT,
    )


def client_ip_from_scope(scope: dict) -> str:
    """Same as client_ip_from_request, for a Channels (ASGI) connection scope"""
    headers: Iterable[Tuple[bytes, bytes]] = scope.get("headers", [])
    forwarded_for = next(
        (value.decode("latin-1") for name, value in headers if name.lower() == b"x-forwarded-for"),
        None,
    )
    client = scope.get("client") or (None, None)
    return resolve_client_ip(client[0], forwarded_for, settings.TRUSTED_PROXY_COUNT)
