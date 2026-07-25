"""Route calculation and geocoding via free OSM services."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import requests

NOMINATIM_BASE  = "https://nominatim.openstreetmap.org"
NOMINATIM_URL   = f"{NOMINATIM_BASE}/search"
NOMINATIM_REV   = f"{NOMINATIM_BASE}/reverse"
OSRM_URL        = "https://router.project-osrm.org/route/v1/driving"
HEADERS         = {"User-Agent": "SpooterELD/1.0 (compliance-demo)"}

_geocode_cache: dict[str, str] = {}


@dataclass
class RouteLeg:
    distance_miles: float
    duration_hours: float
    coordinates: list[list[float]] = field(default_factory=list)
    steps: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class RouteResult:
    total_distance_miles: float
    total_duration_hours: float
    coordinates: list[list[float]]
    legs: list[RouteLeg]
    waypoints: list[dict[str, Any]]


# ── Geocoding ─────────────────────────────────────────────────────────────────

def search_places(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """
    Return up to `limit` place suggestions for autocomplete.

    Each result: {display_name, short_name, lat, lng, place_id}
    """
    query = query.strip()
    if not query:
        return []
    params = {
        "q": query,
        "format": "json",
        "limit": limit,
        "addressdetails": 1,
        "countrycodes": "us",
    }
    try:
        resp = requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        results = resp.json()
    except Exception:
        return []

    suggestions = []
    for hit in results:
        short = _extract_city_state(hit, fallback=hit.get("display_name", query))
        suggestions.append(
            {
                "display_name": hit.get("display_name", short),
                "short_name":   short,
                "lat":          float(hit["lat"]),
                "lng":          float(hit["lon"]),
                "place_id":     hit.get("place_id", ""),
            }
        )
    return suggestions


def geocode_address(address: str | dict) -> dict[str, Any]:
    """
    Resolve an address to lat/lng.

    Accepts:
      - A plain string ("Chicago, IL") → query Nominatim
      - A dict with pre-resolved {lat, lng, city_state} → pass through directly
        (used when frontend sends autocomplete-resolved coordinates)
    """
    # Pre-resolved payload from frontend autocomplete
    if isinstance(address, dict):
        lat = float(address.get("lat", 0))
        lng = float(address.get("lng", 0))
        city_state = address.get("city_state") or address.get("short_name") or f"{lat:.4f},{lng:.4f}"
        return {
            "lat": lat,
            "lng": lng,
            "display_name": address.get("display_name", city_state),
            "city_state": city_state,
        }

    address = address.strip()
    if not address:
        raise ValueError("Location cannot be empty.")

    params = {"q": address, "format": "json", "limit": 1, "addressdetails": 1, "countrycodes": "us"}
    try:
        resp = requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        results = resp.json()
    except requests.Timeout:
        raise ValueError(f"Geocoding timed out for '{address}'. Please try again.")
    except Exception as exc:
        raise ValueError(f"Geocoding failed for '{address}': {exc}")

    if not results:
        raise ValueError(
            f"No results found for '{address}'. Please check the address "
            "or select a suggestion from the autocomplete list."
        )

    hit = results[0]
    city_state = _extract_city_state(hit, fallback=address)
    return {
        "lat":          float(hit["lat"]),
        "lng":          float(hit["lon"]),
        "display_name": hit.get("display_name", address),
        "city_state":   city_state,
    }


def _extract_city_state(hit: dict, fallback: str = "") -> str:
    addr  = hit.get("address", {})
    city  = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("county")
        or ""
    )
    state = addr.get("state", "")
    if city:
        return f"{city}, {state}" if state else city
    return fallback or hit.get("display_name", "Unknown Location")


# ── Routing ───────────────────────────────────────────────────────────────────

def get_route(
    current: str | dict,
    pickup: str | dict,
    dropoff: str | dict,
) -> RouteResult:
    """Calculate multi-stop route: current → pickup → dropoff."""
    wp_current = geocode_address(current)
    wp_pickup  = geocode_address(pickup)
    wp_dropoff = geocode_address(dropoff)

    # Validate distinct locations (same lat/lng would produce a 0-mile leg — allowed but warn)
    coords_str = ";".join(
        f"{wp['lng']},{wp['lat']}"
        for wp in [wp_current, wp_pickup, wp_dropoff]
    )
    url = (
        f"{OSRM_URL}/{coords_str}"
        "?overview=full&geometries=geojson&steps=true&annotations=true"
    )

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.Timeout:
        raise ValueError(
            "Route calculation timed out. The routing service may be temporarily unavailable."
        )
    except Exception as exc:
        raise ValueError(f"Routing service error: {exc}")

    if data.get("code") != "Ok" or not data.get("routes"):
        # OSRM returns a message explaining the failure
        msg = data.get("message", "")
        if "NoRoute" in data.get("code", ""):
            raise ValueError(
                "No drivable route found between the provided locations. "
                "Check that all locations are reachable by road (e.g., not on islands or overseas)."
            )
        raise ValueError(
            f"Routing service could not find a route. {msg}".strip()
        )

    route     = data["routes"][0]
    all_coords = route["geometry"]["coordinates"]
    # OSRM returns [lng, lat]; convert to [lat, lng] for Leaflet
    leaflet_coords = [[c[1], c[0]] for c in all_coords]

    legs: list[RouteLeg] = []
    total_dist = 0.0
    total_dur  = 0.0
    n_coords   = len(leaflet_coords)

    for idx, leg in enumerate(route.get("legs", [])):
        dist_mi = leg["distance"] / 1609.344
        dur_hr  = leg["duration"] / 3600
        total_dist += dist_mi
        total_dur  += dur_hr

        leg_steps = []
        for step in leg.get("steps", []):
            leg_steps.append(
                {
                    "distance_miles": step["distance"] / 1609.344,
                    "duration_hours": step["duration"] / 3600,
                    "name":           step.get("name") or step.get("ref") or "",
                    "maneuver":       step.get("maneuver", {}).get("type", ""),
                }
            )

        # Slice the full polyline proportionally by leg distance
        prev_dist = sum(
            route["legs"][j]["distance"] for j in range(idx)
        )
        this_end_dist = prev_dist + leg["distance"]
        total_raw_dist = sum(l["distance"] for l in route["legs"])
        frac_s = prev_dist / max(total_raw_dist, 1)
        frac_e = this_end_dist / max(total_raw_dist, 1)
        start_i = int(frac_s * (n_coords - 1))
        end_i   = min(int(frac_e * (n_coords - 1)) + 1, n_coords)
        leg_coords = leaflet_coords[start_i:end_i]

        legs.append(
            RouteLeg(
                distance_miles=round(dist_mi, 2),
                duration_hours=round(dur_hr, 4),
                coordinates=leg_coords,
                steps=leg_steps,
            )
        )

    waypoints = [
        {"label": "Current Location", "address": current if isinstance(current, str) else current.get("display_name",""), **wp_current},
        {"label": "Pickup",           "address": pickup  if isinstance(pickup,  str) else pickup.get("display_name",""),  **wp_pickup},
        {"label": "Dropoff",          "address": dropoff if isinstance(dropoff, str) else dropoff.get("display_name",""), **wp_dropoff},
    ]

    return RouteResult(
        total_distance_miles=round(total_dist, 2),
        total_duration_hours=round(total_dur,  4),
        coordinates=leaflet_coords,
        legs=legs,
        waypoints=waypoints,
    )


# ── Coordinate utilities ──────────────────────────────────────────────────────

def location_at_fraction(
    coordinates: list[list[float]], fraction: float
) -> tuple[float, float]:
    """Return (lat, lng) at a given fraction (0–1) along the route polyline."""
    if not coordinates:
        return 0.0, 0.0
    fraction = max(0.0, min(1.0, fraction))
    idx = int(fraction * (len(coordinates) - 1))
    return coordinates[idx][0], coordinates[idx][1]


def reverse_geocode(lat: float, lng: float) -> str:
    """Best-effort city/state from coordinates. Returns a coordinate string on failure."""
    cache_key = f"{round(lat, 2)},{round(lng, 2)}"
    if cache_key in _geocode_cache:
        return _geocode_cache[cache_key]

    coord_fallback = f"{lat:.2f}°N, {abs(lng):.2f}°{'W' if lng < 0 else 'E'}"
    try:
        params = {"lat": lat, "lon": lng, "format": "json", "zoom": 10, "addressdetails": 1}
        resp = requests.get(NOMINATIM_REV, params=params, headers=HEADERS, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        result = _extract_city_state(data, fallback=coord_fallback)
        _geocode_cache[cache_key] = result
        return result
    except Exception:
        return coord_fallback


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return r * 2 * math.asin(math.sqrt(a))
