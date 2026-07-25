from rest_framework import serializers


class LocationField(serializers.JSONField):
    """
    Accepts either:
      - A plain string (e.g. "Chicago, IL")
      - A resolved object from the frontend autocomplete:
        {"lat": 41.8781, "lng": -87.6298, "city_state": "Chicago, IL", ...}
    """
    def to_internal_value(self, data):
        if isinstance(data, str):
            value = data.strip()
            if not value:
                raise serializers.ValidationError("Location cannot be empty.")
            if len(value) < 2:
                raise serializers.ValidationError(
                    "Location is too short. Please enter a valid city, state, or address."
                )
            return value
        if isinstance(data, dict):
            lat = data.get("lat")
            lng = data.get("lng")
            if lat is None or lng is None:
                raise serializers.ValidationError(
                    "Location object must include 'lat' and 'lng' fields."
                )
            try:
                float(lat)
                float(lng)
            except (TypeError, ValueError):
                raise serializers.ValidationError("lat and lng must be numeric.")
            return data
        raise serializers.ValidationError(
            "Location must be a string address or an autocomplete result object."
        )


class TripRequestSerializer(serializers.Serializer):
    current_location  = LocationField()
    pickup_location   = LocationField()
    dropoff_location  = LocationField()
    cycle_used_hours  = serializers.FloatField(min_value=0.0, max_value=70.0, default=0.0)
    trip_start        = serializers.DateTimeField(required=False)
    carrier_name      = serializers.CharField(
        max_length=200, required=False,
        default="Spooter Logistics LLC",
        allow_blank=True, trim_whitespace=True,
    )
    driver_name       = serializers.CharField(
        max_length=200, required=False,
        default="John Driver",
        allow_blank=True, trim_whitespace=True,
    )

    def validate_cycle_used_hours(self, value):
        if value < 0:
            raise serializers.ValidationError("Cycle hours used cannot be negative.")
        if value > 70:
            raise serializers.ValidationError(
                "Cycle hours used cannot exceed 70 (the 70-hr/8-day limit)."
            )
        # Round to 1 decimal place to avoid floating-point noise
        return round(value, 1)
