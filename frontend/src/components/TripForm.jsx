import { useState } from 'react';
import {
  Clock, Gauge, User, Building2, Loader2, ChevronRight, RotateCcw, AlertTriangle
} from 'lucide-react';
import LocationAutocomplete from './LocationAutocomplete';

const SAMPLE_TRIPS = [
  {
    label: 'Chicago → Dallas',
    emoji: '🏙️',
    current:  { lat: 41.8781, lng: -87.6298, city_state: 'Chicago, IL',       short_name: 'Chicago, IL',       display_name: 'Chicago, Cook County, Illinois, United States' },
    pickup:   { lat: 39.7684, lng: -86.1581, city_state: 'Indianapolis, IN',  short_name: 'Indianapolis, IN',  display_name: 'Indianapolis, Marion County, Indiana, United States' },
    dropoff:  { lat: 32.7767, lng: -96.7970, city_state: 'Dallas, TX',        short_name: 'Dallas, TX',        display_name: 'Dallas, Dallas County, Texas, United States' },
    cycle: 12,
  },
  {
    label: 'LA → Seattle',
    emoji: '🌊',
    current:  { lat: 34.0522, lng: -118.2437, city_state: 'Los Angeles, CA',  short_name: 'Los Angeles, CA',  display_name: 'Los Angeles, Los Angeles County, California, United States' },
    pickup:   { lat: 38.5816, lng: -121.4944, city_state: 'Sacramento, CA',   short_name: 'Sacramento, CA',   display_name: 'Sacramento, Sacramento County, California, United States' },
    dropoff:  { lat: 47.6062, lng: -122.3321, city_state: 'Seattle, WA',      short_name: 'Seattle, WA',      display_name: 'Seattle, King County, Washington, United States' },
    cycle: 5,
  },
  {
    label: 'NYC → Miami',
    emoji: '🌴',
    current:  { lat: 40.7128, lng: -74.0060,  city_state: 'New York City, NY', short_name: 'New York City, NY', display_name: 'New York City, New York, United States' },
    pickup:   { lat: 39.9526, lng: -75.1652,  city_state: 'Philadelphia, PA',  short_name: 'Philadelphia, PA',  display_name: 'Philadelphia, Philadelphia County, Pennsylvania, United States' },
    dropoff:  { lat: 25.7617, lng: -80.1918,  city_state: 'Miami, FL',         short_name: 'Miami, FL',         display_name: 'Miami, Miami-Dade County, Florida, United States' },
    cycle: 0,
  },
];

const DEFAULTS = {
  current_location:  SAMPLE_TRIPS[0].current,
  pickup_location:   SAMPLE_TRIPS[0].pickup,
  dropoff_location:  SAMPLE_TRIPS[0].dropoff,
  cycle_used_hours:  0,
  driver_name:       'John Driver',
  carrier_name:      'Spooter Logistics LLC',
};

export default function TripForm({ onSubmit, loading }) {
  const [form, setForm] = useState(DEFAULTS);
  const [activePreset, setActivePreset] = useState(0);
  const [formErrors, setFormErrors] = useState({});

  // ── Location field change handler ──────────────────────────────────────────
  const handleLocationChange = (name, value) => {
    setActivePreset(null);
    setFormErrors((prev) => ({ ...prev, [name]: null }));
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ── Scalar field change handler ────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setActivePreset(null);

    if (name === 'cycle_used_hours') {
      // Clamp and validate
      const raw = value === '' ? 0 : parseFloat(value);
      const clamped = isNaN(raw) ? 0 : Math.max(0, Math.min(70, raw));
      setForm((prev) => ({ ...prev, [name]: clamped }));
      if (raw > 70) {
        setFormErrors((prev) => ({ ...prev, cycle_used_hours: 'Cannot exceed 70 hours.' }));
      } else if (raw < 0) {
        setFormErrors((prev) => ({ ...prev, cycle_used_hours: 'Cannot be negative.' }));
      } else {
        setFormErrors((prev) => ({ ...prev, cycle_used_hours: null }));
      }
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const applySample = (sample, idx) => {
    setActivePreset(idx);
    setFormErrors({});
    setForm((prev) => ({
      ...prev,
      current_location: sample.current,
      pickup_location:  sample.pickup,
      dropoff_location: sample.dropoff,
      cycle_used_hours: sample.cycle,
    }));
  };

  const reset = () => {
    setForm(DEFAULTS);
    setActivePreset(0);
    setFormErrors({});
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const errors = {};
    const locFields = ['current_location', 'pickup_location', 'dropoff_location'];
    locFields.forEach((f) => {
      const v = form[f];
      if (!v) {
        errors[f] = 'Please select a location from the suggestions.';
      }
    });

    const cycle = form.cycle_used_hours;
    if (isNaN(cycle) || cycle < 0) errors.cycle_used_hours = 'Cannot be negative.';
    if (cycle > 70) errors.cycle_used_hours = 'Cannot exceed 70 hours (70-hr cycle limit).';

    // Identical pickup/dropoff
    const pickupKey = _locKey(form.pickup_location);
    const dropoffKey = _locKey(form.dropoff_location);
    if (pickupKey && dropoffKey && pickupKey === dropoffKey) {
      errors.dropoff_location = 'Pickup and dropoff cannot be the same location.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({ ...form, trip_start: new Date().toISOString() });
  };

  const cycleRatio = Math.min(1, form.cycle_used_hours / 70);
  const cycleWarning = form.cycle_used_hours >= 60;
  const cycleDanger  = form.cycle_used_hours >= 70;

  return (
    <div
      className="rounded-2xl overflow-visible"
      style={{
        background: 'rgba(22,27,39,0.9)',
        border: '1px solid rgba(45,58,82,0.8)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* ── Card header ────────────────────────────────────────────────── */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(45,58,82,0.5)' }}
      >
        <div>
          <h2 className="font-display text-sm font-semibold text-white">Plan Your Trip</h2>
          <p className="text-xs" style={{ color: '#4a5a78' }}>FMCSA-compliant log generation</p>
        </div>
        <button
          type="button"
          onClick={reset}
          title="Reset to defaults"
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: '#4a5a78' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#4a5a78')}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* ── Preset chips ─────────────────────────────────────────────── */}
        <div>
          <p className="section-label mb-2">Quick Presets</p>
          <div className="grid grid-cols-1 gap-2">
            {SAMPLE_TRIPS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={() => applySample(s, i)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all text-left"
                style={{
                  background: activePreset === i
                    ? 'rgba(251,191,36,0.12)'
                    : 'rgba(13,17,23,0.5)',
                  border: activePreset === i
                    ? '1px solid rgba(251,191,36,0.35)'
                    : '1px solid rgba(45,58,82,0.6)',
                  color: activePreset === i ? '#fcd34d' : '#94a3b8',
                }}
              >
                <span className="flex items-center gap-2">
                  <span>{s.emoji}</span>
                  <span className="font-medium">{s.label}</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-50" />
              </button>
            ))}
          </div>
        </div>

        <div className="divider" />

        {/* ── Form ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Route section */}
          <div className="space-y-3">
            <p className="section-label">Route</p>

            <LocationAutocomplete
              label="Current Location"
              name="current_location"
              iconColor="#6b7fa3"
              value={form.current_location}
              onChange={handleLocationChange}
              placeholder="City, State"
              disabled={loading}
            />
            {formErrors.current_location && (
              <FieldError msg={formErrors.current_location} />
            )}

            <FlowArrow />

            <LocationAutocomplete
              label="Pickup Location"
              name="pickup_location"
              iconColor="#34d399"
              value={form.pickup_location}
              onChange={handleLocationChange}
              placeholder="City, State"
              disabled={loading}
            />
            {formErrors.pickup_location && (
              <FieldError msg={formErrors.pickup_location} />
            )}

            <FlowArrow />

            <LocationAutocomplete
              label="Dropoff Location"
              name="dropoff_location"
              iconColor="#fbbf24"
              value={form.dropoff_location}
              onChange={handleLocationChange}
              placeholder="City, State"
              disabled={loading}
            />
            {formErrors.dropoff_location && (
              <FieldError msg={formErrors.dropoff_location} />
            )}
          </div>

          <div className="divider" />

          {/* Driver & carrier */}
          <div className="space-y-3">
            <p className="section-label">Driver Info</p>
            <div className="grid grid-cols-2 gap-3">
              <SimpleField
                label="Driver Name"
                name="driver_name"
                icon={User}
                iconColor="#818cf8"
                value={form.driver_name}
                onChange={handleChange}
                disabled={loading}
              />
              <SimpleField
                label="Carrier Name"
                name="carrier_name"
                icon={Building2}
                iconColor="#38bdf8"
                value={form.carrier_name}
                onChange={handleChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="divider" />

          {/* HOS Cycle hours */}
          <div className="space-y-3">
            <p className="section-label">HOS Status</p>
            <SimpleField
              label="Cycle Used (hrs)"
              name="cycle_used_hours"
              icon={Clock}
              iconColor={cycleWarning ? '#fbbf24' : '#4a5a78'}
              type="number"
              min={0}
              max={70}
              step={0.5}
              value={form.cycle_used_hours}
              onChange={handleChange}
              disabled={loading}
            />
            {formErrors.cycle_used_hours && (
              <FieldError msg={formErrors.cycle_used_hours} />
            )}

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs mb-1" style={{ color: '#4a5a78' }}>
                <span>70-hr/8-Day Cycle</span>
                <span style={{ color: cycleDanger ? '#fb7185' : cycleWarning ? '#fbbf24' : '#34d399' }}>
                  {(70 - form.cycle_used_hours).toFixed(1)} hrs remaining
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: 'rgba(45,58,82,0.6)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, cycleRatio * 100)}%`,
                    background: cycleDanger
                      ? '#fb7185'
                      : cycleWarning
                      ? 'linear-gradient(90deg,#fbbf24,#fb7185)'
                      : 'linear-gradient(90deg,#34d399,#38bdf8)',
                  }}
                />
              </div>
              {cycleDanger && (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: '#fb7185' }}>
                  <AlertTriangle className="w-3 h-3" />
                  At 70 hrs, the driver needs a 34-hr restart before driving.
                </p>
              )}
            </div>
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading} className="btn-primary mt-2">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Calculating Route & Logs…
              </>
            ) : (
              <>
                <Gauge className="w-4 h-4" />
                Generate ELD Logbook
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FlowArrow() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-px" style={{ background: 'rgba(45,58,82,0.5)' }} />
      <span className="text-xs" style={{ color: '#3d4f6e' }}>↓</span>
      <div className="flex-1 h-px" style={{ background: 'rgba(45,58,82,0.5)' }} />
    </div>
  );
}

function FieldError({ msg }) {
  return (
    <p style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', fontSize: '11px', color: '#fb7185' }}>
      <AlertTriangle style={{ width: '11px', height: '11px', flexShrink: 0 }} />
      {msg}
    </p>
  );
}

function SimpleField({ label, name, icon: Icon, iconColor = '#4a5a78', value, onChange, type = 'text', disabled, ...rest }) {
  return (
    <div>
      <label htmlFor={name} className="section-label block mb-1.5">{label}</label>
      <div style={{ position: 'relative' }}>
        <Icon
          style={{
            position: 'absolute', left: '10px', top: '50%',
            transform: 'translateY(-50%)',
            width: '14px', height: '14px',
            color: iconColor, pointerEvents: 'none',
          }}
        />
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="input-field"
          style={{ paddingLeft: '2.2rem' }}
          {...rest}
        />
      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function _locKey(loc) {
  if (!loc) return '';
  if (typeof loc === 'object' && loc.lat != null) {
    return `${Math.round(loc.lat * 1000)},${Math.round(loc.lng * 1000)}`;
  }
  return String(loc).trim().toLowerCase();
}
