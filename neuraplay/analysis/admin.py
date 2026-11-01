from django.contrib import admin

from .models import Analysis


class ExpiredFilter(admin.SimpleListFilter):
    title = "expiry"
    parameter_name = "expired"

    def lookups(self, request, model_admin):
        return (("no", "Active"), ("yes", "Expired"))

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.expired()
        if self.value() == "no":
            return queryset.active()
        return queryset


@admin.register(Analysis)
class AnalysisAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "game", "rating", "response_type", "created_at", "expire_at")
    list_filter = ("game", "response_type", ExpiredFilter)
    search_fields = ("user__email", "user_text", "summary")
    raw_id_fields = ("user",)
