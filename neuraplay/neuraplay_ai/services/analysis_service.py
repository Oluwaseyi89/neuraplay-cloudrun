from typing import List, Dict, Any
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from analysis.models import Analysis

MAX_ANALYSES_PER_GAME = 10


def save_analysis(user_id, user_text: str, analysis_result: Dict[str, Any], game: str) -> str:
    """
    Save an analysis that expires after ANALYSIS_TTL_HOURS and keep only the
    newest MAX_ANALYSES_PER_GAME per user per game
    """
    ttl_hours = settings.ANALYSIS_TTL_HOURS
    analysis = Analysis.objects.create(
        user_id=user_id,
        game=game,
        user_text=user_text or "",
        expire_at=timezone.now() + timedelta(hours=ttl_hours),
        summary=analysis_result.get('explanation', ''),
        top_tips=analysis_result.get('top_tips') or [],
        training_drills=analysis_result.get('drills') or [],
        rating=analysis_result.get('rating'),
        confidence=analysis_result.get('estimated_score'),
        response_type=(analysis_result.get('meta') or {}).get('response_type', 'detailed'),
    )
    print(f"✅ Saved {game} analysis with ID: {analysis.pk} (TTL: {ttl_hours} hours)")

    _enforce_analysis_limit(user_id, game)
    delete_expired_analyses_for_user(user_id)

    return str(analysis.pk)


def save_fifa_analysis(user_id, user_text: str, analysis_result: Dict[str, Any]) -> str:
    return save_analysis(user_id, user_text, analysis_result, Analysis.GAME_FIFA)


def save_lol_analysis(user_id, user_text: str, analysis_result: Dict[str, Any]) -> str:
    return save_analysis(user_id, user_text, analysis_result, Analysis.GAME_LOL)


def get_recent_analyses(user_id, game: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Get a user's most recent, non-expired analyses for a game"""
    delete_expired_analyses_for_user(user_id)

    limit = max(1, min(limit, MAX_ANALYSES_PER_GAME))
    analyses = (
        Analysis.objects
        .active()
        .filter(user_id=user_id, game=game)
        .order_by('-created_at')[:limit]
    )
    results = [analysis.to_dict() for analysis in analyses]
    print(f"✅ Found {len(results)} analyses for user {user_id} in {game}")
    return results


def delete_expired_analyses_for_user(user_id) -> int:
    """Enforce the TTL for one user whenever they save or read analyses"""
    deleted, _ = Analysis.objects.expired().filter(user_id=user_id).delete()
    return deleted


def delete_expired_analyses() -> int:
    """Delete every user's expired analyses (cleanup_analyses command). Returns the number deleted."""
    deleted, _ = Analysis.objects.expired().delete()
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
