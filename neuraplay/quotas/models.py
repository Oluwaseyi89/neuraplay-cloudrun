from django.db import models


class DailyUsage(models.Model):
    """How many analysis requests one user or one IP made on one UTC day"""

    SCOPE_USER = "user"
    SCOPE_IP = "ip"
    SCOPE_CHOICES = [
        (SCOPE_USER, "User"),
        (SCOPE_IP, "IP address"),
    ]

    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    # User id for user scope; keyed hash of the address for IP scope (raw IPs are never stored)
    key = models.CharField(max_length=64)
    day = models.DateField()
    count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-day", "scope", "key"]
        verbose_name_plural = "daily usage"
        constraints = [
            models.UniqueConstraint(fields=["scope", "key", "day"], name="unique_daily_usage_per_key"),
        ]

    def __str__(self):
        return f"{self.get_scope_display()} {self.key} on {self.day}: {self.count}"
