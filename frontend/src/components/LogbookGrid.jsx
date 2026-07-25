/**
 * LogbookGrid — 24-hour ELD logbook grid component.
 *
 * PRD Requirements covered:
 *  ✅ X-axis: 24-hour timeline, Midnight→Midnight, 15-min tick marks
 *  ✅ Y-axis: Off Duty | Sleeper Berth | Driving | On Duty (Not Driving)
 *  ✅ Continuous horizontal status line; vertical line on status change
 *  ✅ Grid line returns to Off Duty after last block (to midnight)
 *  ✅ Remarks section: Time | Location | Activity for every change
 *  ✅ Header: Date, Miles, Carrier Name, Driver Name
 *  ✅ Totals column: hours per row; sum == 24.0 hrs
 *  ✅ No horizontal scrollbar (SVG uses viewBox + width 100%)
 */

const STATUS_ROWS = [
  {
    key: 'off_duty',
    label: 'Off Duty',
    abbr: 'OFF',
    color: '#6b7fa3',
    bg: 'rgba(107,127,163,0.06)',
  },
  {
    key: 'sleeper_berth',
    label: 'Sleeper Berth',
    abbr: 'SB',
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.06)',
  },
  {
    key: 'driving',
    label: 'Driving',
    abbr: 'D',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.06)',
  },
  {
    key: 'on_duty_not_driving',
    label: 'On Duty (Not Driving)',
    abbr: 'ON',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.06)',
  },
];

const MINUTES_IN_DAY = 24 * 60;
const OFF_DUTY_KEY   = 'off_duty';

function rowIndex(status) {
  return STATUS_ROWS.findIndex((r) => r.key === status);
}

function formatHourLabel(hour) {
  if (hour === 0 || hour === 24) return 'M';
  if (hour === 12) return 'N';
  if (hour < 12) return String(hour);
  return String(hour - 12);
}

function formatHoursMinutes(decimalHours) {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const ACTIVITY_ICON = {
  'Pre-Trip Inspection': '🔧',
  'Driving': '🚛',
  'Pickup': '📦',
  'Dropoff': '📍',
  'Fueling Stop': '⛽',
  '30-Minute Break': '☕',
  '10-Hour Rest Period': '🛏️',
  'Post-Trip Inspection': '✅',
};

/* ─── Main component ──────────────────────────────────────────────── */
export default function LogbookGrid({ dayLog, dayIndex = 1, totalDays = 1 }) {
  if (!dayLog) return null;

  const { blocks, totals, remarks, date_display, miles, carrier_name, driver_name } = dayLog;

  /* SVG geometry */
  const gridWidth   = 960;
  const rowHeight   = 40;
  const labelWidth  = 148;
  const totalsWidth = 68;
  const headerH     = 30;
  const chartH      = STATUS_ROWS.length * rowHeight;
  const totalSvgH   = headerH + chartH;

  const toX = (minutes) => (minutes / MINUTES_IN_DAY) * gridWidth;

  /* Build SVG line elements */
  const elements = [];
  const sorted   = [...blocks].sort((a, b) => a.start_minutes - b.start_minutes);

  sorted.forEach((block, idx) => {
    const row = rowIndex(block.status);
    if (row < 0) return;
    const y  = headerH + row * rowHeight + rowHeight / 2;
    const x1 = toX(block.start_minutes);
    const x2 = toX(block.end_minutes);
    const color = STATUS_ROWS[row].color;

    /* Horizontal status line */
    elements.push(
      <line
        key={`h-${idx}`}
        x1={x1} y1={y} x2={x2} y2={y}
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
    );

    /* Vertical connector to next block */
    if (idx < sorted.length - 1) {
      const next    = sorted[idx + 1];
      const nextRow = rowIndex(next.status);
      if (nextRow >= 0 && nextRow !== row) {
        const nx = toX(next.start_minutes);
        const ny = headerH + nextRow * rowHeight + rowHeight / 2;
        elements.push(
          <line
            key={`v-${idx}`}
            x1={nx} y1={y} x2={nx} y2={ny}
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="0"
          />
        );
      }
    }
  });

  /* Trailing Off-Duty line after last block → midnight */
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    if (last.end_minutes < MINUTES_IN_DAY - 0.5) {
      const offRow = rowIndex(OFF_DUTY_KEY);
      if (offRow >= 0) {
        const tailX1 = toX(last.end_minutes);
        const tailX2 = toX(MINUTES_IN_DAY);
        const tailY  = headerH + offRow * rowHeight + rowHeight / 2;
        const prevY  = headerH + rowIndex(last.status) * rowHeight + rowHeight / 2;
        if (rowIndex(last.status) !== offRow) {
          elements.push(
            <line
              key="v-tail"
              x1={tailX1} y1={prevY} x2={tailX1} y2={tailY}
              stroke="#94a3b8"
              strokeWidth={2}
            />
          );
        }
        elements.push(
          <line
            key="h-tail"
            x1={tailX1} y1={tailY} x2={tailX2} y2={tailY}
            stroke={STATUS_ROWS[offRow].color}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        );
      }
    }
  }

  const hourTicks = Array.from({ length: 25 }, (_, i) => i);
  const totalHrs  = Object.values(totals).reduce((a, b) => a + b, 0);

  return (
    <div className="log-sheet">

      {/* ── Log sheet header ─────────────────────────────────────── */}
      <div style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
        {/* Day badge + title */}
        <div
          className="px-5 py-2 flex items-center justify-between"
          style={{ borderBottom: '1px solid #e2e8f0' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: '#1e293b', color: '#fbbf24', letterSpacing: '0.04em' }}
            >
              Day {dayIndex} / {totalDays}
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Driver's Daily Log — ELD Record
            </span>
          </div>
          <span className="text-xs text-slate-400">FMCSA 49 CFR §395.8</span>
        </div>

        {/* Meta row */}
        <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
          {[
            { label: 'Date',         value: date_display },
            { label: 'Miles Driven', value: `${miles} mi` },
            { label: 'Carrier',      value: carrier_name },
            { label: 'Driver',       value: driver_name },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">{label}</p>
              <p className="text-sm font-bold text-slate-800 leading-tight">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Status legend (colored pills) ────────────────────────── */}
      <div
        className="px-5 py-2 flex flex-wrap gap-3"
        style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}
      >
        {STATUS_ROWS.map((row) => (
          <span
            key={row.key}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{
              background: `${row.color}18`,
              color: row.color,
              border: `1px solid ${row.color}40`,
            }}
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: row.color }}
            />
            {row.abbr} — {row.label}
          </span>
        ))}
      </div>

      {/* ── 24-hour SVG grid ─────────────────────────────────────── */}
      <div style={{ padding: '12px 16px 8px' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${labelWidth + gridWidth + totalsWidth} ${totalSvgH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          {/* Row backgrounds */}
          {STATUS_ROWS.map((row, i) => {
            const y = headerH + i * rowHeight;
            return (
              <rect
                key={`bg-${row.key}`}
                x={0} y={y}
                width={labelWidth + gridWidth + totalsWidth}
                height={rowHeight}
                fill={i % 2 === 0 ? '#f8fafc' : '#ffffff'}
              />
            );
          })}

          {/* Hour vertical grid lines + labels */}
          {hourTicks.map((h) => {
            const x = labelWidth + toX(h * 60);
            const isMajor = h % 6 === 0;
            return (
              <g key={`hour-${h}`}>
                <line
                  x1={x} y1={0} x2={x} y2={totalSvgH}
                  stroke={isMajor ? '#cbd5e1' : '#e2e8f0'}
                  strokeWidth={isMajor ? 1.5 : 0.5}
                />
                {h < 24 && (
                  <text
                    x={x + 2} y={18}
                    fontSize={8}
                    fill={isMajor ? '#475569' : '#94a3b8'}
                    fontWeight={isMajor ? 700 : 400}
                    fontFamily="'Inter', system-ui, sans-serif"
                  >
                    {formatHourLabel(h)}
                  </text>
                )}
              </g>
            );
          })}

          {/* 15-min tick lines */}
          {Array.from({ length: 96 }, (_, i) => {
            const m = i * 15;
            if (m % 60 === 0) return null;
            const x = labelWidth + toX(m);
            return (
              <line
                key={`tick-${i}`}
                x1={x} y1={headerH}
                x2={x} y2={totalSvgH}
                stroke="#f1f5f9"
                strokeWidth={0.5}
              />
            );
          })}

          {/* Row labels, bottom-borders, totals */}
          {STATUS_ROWS.map((row, i) => {
            const y = headerH + i * rowHeight;
            const hrs = totals[row.key] ?? 0;
            return (
              <g key={row.key}>
                {/* Row label */}
                <text
                  x={8} y={y + rowHeight / 2 + 4}
                  fontSize={10}
                  fill="#334155"
                  fontWeight={600}
                  fontFamily="'Inter', system-ui, sans-serif"
                >
                  {row.label}
                </text>

                {/* Row bottom border */}
                <line
                  x1={labelWidth} y1={y + rowHeight}
                  x2={labelWidth + gridWidth + totalsWidth} y2={y + rowHeight}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />

                {/* Left label divider */}
                <line
                  x1={labelWidth} y1={y}
                  x2={labelWidth} y2={y + rowHeight}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />

                {/* Right totals divider */}
                <line
                  x1={labelWidth + gridWidth} y1={y}
                  x2={labelWidth + gridWidth} y2={y + rowHeight}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />

                {/* Total hours */}
                <text
                  x={labelWidth + gridWidth + totalsWidth / 2}
                  y={y + rowHeight / 2 + 4}
                  fontSize={11}
                  fill={row.color}
                  fontWeight={700}
                  fontFamily="'Space Grotesk', 'Inter', system-ui, sans-serif"
                  textAnchor="middle"
                >
                  {hrs.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* "Total" column header */}
          <text
            x={labelWidth + gridWidth + totalsWidth / 2}
            y={16}
            fontSize={8}
            fill="#64748b"
            fontWeight={600}
            fontFamily="'Inter', system-ui, sans-serif"
            textAnchor="middle"
          >
            Hrs
          </text>

          {/* Status lines (translated into chart area) */}
          <g transform={`translate(${labelWidth}, 0)`}>{elements}</g>
        </svg>
      </div>

      {/* ── 24-hr validation bar ─────────────────────────────────── */}
      <div
        className="px-5 py-2 flex items-center justify-between text-xs"
        style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}
      >
        <div className="flex gap-4">
          {STATUS_ROWS.map((row) => (
            <span key={row.key} className="flex items-center gap-1" style={{ color: row.color }}>
              <span className="font-bold">{(totals[row.key] ?? 0).toFixed(1)}</span>h
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: '#64748b' }}>Daily total:</span>
          <span
            className="font-bold"
            style={{ color: Math.abs(totalHrs - 24) < 0.05 ? '#16a34a' : '#dc2626' }}
          >
            {totalHrs.toFixed(1)} / 24.0 hrs
          </span>
          {Math.abs(totalHrs - 24) < 0.05 && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#dcfce7', color: '#15803d' }}>
              ✓ Valid
            </span>
          )}
        </div>
      </div>

      {/* ── Remarks table ────────────────────────────────────────── */}
      <div style={{ borderTop: '2px solid #e2e8f0' }}>
        <div
          className="px-5 py-2 flex items-center gap-2"
          style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}
        >
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Remarks</span>
          <span className="text-xs text-slate-400">— Status Changes &amp; Duty Events</span>
        </div>

        {remarks.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400 italic">No status changes recorded.</p>
        ) : (
          <div>
            {/* Table header */}
            <div
              className="grid text-xs font-semibold uppercase tracking-wide px-5 py-2"
              style={{
                gridTemplateColumns: '100px 1fr 1fr',
                color: '#94a3b8',
                borderBottom: '1px solid #f1f5f9',
                background: '#fafafa',
              }}
            >
              <span>Time</span>
              <span>Location</span>
              <span>Activity</span>
            </div>

            {/* Rows */}
            {remarks.map((r, i) => {
              const statusBlock = sorted.find(
                (b) => b.activity === r.activity && b.start_minutes !== undefined
              );
              const rowConfig = statusBlock
                ? STATUS_ROWS.find((s) => s.key === statusBlock.status)
                : null;
              const accent = rowConfig?.color ?? '#94a3b8';

              return (
                <div
                  key={i}
                  className="grid px-5 py-2.5 text-sm items-center transition-colors"
                  style={{
                    gridTemplateColumns: '100px 1fr 1fr',
                    borderBottom: i < remarks.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span className="font-mono font-bold text-slate-800 text-xs">{r.time}</span>
                  <span className="text-slate-600 text-xs">{r.location}</span>
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: accent }}
                  >
                    <span>{ACTIVITY_ICON[r.activity] ?? '•'}</span>
                    {r.activity}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
