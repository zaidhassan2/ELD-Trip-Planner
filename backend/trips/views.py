from datetime import datetime, timezone

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .serializers import TripRequestSerializer
from .services.hos_engine import generate_trip_schedule
from .services.routing import get_route, search_places


@api_view(["POST"])
def plan_trip(request):
    """
    POST /api/plan-trip/

    Body (JSON):
      current_location  – string OR {lat, lng, city_state} object
      pickup_location   – string OR {lat, lng, city_state} object
      dropoff_location  – string OR {lat, lng, city_state} object
      cycle_used_hours  – float 0–70
      trip_start        – ISO datetime (optional, defaults to now UTC)
      carrier_name      – string (optional)
      driver_name       – string (optional)
    """
    serializer = TripRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    trip_start = data.get("trip_start") or datetime.now(timezone.utc)

    # ── Location validation ────────────────────────────────────────────────────
    current_loc  = data["current_location"]
    pickup_loc   = data["pickup_location"]
    dropoff_loc  = data["dropoff_location"]

    # Detect identical pickup == dropoff (by text; lat/lng check done in routing)
    current_str  = _loc_key(current_loc)
    pickup_str   = _loc_key(pickup_loc)
    dropoff_str  = _loc_key(dropoff_loc)

    if pickup_str == dropoff_str:
        return Response(
            {"error": "Pickup and dropoff locations are identical. Please use different locations."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Routing ────────────────────────────────────────────────────────────────
    try:
        route = get_route(current_loc, pickup_loc, dropoff_loc)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        return Response(
            {"error": f"Routing service failed: {exc}. Please try again or check your locations."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    # ── HOS scheduling ────────────────────────────────────────────────────────
    try:
        schedule = generate_trip_schedule(
            route=route,
            trip_start=trip_start,
            cycle_used_hours=data["cycle_used_hours"],
            carrier_name=data["carrier_name"],
            driver_name=data["driver_name"],
        )
    except ValueError as exc:
        # Cycle validation errors, infeasibility notices
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except RuntimeError as exc:
        # Infeasible trip (loop guard triggered)
        return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
    except Exception as exc:
        return Response(
            {"error": f"Schedule calculation failed: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {
            "route": {
                "total_distance_miles": route.total_distance_miles,
                "total_duration_hours": route.total_duration_hours,
                "coordinates": route.coordinates,
                "waypoints": route.waypoints,
                "legs": [
                    {
                        "distance_miles": leg.distance_miles,
                        "duration_hours": leg.duration_hours,
                    }
                    for leg in route.legs
                ],
            },
            "schedule": schedule,
        }
    )


@api_view(["GET"])
def geocode_search(request):
    """
    GET /api/geocode-search/?q=Chicago&limit=5

    Returns up to `limit` autocomplete suggestions for the query string.
    Used by the frontend LocationAutocomplete component.

    Response: [{display_name, short_name, lat, lng, place_id}, ...]
    """
    query = request.query_params.get("q", "").strip()
    if not query or len(query) < 2:
        return Response([])

    try:
        limit = int(request.query_params.get("limit", 5))
        limit = max(1, min(10, limit))
    except (TypeError, ValueError):
        limit = 5

    results = search_places(query, limit=limit)
    return Response(results)


@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _loc_key(loc) -> str:
    """Normalize a location value (string or dict) to a comparable string."""
    if isinstance(loc, dict):
        lat = round(float(loc.get("lat", 0)), 3)
        lng = round(float(loc.get("lng", 0)), 3)
        return f"{lat},{lng}"
    return str(loc).strip().lower()
