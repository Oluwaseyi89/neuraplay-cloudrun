from typing import List, Dict, Any
from datetime import timedelta

from django.utils import timezone

from analysis.models import Analysis

ANALYSIS_TTL_HOURS = 24
MAX_ANALYSES_PER_GAME = 10


def save_analysis(user_id, user_text: str, analysis_result: Dict[str, Any], game: str) -> str:
    """
    Save an analysis to the database with a 24h expiry and keep only the
    newest MAX_ANALYSES_PER_GAME per user per game
    """
    analysis = Analysis.objects.create(
        user_id=user_id,
        game=game,
        user_text=user_text or "",
        expire_at=timezone.now() + timedelta(hours=ANALYSIS_TTL_HOURS),
        summary=analysis_result.get('explanation', ''),
        top_tips=analysis_result.get('top_tips') or [],
        training_drills=analysis_result.get('drills') or [],
        rating=analysis_result.get('rating'),
        confidence=analysis_result.get('estimated_score'),
        response_type=(analysis_result.get('meta') or {}).get('response_type', 'detailed'),
    )
    print(f"✅ Saved {game} analysis with ID: {analysis.pk} (TTL: {ANALYSIS_TTL_HOURS} hours)")

    _enforce_analysis_limit(user_id, game)
    delete_expired_analyses()

    return str(analysis.pk)


def save_fifa_analysis(user_id, user_text: str, analysis_result: Dict[str, Any]) -> str:
    return save_analysis(user_id, user_text, analysis_result, Analysis.GAME_FIFA)


def save_lol_analysis(user_id, user_text: str, analysis_result: Dict[str, Any]) -> str:
    return save_analysis(user_id, user_text, analysis_result, Analysis.GAME_LOL)


def get_recent_analyses(user_id, game: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Get a user's most recent, non-expired analyses for a game"""
    limit = max(1, min(limit, MAX_ANALYSES_PER_GAME))
    analyses = (
        Analysis.objects
        .filter(user_id=user_id, game=game, expire_at__gt=timezone.now())
        .order_by('-created_at')[:limit]
    )
    results = [analysis.to_dict() for analysis in analyses]
    print(f"✅ Found {len(results)} analyses for user {user_id} in {game}")
    return results


def delete_expired_analyses() -> int:
    """Delete every analysis past its expiry. Returns the number deleted."""
    deleted, _ = Analysis.objects.filter(expire_at__lte=timezone.now()).delete()
    return deleted


def _enforce_analysis_limit(user_id, game: str, limit: int = MAX_ANALYSES_PER_GAME):
    """Delete the oldest analyses beyond the per-user, per-game limit"""
    keep_ids = (
        Analysis.objects
        .filter(user_id=user_id, game=game)
        .order_by('-created_at')
        .values_list('pk', flat=True)[:limit]
    )
    deleted, _ = (
        Analysis.objects
        .filter(user_id=user_id, game=game)
        .exclude(pk__in=list(keep_ids))
        .delete()
    )
    if deleted:
        print(f"🧹 Deleted {deleted} old {game} analyses for user {user_id}")
