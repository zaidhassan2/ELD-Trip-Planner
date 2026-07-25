"""
FMCSA Hours of Service scheduling engine.

Enforces property-carrying driver rules (70-hr/8-day cycle):
  - 14-hour on-duty window (breaks do NOT extend it; counts from first on-duty event)
  - 11-hour driving limit per shift
  - 30-minute break required after 8 cumulative driving hours in a shift
  - 10-hour consecutive off-duty/sleeper period resets the shift
  - 30-min pre/post trip inspections per shift
  - Fuel stop every <= 1,000 miles driven
  - 1 hour pickup and 1 hour dropoff (on duty, not driving)
  - No adverse driving conditions exception
  - No short-haul, CDL, or team-driving exceptions
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from .routing import RouteResult, location_at_fraction, reverse_geocode

# ── Status constants matching ELD logbook rows ────────────────────────────────
OFF_DUTY   = "off_duty"
SLEEPER    = "sleeper_berth"
DRIVING    = "driving"
ON_DUTY_ND = "on_duty_not_driving"

# ── FMCSA HOS constants ───────────────────────────────────────────────────────
PRE_TRIP_HOURS         = 0.5          # 30 min pre-trip inspection
POST_TRIP_HOURS        = 0.5          # 30 min post-trip inspection
BREAK_HOURS            = 0.5          # 30 min mandatory break
REST_HOURS             = 10.0         # 10-hr consecutive off-duty reset
MAX_DRIVE_HOURS        = 11.0         # 11-hr driving limit
MAX_DUTY_HOURS         = 14.0         # 14-hr on-duty window
BREAK_AFTER_DRIVE_HOURS = 8.0         # Break required after 8 cumulative drive hrs
PICKUP_HOURS           = 1.0          # 1-hr on-duty at pickup
DROPOFF_HOURS          = 1.0          # 1-hr on-duty at dropoff
FUEL_INTERVAL_MILES    = 1000.0       # Fuel every ≤1,000 miles
FUEL_STOP_HOURS        = 0.25         # 15-min fuel stop (on-duty ND)
CYCLE_LIMIT_HOURS      = 70.0         # 70-hr/8-day cycle
RESTART_HOURS          = 34.0         # 34-hr restart (optional, used when cycle full)
MAX_DRIVE_ITER         = 500          # Safety cap to prevent infinite loops


@dataclass
class StatusBlock:
    status: str
    start: datetime
    end: datetime
    location: str
    activity: str
    miles: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "start_time": self.start.strftime("%I:%M %p").lstrip("0"),
            "end_time": self.end.strftime("%I:%M %p").lstrip("0"),
            "duration_hours": round((self.end - self.start).total_seconds() / 3600, 4),
            "location": self.location,
            "activity": self.activity,
            "miles": round(self.miles, 2),
        }


@dataclass
class ShiftState:
    in_shift: bool = False
    duty_start: datetime | None = None
    drive_accumulated: float = 0.0   # Driving hours this shift
    break_taken: bool = False


class HOSEngine:
    def __init__(
        self,
        route: RouteResult,
        trip_start: datetime,
        cycle_used_hours: float = 0.0,
        carrier_name: str = "Spooter Logistics LLC",
        driver_name: str = "John Driver",
    ):
        self.route = route
        self.current_time = trip_start
        # Clamp to [0, 70]
        self.cycle_used = max(0.0, min(CYCLE_LIMIT_HOURS, float(cycle_used_hours)))
        self.carrier_name = carrier_name
        self.driver_name = driver_name
        self.blocks: list[StatusBlock] = []
        self.shift = ShiftState()
        self.total_miles_driven = 0.0
        self.miles_since_last_fuel = 0.0
        self._route_fraction = 0.0
        self._drive_iterations = 0

    # ── Location helpers ──────────────────────────────────────────────────────

    def _location(self, fraction: float | None = None) -> str:
        frac = self._route_fraction if fraction is None else fraction
        lat, lng = location_at_fraction(self.route.coordinates, frac)
        return reverse_geocode(lat, lng)

    # ── Block management ──────────────────────────────────────────────────────

    def _add_block(
        self,
        status: str,
        hours: float,
        location: str,
        activity: str,
        miles: float = 0.0,
    ) -> None:
        """Append a duty block. Ignores zero-duration blocks."""
        if hours <= 0:
            return
        start = self.current_time
        end = start + timedelta(hours=hours)
        self.blocks.append(
            StatusBlock(
                status=status,
                start=start,
                end=end,
                location=location,
                activity=activity,
                miles=miles,
            )
        )
        # Accumulate cycle hours (driving + on-duty-ND count; off-duty/sleeper don't)
        if status in (DRIVING, ON_DUTY_ND):
            self.cycle_used += hours
        self.current_time = end

    # ── Shift management ──────────────────────────────────────────────────────

    def _ensure_shift_started(self, location: str) -> None:
        """Open a new shift with pre-trip inspection if not already in one."""
        if not self.shift.in_shift:
            # Check cycle limit before starting a new shift
            if self.cycle_used >= CYCLE_LIMIT_HOURS:
                self._do_34hr_restart(location)
            self.shift = ShiftState(
                in_shift=True,
                duty_start=self.current_time,
                drive_accumulated=0.0,
                break_taken=False,
            )
            self._add_block(
                ON_DUTY_ND,
                PRE_TRIP_HOURS,
                location,
                "Pre-Trip Inspection",
            )

    def _duty_elapsed(self) -> float:
        """Hours elapsed since the current shift's duty_start."""
        if not self.shift.duty_start:
            return 0.0
        return (self.current_time - self.shift.duty_start).total_seconds() / 3600

    def _duty_room_for_driving(self) -> float:
        """Maximum driving hours left in the 14-hr duty window (accounting for post-trip)."""
        elapsed = self._duty_elapsed()
        room = MAX_DUTY_HOURS - elapsed - POST_TRIP_HOURS
        return max(0.0, room)

    def _drive_room_in_shift(self) -> float:
        """Remaining driving hours before the 11-hr limit."""
        return max(0.0, MAX_DRIVE_HOURS - self.shift.drive_accumulated)

    def _end_shift(self, location: str) -> None:
        """Close the current shift: post-trip inspection + 10-hr sleeper rest."""
        if not self.shift.in_shift:
            return
        self._add_block(ON_DUTY_ND, POST_TRIP_HOURS, location, "Post-Trip Inspection")
        self.shift.in_shift = False
        self._add_block(SLEEPER, REST_HOURS, location, "10-Hour Rest Period")
        self.shift = ShiftState()

    def _do_34hr_restart(self, location: str) -> None:
        """34-hour restart when cycle_used >= 70. Resets cycle to 0."""
        self._add_block(OFF_DUTY, RESTART_HOURS, location, "34-Hour Restart (Cycle Reset)")
        self.cycle_used = 0.0

    # ── Fuel handling ─────────────────────────────────────────────────────────

    def _maybe_fuel_stop(self, location: str) -> None:
        """Insert a fuel stop if miles since last fill >= FUEL_INTERVAL_MILES.

        A fuel stop is on-duty-not-driving and is NOT the same as a break —
        it occurs independently and does NOT satisfy the 30-min break requirement.
        However, if we happen to need a break AND a fuel stop at the same point,
        we insert fuel first (separate on-duty event), then the break separately.
        """
        if self.miles_since_last_fuel >= FUEL_INTERVAL_MILES:
            self._add_block(ON_DUTY_ND, FUEL_STOP_HOURS, location, "Fuel Stop")
            self.miles_since_last_fuel = 0.0

    # ── Core driving logic ────────────────────────────────────────────────────

    def _drive_chunk(
        self,
        remaining_drive_hours: float,
        remaining_miles: float,
        leg_start_frac: float,
        leg_end_frac: float,
    ) -> tuple[float, float]:
        """
        Drive as much as possible within current shift HOS limits.

        Returns (hours_driven, miles_driven) consumed from the remaining totals.
        Handles:
          - 11-hr drive limit
          - 14-hr duty window
          - 30-min break after 8 cumulative drive hours (distinct from fuel stop)
          - Fuel stop every 1,000 miles
          - Cycle limit → triggers 34-hr restart if needed
        """
        self._drive_iterations += 1
        if self._drive_iterations > MAX_DRIVE_ITER:
            raise RuntimeError(
                "Trip is infeasible: could not complete the route within HOS limits "
                "even with multiple rest/restart periods. Check cycle hours and route distance."
            )

        if remaining_drive_hours <= 0.001:
            return 0.0, 0.0

        # ── Cycle limit check ─────────────────────────────────────────────────
        if self.cycle_used >= CYCLE_LIMIT_HOURS:
            loc = self._location()
            self._do_34hr_restart(loc)
            # After restart, don't open a new shift here — let _ensure_shift_started do it

        location = self._location()
        self._ensure_shift_started(location)

        # ── Compute how much we CAN drive this iteration ──────────────────────
        hours_can_drive = remaining_drive_hours

        # 1. 11-hr driving limit
        drive_capacity = self._drive_room_in_shift()
        hours_can_drive = min(hours_can_drive, drive_capacity)

        # 2. 14-hr duty window (leave room for post-trip)
        duty_capacity = self._duty_room_for_driving()
        hours_can_drive = min(hours_can_drive, duty_capacity)

        # ── 30-min break after 8 hrs cumulative drive ─────────────────────────
        if (
            not self.shift.break_taken
            and hours_can_drive > 0
            and self.shift.drive_accumulated + hours_can_drive > BREAK_AFTER_DRIVE_HOURS
        ):
            drive_before_break = max(
                0.0, BREAK_AFTER_DRIVE_HOURS - self.shift.drive_accumulated
            )
            # Drive up to the 8-hr mark
            if drive_before_break > 0.001 and remaining_drive_hours > 0:
                ratio = drive_before_break / remaining_drive_hours
                frac_advance = ratio * (leg_end_frac - leg_start_frac)
                self._route_fraction = min(leg_end_frac, leg_start_frac + frac_advance)
                miles_part = remaining_miles * ratio

                loc_before = self._location()
                # Fuel check before the break
                self.miles_since_last_fuel += miles_part
                self.total_miles_driven += miles_part
                if self.miles_since_last_fuel >= FUEL_INTERVAL_MILES:
                    self._maybe_fuel_stop(loc_before)

                self._add_block(DRIVING, drive_before_break, loc_before, "Driving", miles=miles_part)
                self.shift.drive_accumulated += drive_before_break
                remaining_drive_hours -= drive_before_break
                remaining_miles -= miles_part
                leg_start_frac = self._route_fraction
            else:
                drive_before_break = 0.0
                miles_part = 0.0

            # Insert the 30-min break (OFF_DUTY, does NOT count against cycle in most interpretations,
            # but DOES count against the 14-hr window — we track time via current_time)
            self._add_block(OFF_DUTY, BREAK_HOURS, self._location(), "30-Minute Break")
            self.shift.break_taken = True

            # Recurse for the remaining driving after the break
            extra_h, extra_m = self._drive_chunk(
                remaining_drive_hours, remaining_miles, leg_start_frac, leg_end_frac
            )
            return drive_before_break + extra_h, miles_part + extra_m

        # ── No more room in shift — end shift and recurse ─────────────────────
        if hours_can_drive <= 0.001:
            loc = self._location()
            self._end_shift(loc)
            return self._drive_chunk(
                remaining_drive_hours, remaining_miles, leg_start_frac, leg_end_frac
            )

        # ── Drive the computed chunk ──────────────────────────────────────────
        if remaining_drive_hours > 0:
            ratio = hours_can_drive / remaining_drive_hours
        else:
            ratio = 0.0

        frac_advance = ratio * (leg_end_frac - leg_start_frac)
        self._route_fraction = min(leg_end_frac, leg_start_frac + frac_advance)
        miles_part = remaining_miles * ratio

        loc_now = self._location()

        # Fuel check: happens at this location BEFORE driving the block
        # (reflects reality: you top off at a truck stop, then drive the next segment)
        self.miles_since_last_fuel += miles_part
        self.total_miles_driven += miles_part
        if self.miles_since_last_fuel >= FUEL_INTERVAL_MILES:
            # Fuel stop is on-duty-ND; it eats into the 14-hr window
            # Check if there's still duty room before adding it
            duty_now = self._duty_room_for_driving()
            if duty_now >= FUEL_STOP_HOURS:
                self._maybe_fuel_stop(loc_now)
            # Reset tracking regardless (we'll refuel at next viable point)

        self._add_block(DRIVING, hours_can_drive, loc_now, "Driving", miles=miles_part)
        self.shift.drive_accumulated += hours_can_drive
        self.miles_since_last_fuel = max(0.0, self.miles_since_last_fuel)

        remaining_drive_hours -= hours_can_drive
        remaining_miles -= miles_part

        # ── Shift limit reached? ──────────────────────────────────────────────
        at_drive_limit = self.shift.drive_accumulated >= MAX_DRIVE_HOURS - 0.001
        at_duty_limit = self._duty_elapsed() >= MAX_DUTY_HOURS - POST_TRIP_HOURS - 0.001

        if remaining_drive_hours > 0.001 and (at_drive_limit or at_duty_limit):
            self._end_shift(self._location())
            extra_h, extra_m = self._drive_chunk(
                remaining_drive_hours,
                remaining_miles,
                self._route_fraction,
                leg_end_frac,
            )
            return hours_can_drive + extra_h, miles_part + extra_m

        return hours_can_drive, miles_part

    def _drive_leg(
        self,
        drive_hours: float,
        miles: float,
        frac_start: float,
        frac_end: float,
    ) -> None:
        """Drive an entire leg, handling HOS splits."""
        remaining_h  = drive_hours
        remaining_mi = miles
        frac         = frac_start
        iterations   = 0
        while remaining_h > 0.001 and iterations < MAX_DRIVE_ITER:
            iterations += 1
            driven_h, driven_mi = self._drive_chunk(
                remaining_h, remaining_mi, frac, frac_end
            )
            if driven_h <= 0.001:
                break
            remaining_h  -= driven_h
            remaining_mi -= driven_mi
            frac = self._route_fraction

    # ── On-duty stop (pickup/dropoff) ─────────────────────────────────────────

    def _add_duty_stop(self, hours: float, location: str, activity: str) -> None:
        """Add a pickup/dropoff on-duty block. Respects the 14-hr window."""
        self._ensure_shift_started(location)
        duty_room = self._duty_room_for_driving()  # room before post-trip window
        if duty_room < hours:
            # Not enough room in this shift — end it and start a new one
            self._end_shift(location)
            self._ensure_shift_started(location)
        self._add_block(ON_DUTY_ND, hours, location, activity)

    # ── Main orchestrator ─────────────────────────────────────────────────────

    def run(self) -> dict[str, Any]:
        """Execute the full trip schedule and return structured daily logs."""
        legs = self.route.legs

        # Leg fractions along the combined route polyline
        total_pts  = len(self.route.coordinates)
        leg0_end_f = legs[0].distance_miles / max(
            self.route.total_distance_miles, 0.001
        )
        leg1_end_f = (legs[0].distance_miles + legs[1].distance_miles) / max(
            self.route.total_distance_miles, 0.001
        )

        # ── Leg 0: current → pickup ───────────────────────────────────────────
        if legs[0].duration_hours > 0.001:
            self._drive_leg(
                legs[0].duration_hours,
                legs[0].distance_miles,
                0.0,
                leg0_end_f,
            )

        # ── Pickup (1 hr on-duty) ─────────────────────────────────────────────
        pickup_loc = self.route.waypoints[1]["city_state"]
        self._add_duty_stop(PICKUP_HOURS, pickup_loc, "Pickup")

        # ── Leg 1: pickup → dropoff ───────────────────────────────────────────
        if legs[1].duration_hours > 0.001:
            self._drive_leg(
                legs[1].duration_hours,
                legs[1].distance_miles,
                leg0_end_f,
                1.0,
            )

        # ── Dropoff (1 hr on-duty) ────────────────────────────────────────────
        dropoff_loc = self.route.waypoints[2]["city_state"]
        self._add_duty_stop(DROPOFF_HOURS, dropoff_loc, "Dropoff")

        # ── Final post-trip if still in shift ────────────────────────────────
        if self.shift.in_shift:
            self._add_block(
                ON_DUTY_ND, POST_TRIP_HOURS, dropoff_loc, "Post-Trip Inspection"
            )
            self.shift.in_shift = False

        daily_logs = self._build_daily_logs()
        return {
            "blocks": [b.to_dict() for b in self.blocks],
            "daily_logs": daily_logs,
            "summary": {
                "total_miles": round(self.route.total_distance_miles, 2),
                "total_drive_hours": round(self.route.total_duration_hours, 2),
                "cycle_used_hours": round(self.cycle_used, 2),
                "cycle_remaining_hours": round(
                    max(0.0, CYCLE_LIMIT_HOURS - self.cycle_used), 2
                ),
                "carrier_name": self.carrier_name,
                "driver_name": self.driver_name,
                "total_days": len(daily_logs),
                "num_fuel_stops": sum(
                    1 for b in self.blocks if b.activity == "Fuel Stop"
                ),
                "num_rest_periods": sum(
                    1 for b in self.blocks if b.activity == "10-Hour Rest Period"
                ),
                "num_breaks": sum(
                    1 for b in self.blocks if b.activity == "30-Minute Break"
                ),
            },
        }

    # ── Daily log sheet builder ───────────────────────────────────────────────

    def _build_daily_logs(self) -> list[dict[str, Any]]:
        """Split duty blocks into calendar days and pad to exactly 24 hours."""
        if not self.blocks:
            return []

        from datetime import date, time as dtime

        first_day = self.blocks[0].start.date()
        last_day  = self.blocks[-1].end.date()
        days: list[dict[str, Any]] = []

        current = first_day
        while current <= last_day:
            tz = self.blocks[0].start.tzinfo
            day_start = datetime.combine(current, dtime.min, tzinfo=tz)
            day_end   = day_start + timedelta(days=1)

            day_blocks: list[dict[str, Any]] = []
            remarks:    list[dict[str, Any]] = []
            miles = 0.0

            for block in self.blocks:
                if block.end <= day_start or block.start >= day_end:
                    continue

                clip_start = max(block.start, day_start)
                clip_end   = min(block.end,   day_end)
                duration   = (clip_end - clip_start).total_seconds() / 3600

                # start/end minutes within the 24-hr day (0–1440)
                sm = clip_start.hour * 60 + clip_start.minute + clip_start.second / 60
                em = clip_end.hour   * 60 + clip_end.minute   + clip_end.second   / 60
                # If the block ends exactly at midnight it clips to 1440
                if clip_end == day_end:
                    em = 1440.0

                day_blocks.append(
                    {
                        "status":         block.status,
                        "start":          clip_start.isoformat(),
                        "end":            clip_end.isoformat(),
                        "start_minutes":  sm,
                        "end_minutes":    em,
                        "duration_hours": round(duration, 4),
                        "location":       block.location,
                        "activity":       block.activity,
                    }
                )

                # Only add a remark when the block actually starts on this day
                if clip_start == block.start:
                    remarks.append(
                        {
                            "time":     clip_start.strftime("%I:%M %p").lstrip("0"),
                            "location": block.location,
                            "activity": block.activity,
                            "status":   block.status,
                        }
                    )

                # Miles: only count driving miles that began today
                if block.status == DRIVING and block.start >= day_start and block.start < day_end:
                    fraction_today = duration / max(
                        (block.end - block.start).total_seconds() / 3600, 0.001
                    )
                    miles += block.miles * fraction_today

            totals = self._daily_totals(day_start, day_end)

            # Skip empty trailing days (less than 1 minute of activity)
            if sum(totals.values()) < 23.98 and not day_blocks:
                current = date.fromordinal(current.toordinal() + 1)
                continue

            days.append(
                {
                    "date":         current.isoformat(),
                    "date_display": current.strftime("%A, %B %d, %Y"),
                    "blocks":       day_blocks,
                    "remarks":      remarks,
                    "totals":       totals,
                    "miles":        round(miles, 1),
                    "carrier_name": self.carrier_name,
                    "driver_name":  self.driver_name,
                }
            )
            current = date.fromordinal(current.toordinal() + 1)

        return days

    def _daily_totals(self, day_start: datetime, day_end: datetime) -> dict[str, float]:
        """Compute hours per status row for a single day. Always sums to 24.0."""
        totals = {OFF_DUTY: 0.0, SLEEPER: 0.0, DRIVING: 0.0, ON_DUTY_ND: 0.0}
        for block in self.blocks:
            if block.end <= day_start or block.start >= day_end:
                continue
            clip_start = max(block.start, day_start)
            clip_end   = min(block.end,   day_end)
            hours = (clip_end - clip_start).total_seconds() / 3600
            totals[block.status] = totals.get(block.status, 0) + hours

        # Pad any unaccounted time as Off Duty so the day always totals 24.0 hrs
        accounted = sum(totals.values())
        gap = 24.0 - accounted
        if gap > 0.005:
            totals[OFF_DUTY] += gap

        return {k: round(v, 2) for k, v in totals.items()}


# ── Public factory function ───────────────────────────────────────────────────

def generate_trip_schedule(
    route: RouteResult,
    trip_start: datetime,
    cycle_used_hours: float = 0.0,
    carrier_name: str = "Spooter Logistics LLC",
    driver_name: str = "John Driver",
) -> dict[str, Any]:
    """Validate inputs, run the HOS engine, and return the structured result."""
    cycle = float(cycle_used_hours)

    # Validate cycle hours
    if cycle < 0:
        raise ValueError("Current cycle used hours cannot be negative.")
    if cycle >= CYCLE_LIMIT_HOURS:
        raise ValueError(
            f"Cycle used is {cycle:.1f} hrs — the driver has reached the 70-hr/8-day limit "
            "and cannot legally drive. A 34-hour restart is required before this trip."
        )

    engine = HOSEngine(
        route=route,
        trip_start=trip_start,
        cycle_used_hours=cycle,
        carrier_name=carrier_name,
        driver_name=driver_name,
    )
    return engine.run()
