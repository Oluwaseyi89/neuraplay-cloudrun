"""
URL configuration for neuraplay project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse

def url_debug(request):
    """Debug function to list all available URLs"""
    from django.urls import get_resolver
    urls = []
    resolver = get_resolver()
    
    def extract_urls(pattern_list, prefix=''):
        for pattern in pattern_list:
            if hasattr(pattern, 'url_patterns'):
                extract_urls(pattern.url_patterns, prefix + str(pattern.pattern))
            else:
                urls.append(prefix + str(pattern.pattern))
    
    extract_urls(resolver.url_patterns)
    return HttpResponse("<br>".join(sorted(urls)))

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/", include("analysis.urls")),
    path('debug/urls/', url_debug),  
]
