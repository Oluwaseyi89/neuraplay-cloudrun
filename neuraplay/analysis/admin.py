from django.contrib import admin

from .models import Analysis


@admin.register(Analysis)
class AnalysisAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "game", "rating", "response_type", "created_at", "expire_at")
    list_filter = ("game", "response_type")
    search_fields = ("user__email", "user_text", "summary")
    raw_id_fields = ("user",)
