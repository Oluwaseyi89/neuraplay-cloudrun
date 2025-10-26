import os, json, base64
import firebase_admin
from firebase_admin import credentials, firestore

cred_json = base64.b64decode(os.getenv("FIREBASE_CREDENTIALS_BASE64"))
cred_dict = json.loads(cred_json)
cred = credentials.Certificate(cred_dict)

firebase_admin.initialize_app(cred)
db = firestore.client()
