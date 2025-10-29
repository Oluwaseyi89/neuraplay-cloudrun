import os
import json
import base64
import firebase_admin
from firebase_admin import credentials, firestore
from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone


# Initialize Firestore only once
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
        'expire_at': _get_ttl_timestamp(24),  # Firestore will auto-delete after 24 hours
        
        # Flat structure for frontend
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
    
    # Only enforce document count limit (Firestore handles TTL)
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
        'expire_at': _get_ttl_timestamp(24),  # Firestore will auto-delete after 24 hours
        
        # Flat structure for frontend
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
    
    # Only enforce document count limit (Firestore handles TTL)
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
            
            # Convert timestamp to ISO format
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
    
    # Option 1: Current UTC time (recommended)
    return datetime.now(timezone.utc) + timedelta(hours=hours)
    
   

def _enforce_document_limit(user_id: str, game: str, limit: int = 10):
    """
    Enforce document limit by deleting oldest documents beyond the limit
    (Firestore handles TTL automatically)
    """
    collection_name = f'{game}_analyses'
    
    try:
        # Get all user documents ordered by creation date (oldest first)
        analyses_ref = db.collection(collection_name)
        query = analyses_ref.where('user_id', '==', user_id).order_by('created_at').limit(limit + 5)
        
        documents = list(query.stream())
        
        # If user has more than the limit, delete the oldest ones
        if len(documents) > limit:
            documents_to_delete = documents[:len(documents) - limit]
            
            print(f"🧹 Cleaning up {len(documents_to_delete)} old {game} analyses for user {user_id}")
            
            # Batch delete
            batch = db.batch()
            for doc in documents_to_delete:
                batch.delete(doc.reference)
            
            batch.commit()
            print(f"✅ Deleted {len(documents_to_delete)} old {game} analyses")
            
    except Exception as e:
        print(f"❌ Error enforcing document limit for {game}: {e}")














# import os
# import json
# import base64
# import firebase_admin
# from firebase_admin import credentials, firestore
# from typing import List, Dict, Any

# # Initialize Firestore only once
# cred_json = base64.b64decode(os.getenv("FIREBASE_CREDENTIALS_BASE64"))
# cred_dict = json.loads(cred_json)
# cred = credentials.Certificate(cred_dict)

# if not firebase_admin._apps:
#     firebase_admin.initialize_app(cred)
    
# db = firestore.client()

# def save_fifa_analysis(user_data: Dict[str, Any], analysis_result: Dict[str, Any]) -> str:
#     """
#     Save FIFA analysis with flat structure for frontend
#     """
#     user_id = user_data.get('user_id', '')
    
#     document_data = {
#         'user_id': user_id,
#         'user_text': user_data.get('text', ''),
#         'game': 'fifa',
#         'created_at': firestore.SERVER_TIMESTAMP,
        
#         # Flat structure for frontend
#         'summary': analysis_result.get('explanation', ''),
#         'topTips': analysis_result.get('top_tips', []),
#         'trainingDrills': analysis_result.get('drills', []),
#         'rating': analysis_result.get('rating'),
#         'confidence': analysis_result.get('estimated_score'),
#         'responseType': analysis_result.get('meta', {}).get('response_type', 'detailed')
#     }
    
#     doc_ref = db.collection('fifa_analyses').document()
#     doc_ref.set(document_data)
#     print(f"✅ Saved FIFA analysis with ID: {doc_ref.id}")
    
#     # Enforce 10-document limit per user
#     _enforce_document_limit(user_id, 'fifa')
    
#     return doc_ref.id

# def save_lol_analysis(user_data: Dict[str, Any], analysis_result: Dict[str, Any]) -> str:
#     """
#     Save LoL analysis with flat structure for frontend
#     """
#     user_id = user_data.get('user_id', '')
    
#     document_data = {
#         'user_id': user_id,
#         'user_text': user_data.get('text', ''),
#         'game': 'lol',
#         'created_at': firestore.SERVER_TIMESTAMP,
        
#         # Flat structure for frontend
#         'summary': analysis_result.get('explanation', ''),
#         'topTips': analysis_result.get('top_tips', []),
#         'trainingDrills': analysis_result.get('drills', []),
#         'rating': analysis_result.get('rating'),
#         'confidence': analysis_result.get('estimated_score'),
#         'responseType': analysis_result.get('meta', {}).get('response_type', 'detailed')
#     }
    
#     doc_ref = db.collection('lol_analyses').document()
#     doc_ref.set(document_data)
#     print(f"✅ Saved LoL analysis with ID: {doc_ref.id}")
    
#     # Enforce 10-document limit per user
#     _enforce_document_limit(user_id, 'lol')
    
#     return doc_ref.id

# def get_recent_analyses(user_id: str, game: str, limit: int = 10) -> List[Dict[str, Any]]:
#     """
#     Get recent analyses for a user
#     """
#     collection_name = f'{game}_analyses'
    
#     try:
#         analyses_ref = db.collection(collection_name)
#         query = analyses_ref.where('user_id', '==', user_id).order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit)
        
#         results = []
#         for doc in query.stream():
#             data = doc.to_dict()
#             data['id'] = doc.id
            
#             # Convert timestamp to ISO format
#             if 'created_at' in data and hasattr(data['created_at'], 'isoformat'):
#                 data['created_at'] = data['created_at'].isoformat()
            
#             results.append(data)
        
#         print(f"✅ Found {len(results)} analyses for user {user_id} in {game}")
#         return results
        
#     except Exception as e:
#         print(f"❌ Error fetching recent analyses: {e}")
#         return []

# def get_analysis_count(user_id: str, game: str) -> int:
#     """Get the total number of analyses for a user and game"""
#     collection_name = f'{game}_analyses'
    
#     try:
#         query = db.collection(collection_name).where('user_id', '==', user_id)
#         count = len(list(query.stream()))
#         print(f"📊 Analysis count for {user_id} in {game}: {count}")
#         return count
#     except Exception as e:
#         print(f"❌ Error counting analyses: {e}")
#         return 0

# def _enforce_document_limit(user_id: str, game: str, limit: int = 10):
#     """
#     Enforce document limit by deleting oldest documents beyond the limit
#     """
#     collection_name = f'{game}_analyses'
    
#     try:
#         # Get all user documents ordered by creation date (oldest first)
#         analyses_ref = db.collection(collection_name)
#         query = analyses_ref.where('user_id', '==', user_id).order_by('created_at').limit(limit + 5)  # Get a few extra
        
#         documents = list(query.stream())
        
#         # If user has more than the limit, delete the oldest ones
#         if len(documents) > limit:
#             documents_to_delete = documents[:len(documents) - limit]  # Get the oldest ones
            
#             print(f"🧹 Cleaning up {len(documents_to_delete)} old {game} analyses for user {user_id}")
            
#             # Batch delete
#             batch = db.batch()
#             for doc in documents_to_delete:
#                 batch.delete(doc.reference)
            
#             batch.commit()
#             print(f"✅ Deleted {len(documents_to_delete)} old {game} analyses")
            
#     except Exception as e:
#         print(f"❌ Error enforcing document limit for {game}: {e}")







# import os
# import json
# import base64
# import firebase_admin
# from firebase_admin import credentials, firestore
# from typing import List, Dict, Any

# # Initialize Firestore only once
# cred_json = base64.b64decode(os.getenv("FIREBASE_CREDENTIALS_BASE64"))
# cred_dict = json.loads(cred_json)
# cred = credentials.Certificate(cred_dict)

# if not firebase_admin._apps:
#     firebase_admin.initialize_app(cred)
    
# db = firestore.client()

# def save_fifa_analysis(user_data: Dict[str, Any], analysis_result: Dict[str, Any]) -> str:
#     """
#     Save FIFA analysis with flat structure for frontend
#     """
#     document_data = {
#         'user_id': user_data.get('user_id', ''),
#         'user_text': user_data.get('text', ''),
#         'game': 'fifa',
#         'created_at': firestore.SERVER_TIMESTAMP,
        
#         # Flat structure for frontend
#         'summary': analysis_result.get('explanation', ''),
#         'topTips': analysis_result.get('top_tips', []),
#         'trainingDrills': analysis_result.get('drills', []),
#         'rating': analysis_result.get('rating'),
#         'confidence': analysis_result.get('estimated_score'),
#         'responseType': analysis_result.get('meta', {}).get('response_type', 'detailed')
#     }
    
#     doc_ref = db.collection('fifa_analyses').document()
#     doc_ref.set(document_data)
#     print(f"✅ Saved FIFA analysis with ID: {doc_ref.id}")
#     return doc_ref.id

# def save_lol_analysis(user_data: Dict[str, Any], analysis_result: Dict[str, Any]) -> str:
#     """
#     Save LoL analysis with flat structure for frontend
#     """
#     document_data = {
#         'user_id': user_data.get('user_id', ''),
#         'user_text': user_data.get('text', ''),
#         'game': 'lol',
#         'created_at': firestore.SERVER_TIMESTAMP,
        
#         # Flat structure for frontend
#         'summary': analysis_result.get('explanation', ''),
#         'topTips': analysis_result.get('top_tips', []),
#         'trainingDrills': analysis_result.get('drills', []),
#         'rating': analysis_result.get('rating'),
#         'confidence': analysis_result.get('estimated_score'),
#         'responseType': analysis_result.get('meta', {}).get('response_type', 'detailed')
#     }
    
#     doc_ref = db.collection('lol_analyses').document()
#     doc_ref.set(document_data)
#     print(f"✅ Saved LoL analysis with ID: {doc_ref.id}")
#     return doc_ref.id

# def get_recent_analyses(user_id: str, game: str, limit: int = 10) -> List[Dict[str, Any]]:
#     """
#     Get recent analyses for a user
#     """
#     collection_name = f'{game}_analyses'
    
#     try:
#         analyses_ref = db.collection(collection_name)
#         query = analyses_ref.where('user_id', '==', user_id).order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit)
        
#         results = []
#         for doc in query.stream():
#             data = doc.to_dict()
#             data['id'] = doc.id
            
#             # Convert timestamp to ISO format
#             if 'created_at' in data and hasattr(data['created_at'], 'isoformat'):
#                 data['created_at'] = data['created_at'].isoformat()
            
#             results.append(data)
        
#         print(f"✅ Found {len(results)} analyses for user {user_id} in {game}")
#         return results
        
#     except Exception as e:
#         print(f"❌ Error fetching recent analyses: {e}")
#         return []

# def get_analysis_count(user_id: str, game: str) -> int:
#     """Get the total number of analyses for a user and game"""
#     collection_name = f'{game}_analyses'
    
#     try:
#         query = db.collection(collection_name).where('user_id', '==', user_id)
#         count = len(list(query.stream()))
#         print(f"📊 Analysis count for {user_id} in {game}: {count}")
#         return count
#     except Exception as e:
#         print(f"❌ Error counting analyses: {e}")
#         return 0











# import os
# import json
# import base64
# import firebase_admin
# from firebase_admin import credentials, firestore
# from typing import List, Dict, Any

# # Initialize Firestore only once
# cred_json = base64.b64decode(os.getenv("FIREBASE_CREDENTIALS_BASE64"))
# cred_dict = json.loads(cred_json)
# cred = credentials.Certificate(cred_dict)

# # Only initialize if not already initialized
# if not firebase_admin._apps:
#     firebase_admin.initialize_app(cred)
    
# db = firestore.client()  # Firestore client

# # Enhanced save functions with consistent data structure
# def save_fifa_analysis(user_data: Dict[str, Any], analysis_result: Dict[str, Any]) -> str:
#     """
#     Save FIFA analysis with consistent data structure
#     Args:
#         user_data: dict with 'user_id' and 'text' (voice input)
#         analysis_result: dict with analysis results
#     Returns:
#         Document ID
#     """
#     doc_ref = db.collection('fifa_analyses').document()
#     doc_ref.set({
#         'user_id': user_data.get('user_id', ''),
#         'user_text': user_data.get('text', ''),
#         'analysis': analysis_result,
#         'game': 'fifa',
#         'created_at': firestore.SERVER_TIMESTAMP,
#     })
#     return doc_ref.id

# def save_lol_analysis(user_data: Dict[str, Any], analysis_result: Dict[str, Any]) -> str:
#     """
#     Save LoL analysis with consistent data structure
#     Args:
#         user_data: dict with 'user_id' and 'text' (voice input)
#         analysis_result: dict with analysis results
#     Returns:
#         Document ID
#     """
#     doc_ref = db.collection('lol_analyses').document()
#     doc_ref.set({
#         'user_id': user_data.get('user_id', ''),
#         'user_text': user_data.get('text', ''),
#         'analysis': analysis_result,
#         'game': 'lol',
#         'created_at': firestore.SERVER_TIMESTAMP,
#     })
#     return doc_ref.id

# # def get_recent_analyses(user_id: str, game: str, limit: int = 10) -> List[Dict[str, Any]]:
# #     """
# #     Get recent analyses for a specific user and game
# #     Args:
# #         user_id: Firebase user ID
# #         game: 'fifa' or 'lol'
# #         limit: Maximum number of analyses to return (default: 10)
# #     Returns:
# #         List of analysis documents
# #     """
# #     if game == 'fifa':
# #         collection_name = 'fifa_analyses'
# #     elif game == 'lol':
# #         collection_name = 'lol_analyses'
# #     else:
# #         return []
    
# #     try:
# #         # Query analyses for this user, ordered by creation date (newest first)
# #         analyses_ref = db.collection(collection_name)
# #         query = analyses_ref.where('user_id', '==', user_id).order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit)
        
# #         results = []
# #         for doc in query.stream():
# #             data = doc.to_dict()
# #             data['id'] = doc.id
            
# #             # Convert timestamp to ISO format
# #             if 'created_at' in data and hasattr(data['created_at'], 'isoformat'):
# #                 data['created_at'] = data['created_at'].isoformat()
            
# #             results.append(data)
        
# #         return results
        
# #     except Exception as e:
# #         print(f"Error fetching recent analyses: {e}")
# #         return []


# def get_recent_analyses(user_id: str, game: str, limit: int = 10) -> List[Dict[str, Any]]:
#     """Get recent analyses - handle nested analysis field"""
#     if game == 'fifa':
#         collection_name = 'fifa_analyses'
#     elif game == 'lol':
#         collection_name = 'lol_analyses'
#     else:
#         return []
    
#     try:
#         # Query analyses for this user
#         analyses_ref = db.collection(collection_name)
#         query = analyses_ref.where('user_id', '==', user_id).order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit)
        
#         results = []
#         for doc in query.stream():
#             data = doc.to_dict()
#             data['id'] = doc.id
            
#             # Convert timestamp
#             if 'created_at' in data and hasattr(data['created_at'], 'isoformat'):
#                 data['created_at'] = data['created_at'].isoformat()
            
#             # EXTRACT ANALYSIS DATA TO TOP LEVEL for frontend compatibility
#             analysis_data = data.get('analysis', {})
#             if analysis_data:
#                 # Map the nested analysis fields to top-level fields for frontend
#                 data['summary'] = analysis_data.get('explanation', '')
#                 data['topTips'] = analysis_data.get('top_tips', [])
#                 data['trainingDrills'] = analysis_data.get('drills', [])
#                 data['rating'] = analysis_data.get('rating')
#                 data['confidence'] = analysis_data.get('estimated_score')
#                 data['responseType'] = analysis_data.get('meta', {}).get('response_type', 'detailed')
            
#             results.append(data)
        
#         return results
        
#     except Exception as e:
#         print(f"Error fetching recent analyses: {e}")
#         return []

# def get_analysis_count(user_id: str, game: str) -> int:
#     """
#     Get the total number of analyses for a user and game
#     """
#     if game == 'fifa':
#         collection_name = 'fifa_analyses'
#     elif game == 'lol':
#         collection_name = 'lol_analyses'
#     else:
#         return 0
    
#     try:
#         query = db.collection(collection_name).where('user_id', '==', user_id)
#         return len(list(query.stream()))
#     except Exception as e:
#         print(f"Error counting analyses: {e}")
#         return 0













# import os
# import json
# import base64
# import firebase_admin
# from firebase_admin import credentials, firestore
# from datetime import datetime
# from typing import List, Dict, Any, Optional

# # Initialize Firestore only once
# cred_json = base64.b64decode(os.getenv("FIREBASE_CREDENTIALS_BASE64"))
# cred_dict = json.loads(cred_json)
# cred = credentials.Certificate(cred_dict)

# # Only initialize if not already initialized
# if not firebase_admin._apps:
#     firebase_admin.initialize_app(cred)
    
# db = firestore.client()  # Firestore client

# # Backward compatible save functions (existing code remains unchanged)
# def save_fifa_analysis(stats, result):
#     """Original function - maintains backward compatibility"""
#     db.collection("fifa_analyses").add({
#         "stats": stats,
#         "result": result,
#         "timestamp": firestore.SERVER_TIMESTAMP
#     })

# def save_lol_analysis(stats, result):
#     """Original function - maintains backward compatibility"""
#     db.collection("lol_analyses").add({
#         "stats": stats,
#         "result": result,
#         "timestamp": firestore.SERVER_TIMESTAMP
#     })

# # New enhanced save functions with user_id support
# def save_fifa_analysis_v2(user_data: Dict[str, Any], analysis_result: Dict[str, Any]):
#     """
#     Enhanced FIFA analysis save with user_id and structured data
#     Args:
#         user_data: dict with 'user_id' and 'text' (voice input)
#         analysis_result: dict with analysis results
#     """
#     doc_ref = db.collection('fifa_analyses').document()
#     doc_ref.set({
#         'user_id': user_data.get('user_id', ''),
#         'user_text': user_data.get('text', ''),
#         'stats': user_data,  # Keep original stats for backward compatibility
#         'result': analysis_result,  # Keep original result for backward compatibility
#         'analysis': analysis_result,  # New structured field
#         'game': 'fifa',
#         'created_at': firestore.SERVER_TIMESTAMP,
#         'timestamp': firestore.SERVER_TIMESTAMP  # Keep original field for backward compatibility
#     })
#     return doc_ref.id

# def save_lol_analysis_v2(user_data: Dict[str, Any], analysis_result: Dict[str, Any]):
#     """
#     Enhanced LoL analysis save with user_id and structured data
#     Args:
#         user_data: dict with 'user_id' and 'text' (voice input)
#         analysis_result: dict with analysis results
#     """
#     doc_ref = db.collection('lol_analyses').document()
#     doc_ref.set({
#         'user_id': user_data.get('user_id', ''),
#         'user_text': user_data.get('text', ''),
#         'stats': user_data,  # Keep original stats for backward compatibility
#         'result': analysis_result,  # Keep original result for backward compatibility
#         'analysis': analysis_result,  # New structured field
#         'game': 'lol',
#         'created_at': firestore.SERVER_TIMESTAMP,
#         'timestamp': firestore.SERVER_TIMESTAMP  # Keep original field for backward compatibility
#     })
#     return doc_ref.id

# # New function to get recent analyses
# def get_recent_analyses(user_id: str, game: str, limit: int = 10) -> List[Dict[str, Any]]:
#     """
#     Get recent analyses for a specific user and game
#     Args:
#         user_id: Firebase user ID
#         game: 'fifa' or 'lol'
#         limit: Maximum number of analyses to return (default: 10)
#     Returns:
#         List of analysis documents with enhanced structure
#     """
#     if game == 'fifa':
#         collection_name = 'fifa_analyses'
#     elif game == 'lol':
#         collection_name = 'lol_analyses'
#     else:
#         return []
    
#     try:
#         # Query analyses for this user, ordered by creation date (newest first)
#         analyses_ref = db.collection(collection_name)
#         query = analyses_ref.where('user_id', '==', user_id).order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit)
        
#         results = []
#         for doc in query.stream():
#             data = doc.to_dict()
#             data['id'] = doc.id
            
#             # Handle timestamp conversion for consistent format
#             if 'created_at' in data:
#                 if hasattr(data['created_at'], 'isoformat'):
#                     data['created_at'] = data['created_at'].isoformat()
#                 elif isinstance(data['created_at'], str):
#                     # Already a string, keep as is
#                     pass
            
#             # Ensure we have the analysis field (for new structure)
#             if 'analysis' not in data and 'result' in data:
#                 data['analysis'] = data['result']
            
#             # Ensure we have user_text field
#             if 'user_text' not in data and 'stats' in data:
#                 if isinstance(data['stats'], dict) and 'text' in data['stats']:
#                     data['user_text'] = data['stats']['text']
#                 else:
#                     data['user_text'] = str(data['stats'])
            
#             results.append(data)
        
#         return results
        
#     except Exception as e:
#         print(f"Error fetching recent analyses: {e}")
#         return []

# # Backward compatibility wrapper functions
# def save_fifa_analysis_enhanced(user_data: Dict[str, Any], analysis_result: Dict[str, Any]):
#     """
#     Enhanced save function that works with both old and new code
#     This is the function your WebSocket consumer should use
#     """
#     return save_fifa_analysis_v2(user_data, analysis_result)

# def save_lol_analysis_enhanced(user_data: Dict[str, Any], analysis_result: Dict[str, Any]):
#     """
#     Enhanced save function that works with both old and new code
#     This is the function your WebSocket consumer should use
#     """
#     return save_lol_analysis_v2(user_data, analysis_result)

# # Utility function to get analysis count for a user
# def get_analysis_count(user_id: str, game: str) -> int:
#     """
#     Get the total number of analyses for a user and game
#     """
#     if game == 'fifa':
#         collection_name = 'fifa_analyses'
#     elif game == 'lol':
#         collection_name = 'lol_analyses'
#     else:
#         return 0
    
#     try:
#         query = db.collection(collection_name).where('user_id', '==', user_id)
#         return len(list(query.stream()))
#     except Exception as e:
#         print(f"Error counting analyses: {e}")
#         return 0

# # Migration helper (optional - for existing data)
# def migrate_old_analyses_to_new_structure():
#     """
#     Optional: Migrate old analysis documents to include user_id and new structure
#     Run this once if you have existing data without user_id
#     """
#     games = ['fifa_analyses', 'lol_analyses']
    
#     for collection_name in games:
#         try:
#             docs = db.collection(collection_name).where('user_id', '==', '').stream()
#             for doc in docs:
#                 data = doc.to_dict()
#                 # If we can extract user_id from stats, update the document
#                 if 'stats' in data and isinstance(data['stats'], dict) and 'user_id' in data['stats']:
#                     doc.reference.update({
#                         'user_id': data['stats']['user_id'],
#                         'user_text': data['stats'].get('text', ''),
#                         'analysis': data.get('result', {})
#                     })
#                     print(f"Migrated {collection_name} document: {doc.id}")
#         except Exception as e:
#             print(f"Error migrating {collection_name}: {e}")

















# import os
# import json
# import base64
# import firebase_admin
# from firebase_admin import credentials, firestore

# # Initialize Firestore only once
# cred_json = base64.b64decode(os.getenv("FIREBASE_CREDENTIALS_BASE64"))
# cred_dict = json.loads(cred_json)
# cred = credentials.Certificate(cred_dict)

# firebase_admin.initialize_app(cred)
# db = firestore.client()  # Firestore client

# # Save functions
# def save_fifa_analysis(stats, result):
#     db.collection("fifa_analyses").add({
#         "stats": stats,
#         "result": result,
#         "timestamp": firestore.SERVER_TIMESTAMP
#     })

# def save_lol_analysis(stats, result):
#     db.collection("lol_analyses").add({
#         "stats": stats,
#         "result": result,
#         "timestamp": firestore.SERVER_TIMESTAMP
#     })














# from neuraplay.settings import db  # Firestore client
# from firebase_admin import firestore

# # ------------------ FIFA ------------------
# def save_fifa_analysis(stats, result):
#     db.collection("fifa_analyses").add({
#         "stats": stats,
#         "result": result,
#         "timestamp": firestore.SERVER_TIMESTAMP
#     })

# def list_fifa_analyses(limit=10):
#     docs = db.collection("fifa_analyses").order_by(
#         "timestamp", direction=firestore.Query.DESCENDING
#     ).limit(limit).stream()
#     return [doc.to_dict() for doc in docs]

# # ------------------ LoL -------------------
# def save_lol_analysis(stats, result):
#     db.collection("lol_analyses").add({
#         "stats": stats,
#         "result": result,
#         "timestamp": firestore.SERVER_TIMESTAMP
#     })

# def list_lol_analyses(limit=10):
#     docs = db.collection("lol_analyses").order_by(
#         "timestamp", direction=firestore.Query.DESCENDING
#     ).limit(limit).stream()
#     return [doc.to_dict() for doc in docs]












# from neuraplay.settings import db  # Firestore client

# def save_fifa_analysis(stats, result):
#     db.collection("fifa_analyses").add({
#         "stats": stats,
#         "result": result,
#         "timestamp": firestore.SERVER_TIMESTAMP
#     })

# def list_fifa_analyses(limit=10):
#     docs = db.collection("fifa_analyses").order_by(
#         "timestamp", direction=firestore.Query.DESCENDING
#     ).limit(limit).stream()
#     return [doc.to_dict() for doc in docs]
