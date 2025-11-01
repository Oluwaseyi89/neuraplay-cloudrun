# build_config.py
import os
import sys
import base64
import json

def is_build_time():
    """Check if we're in a build-time command"""
    build_commands = ['collectstatic', 'migrate', 'makemigrations', 'test']
    return any(cmd in sys.argv for cmd in build_commands)

def get_env_safe(var_name, default=None, var_type=str):
    """
    Safely get environment variable during build time.
    Returns default value during build commands if env var is not set.
    """
    value = os.getenv(var_name)
    
    if value is None and is_build_time():
        print(f"⚠️  {var_name} not set during build, using safe default")
        return default
    elif value is None:
        raise ValueError(f"❌ {var_name} environment variable is required at runtime")
    
    # Convert type if needed
    try:
        if var_type == int:
            return int(value)
        elif var_type == bool:
            return value.lower() in ('true', '1', 'yes')
        elif var_type == float:
            return float(value)
        else:
            return value
    except (ValueError, TypeError):
        return value

# Your 7 environment variables with safe accessors
def get_django_secret_key():
    return get_env_safe('DJANGO_SECRET_KEY', 'dummy-secret-key-for-build-12345')

def get_gemini_api_key():
    return get_env_safe('GEMINI_API_KEY', 'dummy-gemini-api-key')

def get_project_id():
    return get_env_safe('PROJECT_ID', 'dummy-project-id')

def get_gemini_model():
    return get_env_safe('GEMINI_MODEL', 'gemini-1.5-flash')

def get_genai_timeout_seconds():
    return get_env_safe('GENAI_TIMEOUT_SECONDS', 30, var_type=int)

dummy_firebase_creds = json.dumps({
    "type": "service_account",
    "project_id": "dummy-project",
    "private_key_id": "dummy-key-id",
    "private_key": "-----BEGIN PRIVATE KEY-----\\ndummy-key\\n-----END PRIVATE KEY-----\\n",
    "client_email": "dummy@dummy-project.iam.gserviceaccount.com",
    "client_id": "123456789",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
})
dummy_firebase_creds_b64 = base64.b64encode(dummy_firebase_creds.encode()).decode()

def get_firebase_credentials():
    return get_env_safe('FIREBASE_CREDENTIALS_BASE64', dummy_firebase_creds_b64)

# Optional: Add a diagnostic function
def print_build_status():
    print('=== Build Configuration Status ===')
    print(f'Build time: {is_build_time()}')
    vars_to_check = [
        'DJANGO_SECRET_KEY',
        'GEMINI_API_KEY', 
        'PROJECT_ID',
        'GEMINI_MODEL',
        'GENAI_TIMEOUT_SECONDS',
        'FIREBASE_CREDENTIALS_BASE64'
    ]
    for var in vars_to_check:
        value = os.getenv(var)
        status = 'SET' if value else 'NOT SET'
        masked_value = f"({value[:10]}...)" if value and len(value) > 10 else value
        print(f'  {var}: {status} {masked_value}')
    print('==================================')