from celery import shared_task
from neuraplay_ai.services.analysis_service import delete_expired_analyses
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

@shared_task
def cleanup_expired_analyses():
    """
    Automatic task to clean up expired analyses.
    Runs every hour automatically via Celery Beat.
    """
    try:
        now = datetime.now(timezone.utc)
        logger.info(f"🕒 Starting automatic cleanup at: {now}")

        total_deleted = delete_expired_analyses()

        logger.info(f"🎯 Automatic cleanup completed. Total deleted: {total_deleted}")
        return {
            'success': True,
            'total_deleted': total_deleted,
            'timestamp': now.isoformat()
        }

    except Exception as e:
        logger.error(f"💥 Critical error in cleanup task: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
