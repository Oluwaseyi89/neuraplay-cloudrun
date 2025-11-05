from celery import shared_task
from neuraplay_ai.services.firestore_service import db
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
        collections = ['fifa_analyses', 'lol_analyses']
        total_deleted = 0
        
        logger.info(f"🕒 Starting automatic cleanup at: {now}")
        
        for collection_name in collections:
            try:
                query = db.collection(collection_name).where('expire_at', '<=', now)
                docs = list(query.stream())
                
                if docs:
                    batch = db.batch()
                    for doc in docs:
                        batch.delete(doc.reference)
                    
                    batch.commit()
                    total_deleted += len(docs)
                    logger.info(f"✅ Deleted {len(docs)} expired documents from {collection_name}")
                else:
                    logger.info(f"📊 No expired documents in {collection_name}")
                    
            except Exception as e:
                logger.error(f"❌ Error cleaning up {collection_name}: {str(e)}")
        
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