from django.core.management.base import BaseCommand

from neuraplay_ai.services.analysis_service import delete_expired_analyses


class Command(BaseCommand):
    help = "Delete analyses past their 24h expiry (schedule with a Render Cron Job if needed)"

    def handle(self, *args, **options):
        deleted = delete_expired_analyses()
        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted} expired analyses"))
