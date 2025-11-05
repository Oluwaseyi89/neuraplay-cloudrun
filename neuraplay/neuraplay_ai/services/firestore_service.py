import os
import json
import base64
import firebase_admin
from firebase_admin import credentials, firestore
from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone


cred_json = base64.b64decode(os.getenv("FIREBASE_CREDENTIALS_BASE64"))
cred_dict = json.loads(cred_json)
cred = credentials.Certificate(cred_dict)

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)
    
db = firestore.client()

def save_fifa_analysis(user_data: Dict[str, Any], analysis_result: Dict[str, Any]) -> str:
    """
    Save FIFA analysis with TTL field for Firestore automatic cleanup
    """
    user_id = user_data.get('user_id', '')
    
    document_data = {
        'user_id': user_id,
        'user_text': user_data.get('text', ''),
        'game': 'fifa',
        'created_at': firestore.SERVER_TIMESTAMP,
        'expire_at': _get_ttl_timestamp(24),  
        
        'summary': analysis_result.get('explanation', ''),
        'topTips': analysis_result.get('top_tips', []),
        'trainingDrills': analysis_result.get('drills', []),
        'rating': analysis_result.get('rating'),
        'confidence': analysis_result.get('estimated_score'),
        'responseType': analysis_result.get('meta', {}).get('response_type', 'detailed')
    }
    
    doc_ref = db.collection('fifa_analyses').document()
    doc_ref.set(document_data)
    print(f"✅ Saved FIFA analysis with ID: {doc_ref.id} (TTL: 24 hours)")
    
    _enforce_document_limit(user_id, 'fifa')
    
    return doc_ref.id

def save_lol_analysis(user_data: Dict[str, Any], analysis_result: Dict[str, Any]) -> str:
    """
    Save LoL analysis with TTL field for Firestore automatic cleanup
    """
    user_id = user_data.get('user_id', '')
    
    document_data = {
        'user_id': user_id,
        'user_text': user_data.get('text', ''),
        'game': 'lol',
        'created_at': firestore.SERVER_TIMESTAMP,
        'expire_at': _get_ttl_timestamp(24), 
        
        'summary': analysis_result.get('explanation', ''),
        'topTips': analysis_result.get('top_tips', []),
        'trainingDrills': analysis_result.get('drills', []),
        'rating': analysis_result.get('rating'),
        'confidence': analysis_result.get('estimated_score'),
        'responseType': analysis_result.get('meta', {}).get('response_type', 'detailed')
    }
    
    doc_ref = db.collection('lol_analyses').document()
    doc_ref.set(document_data)
    print(f"✅ Saved LoL analysis with ID: {doc_ref.id} (TTL: 24 hours)")
    
    _enforce_document_limit(user_id, 'lol')
    
    return doc_ref.id

def get_recent_analyses(user_id: str, game: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get recent analyses for a user - Firestore TTL handles expired docs automatically
    """
    collection_name = f'{game}_analyses'
    
    try:
        analyses_ref = db.collection(collection_name)
        query = analyses_ref.where('user_id', '==', user_id).order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit)
        
        results = []
        for doc in query.stream():
            data = doc.to_dict()
            data['id'] = doc.id
            
            if 'created_at' in data and hasattr(data['created_at'], 'isoformat'):
                data['created_at'] = data['created_at'].isoformat()
            
            results.append(data)
        
        print(f"✅ Found {len(results)} analyses for user {user_id} in {game}")
        return results
        
    except Exception as e:
        print(f"❌ Error fetching recent analyses: {e}")
        return []

def get_analysis_count(user_id: str, game: str) -> int:
    """Get the total number of analyses for a user and game"""
    collection_name = f'{game}_analyses'
    
    try:
        query = db.collection(collection_name).where('user_id', '==', user_id)
        count = len(list(query.stream()))
        print(f"📊 Analysis count for {user_id} in {game}: {count}")
        return count
    except Exception as e:
        print(f"❌ Error counting analyses: {e}")
        return 0


def _get_ttl_timestamp(hours: int = 24):
    """Alternative approaches"""
    
    return datetime.now(timezone.utc) + timedelta(hours=hours)
    
   

def _enforce_document_limit(user_id: str, game: str, limit: int = 10):
    """
    Enforce document limit by deleting oldest documents beyond the limit
    (Firestore handles TTL automatically)
    """
    collection_name = f'{game}_analyses'
    
    try:
        analyses_ref = db.collection(collection_name)
        query = analyses_ref.where('user_id', '==', user_id).order_by('created_at').limit(limit + 5)
        
        documents = list(query.stream())
        
        if len(documents) > limit:
            documents_to_delete = documents[:len(documents) - limit]
            
            print(f"🧹 Cleaning up {len(documents_to_delete)} old {game} analyses for user {user_id}")
            
            batch = db.batch()
            for doc in documents_to_delete:
                batch.delete(doc.reference)
            
            batch.commit()
            print(f"✅ Deleted {len(documents_to_delete)} old {game} analyses")
            
    except Exception as e:
        print(f"❌ Error enforcing document limit for {game}: {e}")

