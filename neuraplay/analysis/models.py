from django.conf import settings
from django.db import models


class Analysis(models.Model):
    """A single AI coaching analysis for a user (replaces Firestore *_analyses collections)"""

    GAME_FIFA = "fifa"
    GAME_LOL = "lol"
    GAME_CHOICES = [
        (GAME_FIFA, "FIFA / EA FC"),
        (GAME_LOL, "League of Legends"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="analyses")
    game = models.CharField(max_length=10, choices=GAME_CHOICES)
    user_text = models.TextField(blank=True)

    summary = models.TextField(blank=True)
    top_tips = models.JSONField(default=list, blank=True)
    training_drills = models.JSONField(default=list, blank=True)
    rating = models.FloatField(null=True, blank=True)
    confidence = models.FloatField(null=True, blank=True)
    response_type = models.CharField(max_length=20, default="detailed")

    created_at = models.DateTimeField(auto_now_add=True)
    expire_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "analyses"
        indexes = [
            models.Index(fields=["user", "game", "-created_at"]),
        ]

    def to_dict(self) -> dict:
        """Serialize using the same keys the frontend received from Firestore"""
        return {
            "id": str(self.pk),
            "user_id": str(self.user_id),
            "user_text": self.user_text,
            "game": self.game,
            "created_at": self.created_at.isoformat(),
            "expire_at": self.expire_at.isoformat(),
            "summary": self.summary,
            "topTips": self.top_tips,
            "trainingDrills": self.training_drills,
            "rating": self.rating,
            "confidence": self.confidence,
            "responseType": self.response_type,
        }

    def __str__(self):
        return f"{self.get_game_display()} analysis for {self.user} ({self.created_at:%Y-%m-%d %H:%M})"
