import hashlib
import hmac
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from typing import List, Optional, Tuple

from django.conf import settings
from django.db import transaction
from django.db.models import F

from .models import DailyUsage


@dataclass
class QuotaExceeded(Exception):
    scope: str
    limit: int
    retry_after: int

    @property
    def message(self) -> str:
        who = "account" if self.scope == DailyUsage.SCOPE_USER else "network"
        hours, remainder = divmod(self.retry_after, 3600)
        minutes = remainder // 60
        return (
            f"Daily analysis limit reached ({self.limit} per {who} per day). "
            f"Try again in {hours}h {minutes}m."
        )


def _today() -> date:
    return datetime.now(dt_timezone.utc).date()


def seconds_until_reset(now: Optional[datetime] = None) -> int:
    """Seconds until the next UTC midnight, when daily counters start over"""
    now = now or datetime.now(dt_timezone.utc)
    next_midnight = datetime.combine(now.date() + timedelta(days=1), time.min, tzinfo=dt_timezone.utc)
    return max(1, int((next_midnight - now).total_seconds()))


def hash_ip(ip: str) -> str:
    """Keyed hash so usage rows never hold raw IP addresses"""
    return hmac.new(settings.SECRET_KEY.encode(), ip.encode(), hashlib.sha256).hexdigest()


def _checks(user_id, ip: Optional[str]) -> List[Tuple[str, str, Optional[int]]]:
    checks = []
    if user_id is not None:
        checks.append((DailyUsage.SCOPE_USER, str(user_id), settings.ANALYSIS_DAILY_LIMIT_PER_USER))
    if ip:
        checks.append((DailyUsage.SCOPE_IP, hash_ip(ip), settings.ANALYSIS_DAILY_LIMIT_PER_IP))
    return checks


def consume_analysis_quota(user_id=None, ip: Optional[str] = None) -> None:
    """
    Count one analysis request against the user's and the IP's daily limits.

    Raises QuotaExceeded without counting anything if either limit is already used up.
    Each counter is bumped with a conditional UPDATE (count < limit), so concurrent
    requests can't overshoot, and both bumps share one transaction so a request
    rejected by the IP limit doesn't use up the user's quota.
    """
    today = _today()

    with transaction.atomic():
        for scope, key, limit in _checks(user_id, ip):
            if limit is None:
                continue

            usage, created = DailyUsage.objects.get_or_create(scope=scope, key=key, day=today)
            if created:
                # First request today for this key: drop its old counters
                DailyUsage.objects.filter(scope=scope, key=key, day__lt=today).delete()

            bumped = DailyUsage.objects.filter(pk=usage.pk, count__lt=limit).update(count=F("count") + 1)
            if not bumped:
                raise QuotaExceeded(scope=scope, limit=limit, retry_after=seconds_until_reset())

