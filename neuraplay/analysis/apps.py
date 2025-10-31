# analysis/apps.py
from django.apps import AppConfig

class AnalysisConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'analysis'
    
    def ready(self):
        # This ensures tasks are loaded when Django starts
        import analysis.tasks

