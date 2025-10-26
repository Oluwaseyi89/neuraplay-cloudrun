import os
import json
import base64
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firestore only once
cred_json = base64.b64decode(os.getenv("FIREBASE_CREDENTIALS_BASE64"))
cred_dict = json.loads(cred_json)
cred = credentials.Certificate(cred_dict)

firebase_admin.initialize_app(cred)
db = firestore.client()  # Firestore client

# Save functions
def save_fifa_analysis(stats, result):
    db.collection("fifa_analyses").add({
        "stats": stats,
        "result": result,
        "timestamp": firestore.SERVER_TIMESTAMP
    })

def save_lol_analysis(stats, result):
    db.collection("lol_analyses").add({
        "stats": stats,
        "result": result,
        "timestamp": firestore.SERVER_TIMESTAMP
    })














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
