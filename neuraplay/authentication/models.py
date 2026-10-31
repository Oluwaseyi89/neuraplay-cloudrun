from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class NeuraPlayUserManager(UserManager):
    """User manager that treats email as the login identifier"""

    def get_by_natural_key(self, username):
        return self.get(**{f"{self.model.USERNAME_FIELD}__iexact": username})


class User(AbstractUser):
    """NeuraPlay user - logs in with email and password"""

    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    objects = NeuraPlayUserManager()

    class Meta:
        ordering = ["-date_joined"]

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def display_name(self) -> str:
        full_name = self.get_full_name()
        return full_name or self.username

    def __str__(self):
        return self.email
