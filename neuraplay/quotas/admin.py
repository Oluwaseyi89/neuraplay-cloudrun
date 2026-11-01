from django.contrib import admin

from .models import DailyUsage


@admin.register(DailyUsage)
class DailyUsageAdmin(admin.ModelAdmin):
    """Inspect usage; delete a row to reset that user's or IP's quota for the day"""
    list_display = ("scope", "key", "day", "count", "updated_at")
    list_filter = ("scope", "day")
    search_fields = ("key",)
    readonly_fields = ("scope", "key", "day", "count", "updated_at")

    def has_add_permission(self, request):
        return False
