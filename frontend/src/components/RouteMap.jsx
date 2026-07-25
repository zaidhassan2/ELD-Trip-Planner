import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation2, AlertTriangle } from 'lucide-react';

/* ── Stop type configuration ────────────────────────────────────────────────
   Every stop type gets a distinct color AND a distinct SVG icon shape so
   fuel and rest stops can NEVER look identical.
*/
const STOP_CONFIG = {
  'Pre-Trip Inspection': {
    color: '#818cf8', // violet
    svg: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="8" fill="{COLOR}" opacity="0.9"/>
      <text x="10" y="14.5" text-anchor="middle" font-size="10" font-family="sans-serif" fill="white">🔧</text>
    </svg>`,
    shape: 'circle',
  },
  'Driving': {
    color: '#34d399', // emerald
    svg: null, // handled by polyline — no marker needed
    shape: 'none',
  },
  'Pickup': {
    color: '#34d399', // emerald
    svg: `<svg viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 18 12 18s12-9 12-18c0-6.63-5.37-12-12-12z" fill="{COLOR}"/>
      <text x="12" y="17" text-anchor="middle" font-size="12" font-family="sans-serif" fill="white">📦</text>
    </svg>`,
    shape: 'pin',
  },
  'Dropoff': {
    color: '#fbbf24', // amber
    svg: `<svg viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 18 12 18s12-9 12-18c0-6.63-5.37-12-12-12z" fill="{COLOR}"/>
      <text x="12" y="17" text-anchor="middle" font-size="12" font-family="sans-serif" fill="white">📍</text>
    </svg>`,
    shape: 'pin',
  },
  'Fuel Stop': {
    color: '#38bdf8', // sky blue — clearly different from rest stops
    svg: `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="24" height="24" rx="5" fill="{COLOR}" opacity="0.9"/>
      <text x="14" y="20" text-anchor="middle" font-size="14" font-family="sans-serif" fill="white">⛽</text>
    </svg>`,
    shape: 'square',
  },
  '30-Minute Break': {
    color: '#f97316', // orange — distinct from fuel (blue) and rest (pink)
    svg: `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <polygon points="14,2 26,26 2,26" fill="{COLOR}" opacity="0.9"/>
      <text x="14" y="22" text-anchor="middle" font-size="11" font-family="sans-serif" fill="white">☕</text>
    </svg>`,
    shape: 'triangle',
  },
  '10-Hour Rest Period': {
    color: '#f472b6', // pink — distinct from all others
    svg: `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="14" cy="14" rx="12" ry="10" fill="{COLOR}" opacity="0.9"/>
      <text x="14" y="19" text-anchor="middle" font-size="13" font-family="sans-serif" fill="white">🛏</text>
    </svg>`,
    shape: 'oval',
  },
  '34-Hour Restart (Cycle Reset)': {
    color: '#dc2626', // red
    svg: `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="24" height="24" rx="3" fill="{COLOR}" opacity="0.95"/>
      <text x="14" y="20" text-anchor="middle" font-size="11" font-family="sans-serif" fill="white">🔄</text>
    </svg>`,
    shape: 'square',
  },
  'Post-Trip Inspection': {
    color: '#a78bfa', // light violet
    svg: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="8" fill="{COLOR}" opacity="0.9"/>
      <text x="10" y="14.5" text-anchor="middle" font-size="10" font-family="sans-serif" fill="white">✅</text>
    </svg>`,
    shape: 'circle',
  },
};

const WAYPOINT_COLORS = ['#38bdf8', '#34d399', '#fbbf24'];
const WAYPOINT_LABELS = ['Current Location', 'Pickup', 'Dropoff'];

function makeDivIcon(svgStr, color, size = [28, 28], anchor = [14, 14]) {
  const html = svgStr.replace(/\{COLOR\}/g, color);
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size[0]}px;height:${size[1]}px;
      filter:drop-shadow(0 2px 6px ${color}88);
    ">${html}</div>`,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, -size[1] / 2 - 4],
  });
}

function makeWaypointIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:${color};
      border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 2px 10px ${color}88;
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -14],
  });
}

function FitBounds({ coordinates, waypoints }) {
  const map = useMap();
  const prevRef = useRef(null);
  useEffect(() => {
    const key = JSON.stringify(coordinates?.slice(0, 3));
    if (key === prevRef.current) return;
    prevRef.current = key;
    if (coordinates?.length) {
      try {
        map.fitBounds(L.latLngBounds(coordinates), { padding: [52, 52] });
      } catch {}
    } else if (waypoints?.length) {
      try {
        map.fitBounds(
          L.latLngBounds(waypoints.map((w) => [w.lat, w.lng])),
          { padding: [52, 52] }
        );
      } catch {}
    }
  }, [coordinates, waypoints, map]);
  return null;
}

export default function RouteMap({ route, schedule }) {
  const hasRoute = route?.coordinates?.length;

  if (!hasRoute) {
    return (
      <div
        className="rounded-2xl flex flex-col items-center justify-center gap-3 map-container"
        style={{
          background: 'rgba(22,27,39,0.7)',
          border: '1px solid rgba(45,58,82,0.6)',
          color: '#3d4f6e',
        }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(45,58,82,0.4)', border: '1px solid rgba(45,58,82,0.6)' }}
        >
          <Navigation2 className="w-6 h-6" style={{ color: '#4a5a78' }} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: '#4a5a78' }}>Route map will appear here</p>
          <p className="text-xs" style={{ color: '#2d3a52' }}>Generate a trip to see the route</p>
        </div>
      </div>
    );
  }

  const center = route.coordinates[Math.floor(route.coordinates.length / 2)];

  // All blocks that have a stop marker (exclude plain Driving segments)
  const allBlocks = schedule?.blocks || [];
  const totalDuration = allBlocks.reduce((s, b) => s + (b.duration_hours || 0), 0);

  // Resolve lat/lng for each stop block from route polyline
  const resolveLatLng = (blk) => {
    const coords = route?.coordinates;
    if (!coords?.length) return { lat: null, lng: null };

    const wp = route.waypoints || [];

    // Pickup / dropoff → use exact waypoint coordinates
    if (blk.activity === 'Pickup' && wp[1]) return { lat: wp[1].lat, lng: wp[1].lng };
    if (blk.activity === 'Dropoff' && wp[2]) return { lat: wp[2].lat, lng: wp[2].lng };
    if (blk.activity === 'Pre-Trip Inspection' && wp[0]) return { lat: wp[0].lat, lng: wp[0].lng };
    if (blk.activity === 'Post-Trip Inspection' && wp[2]) return { lat: wp[2].lat, lng: wp[2].lng };

    // Other stops: estimate position from cumulative time fraction along route
    const allDriving = allBlocks.filter((b) => b.status === 'driving');
    const totalDriveMiles = allDriving.reduce((s, b) => s + (b.miles || 0), 0);
    let cumMiles = 0;
    for (const b of allBlocks) {
      if (b === blk) break;
      cumMiles += b.miles || 0;
    }
    const frac = totalDriveMiles > 0 ? Math.min(1, cumMiles / totalDriveMiles) : 0.5;
    const idx = Math.min(Math.floor(frac * (coords.length - 1)), coords.length - 1);
    return { lat: coords[idx][0], lng: coords[idx][1] };
  };

  const stopBlocks = allBlocks
    .filter((b) => b.activity !== 'Driving' && STOP_CONFIG[b.activity]?.shape !== 'none')
    .map((b) => ({ ...b, ...resolveLatLng(b) }))
    .filter((b) => b.lat != null);

  // Deduplicate: skip if same activity AND very close coordinates
  const deduped = [];
  stopBlocks.forEach((blk) => {
    const isDup = deduped.some(
      (d) =>
        d.activity === blk.activity &&
        Math.abs((d.lat || 0) - (blk.lat || 0)) < 0.015 &&
        Math.abs((d.lng || 0) - (blk.lng || 0)) < 0.015
    );
    if (!isDup) deduped.push(blk);
  });

  return (
    <div
      className="rounded-2xl overflow-hidden animate-fade-up"
      style={{ border: '1px solid rgba(45,58,82,0.7)', background: 'rgba(22,27,39,0.8)' }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 flex flex-wrap items-center justify-between gap-3"
        style={{ borderBottom: '1px solid rgba(45,58,82,0.5)' }}
      >
        <div className="flex items-center gap-3">
          <Navigation2 className="w-4 h-4" style={{ color: '#fbbf24' }} />
          <h3 className="font-display text-sm font-semibold text-white">Route Overview</h3>
        </div>
        <div className="flex gap-5 text-sm">
          <span style={{ color: '#4a5a78' }}>
            Distance&nbsp;
            <strong style={{ color: '#fbbf24' }}>{route.total_distance_miles} mi</strong>
          </span>
          <span style={{ color: '#4a5a78' }}>
            Drive Time&nbsp;
            <strong style={{ color: '#38bdf8' }}>{route.total_duration_hours.toFixed(1)} hrs</strong>
          </span>
        </div>
      </div>

      {/* Waypoint legend */}
      <div
        className="px-5 py-2 flex flex-wrap gap-4"
        style={{ borderBottom: '1px solid rgba(45,58,82,0.4)', background: 'rgba(13,17,23,0.3)' }}
      >
        {route.waypoints?.map((wp, i) => (
          <div key={wp.label} className="flex items-center gap-2 text-xs" style={{ color: '#94a3b8' }}>
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ background: WAYPOINT_COLORS[i], boxShadow: `0 0 6px ${WAYPOINT_COLORS[i]}55` }}
            />
            <span className="font-medium" style={{ color: WAYPOINT_COLORS[i] }}>
              {WAYPOINT_LABELS[i]}
            </span>
            <span className="opacity-60 truncate max-w-[140px]">{wp.city_state || wp.address}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <MapContainer center={center} zoom={5} className="map-container w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        {/* Route polyline */}
        <Polyline
          positions={route.coordinates}
          color="#fbbf24"
          weight={4}
          opacity={0.9}
        />

        {/* Waypoint markers (current/pickup/dropoff) */}
        {route.waypoints?.map((wp, i) => (
          <Marker
            key={`wp-${wp.label}`}
            position={[wp.lat, wp.lng]}
            icon={makeWaypointIcon(WAYPOINT_COLORS[i] || '#94a3b8')}
          >
            <Popup>
              <div style={{ minWidth: '160px' }}>
                <strong style={{ color: WAYPOINT_COLORS[i], fontSize: '13px' }}>{wp.label}</strong>
                <br />
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {wp.city_state || wp.address}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Stop markers — every distinct stop type with a unique icon */}
        <LayerGroup>
          {deduped.map((blk, i) => {
            const cfg = STOP_CONFIG[blk.activity];
            if (!cfg || !cfg.svg || !blk.lat) return null;

            const isPin = cfg.shape === 'pin';
            const size  = isPin ? [24, 30] : [28, 28];
            const anchor = isPin ? [12, 30] : [14, 14];
            const icon   = makeDivIcon(cfg.svg, cfg.color, size, anchor);

            return (
              <Marker key={`stop-${i}-${blk.activity}`} position={[blk.lat, blk.lng]} icon={icon}>
                <Popup>
                  <div style={{ minWidth: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span
                        style={{
                          display: 'inline-block', width: '10px', height: '10px',
                          borderRadius: '50%', background: cfg.color, flexShrink: 0,
                        }}
                      />
                      <strong style={{ color: cfg.color, fontSize: '13px' }}>{blk.activity}</strong>
                    </div>
                    <p style={{ margin: '2px 0', fontSize: '11px', color: '#94a3b8' }}>
                      {blk.location}
                    </p>
                    <p style={{ margin: '2px 0', fontSize: '11px', color: '#e2e8f0' }}>
                      ⏰ Arrival: {blk.start_time}
                    </p>
                    <p style={{ margin: '2px 0', fontSize: '11px', color: '#e2e8f0' }}>
                      ⏱ Duration: {(blk.duration_hours * 60).toFixed(0)} min
                    </p>
                    {blk.miles > 0 && (
                      <p style={{ margin: '2px 0', fontSize: '11px', color: '#e2e8f0' }}>
                        🛣 Miles: {blk.miles.toFixed(1)} mi
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </LayerGroup>

        <FitBounds coordinates={route.coordinates} waypoints={route.waypoints} />
      </MapContainer>

      {/* Stop legend + chips */}
      {stopBlocks.length > 0 && (
        <div
          className="px-5 py-3"
          style={{ borderTop: '1px solid rgba(45,58,82,0.4)', background: 'rgba(13,17,23,0.3)' }}
        >
          <p className="section-label mb-2">Scheduled Stops</p>
          <div className="flex flex-wrap gap-2">
            {stopBlocks.slice(0, 12).map((s, i) => {
              const cfg = STOP_CONFIG[s.activity] || { color: '#94a3b8' };
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                  style={{
                    background: `${cfg.color}18`,
                    border: `1px solid ${cfg.color}40`,
                    color: cfg.color,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: cfg.color }}
                  />
                  {s.start_time} — {s.activity}
                </span>
              );
            })}
            {stopBlocks.length > 12 && (
              <span className="text-xs" style={{ color: '#4a5a78', padding: '4px 0' }}>
                +{stopBlocks.length - 12} more stops
              </span>
            )}
          </div>

          {/* Stop type legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(STOP_CONFIG)
              .filter(([, cfg]) => cfg.shape !== 'none')
              .map(([activity, cfg]) => (
                <span
                  key={activity}
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{ color: '#6b7280' }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px', height: '8px',
                      borderRadius: cfg.shape === 'circle' || cfg.shape === 'oval' ? '50%' : '2px',
                      background: cfg.color,
                    }}
                  />
                  {activity}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
