from django.urls import path

from . import views

urlpatterns = [
    path("plan-trip/", views.plan_trip, name="plan_trip"),
    path("geocode-search/", views.geocode_search, name="geocode_search"),
    path("health/", views.health, name="health"),
]
