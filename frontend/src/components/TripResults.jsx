import LogbookGrid from './LogbookGrid';
import { FileText, AlertTriangle, TrendingUp, Clock, Truck, Activity, Fuel, Coffee, Moon } from 'lucide-react';

const STAT_CONFIG = [
  {
    key: 'total_miles',
    label: 'Total Miles',
    unit: 'mi',
    icon: TrendingUp,
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.2)',
  },
  {
    key: 'total_drive_hours',
    label: 'Drive Time',
    unit: 'hrs',
    format: (v) => Number(v).toFixed(1),
    icon: Clock,
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.08)',
    border: 'rgba(56,189,248,0.2)',
  },
  {
    key: 'total_days',
    label: 'Log Days',
    unit: '',
    icon: FileText,
    color: '#34d399',
    bg: 'rgba(52,211,153,0.08)',
    border: 'rgba(52,211,153,0.2)',
  },
  {
    key: 'cycle_remaining_hours',
    label: 'Cycle Left',
    unit: 'hrs',
    format: (v) => Math.max(0, Number(v)).toFixed(1),
    icon: Activity,
    color: null, // dynamic
    bg: null,
    border: null,
  },
];

const STOP_STATS = [
  { key: 'num_fuel_stops',    icon: Fuel,   label: 'Fuel Stops',  color: '#38bdf8' },
  { key: 'num_rest_periods',  icon: Moon,   label: 'Rest Periods', color: '#f472b6' },
  { key: 'num_breaks',        icon: Coffee, label: '30-min Breaks', color: '#f97316' },
];

export default function TripResults({ data }) {
  if (!data) return null;

  const { schedule } = data;
  if (!schedule) return null;

  const { summary, daily_logs } = schedule;
  if (!summary || !daily_logs) return null;

  const cycleRemaining = Number(summary.cycle_remaining_hours ?? 0);
  const cycleOver = cycleRemaining < 0;
  const hasLogs = daily_logs.length > 0;

  return (
    <div className="space-y-8 animate-fade-up">

      {/* ── Summary stat cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
        {STAT_CONFIG.map(({ key, label, unit, icon: Icon, color, bg, border, format }) => {
          const isCycle = key === 'cycle_remaining_hours';
          const c     = isCycle ? (cycleOver ? '#fb7185' : '#34d399') : color;
          const bgCol = isCycle ? (cycleOver ? 'rgba(251,113,133,0.08)' : 'rgba(52,211,153,0.08)') : bg;
          const bdCol = isCycle ? (cycleOver ? 'rgba(251,113,133,0.25)' : 'rgba(52,211,153,0.2)') : border;
          const rawVal = summary[key] ?? 0;
          const display = format ? `${format(rawVal)} ${unit}`.trim() : `${rawVal} ${unit}`.trim();

          return (
            <div
              key={key}
              className="stat-card"
              style={{ background: bgCol, borderColor: bdCol }}
            >
              <div className="flex items-start justify-between mb-2">
                <p className="section-label">{label}</p>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: `${c}20` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: c }} />
                </div>
              </div>
              <p className="font-display text-2xl font-bold" style={{ color: c }}>{display}</p>
              {isCycle && (
                <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(45,58,82,0.5)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, ((70 - Math.max(0, cycleRemaining)) / 70) * 100))}%`,
                      background: cycleOver
                        ? 'linear-gradient(90deg,#f59e0b,#fb7185)'
                        : 'linear-gradient(90deg,#34d399,#38bdf8)',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Stop count mini-cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {STOP_STATS.map(({ key, icon: Icon, label, color }) => (
          <div
            key={key}
            className="px-4 py-3 rounded-xl flex items-center gap-3"
            style={{
              background: `${color}0a`,
              border: `1px solid ${color}25`,
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}18` }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <p className="font-bold text-lg leading-tight" style={{ color }}>
                {summary[key] ?? 0}
              </p>
              <p className="text-xs" style={{ color: '#4a5a78' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Cycle-over warning ────────────────────────────────────────── */}
      {cycleOver && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm animate-fade-in"
          style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.25)', color: '#fda4af' }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            This trip required a 34-hr cycle restart — the driver had insufficient hours remaining.
            The schedule is legally compliant with the restart included.
          </span>
        </div>
      )}

      {/* ── Daily log sheets ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            <FileText className="w-4 h-4" style={{ color: '#fbbf24' }} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">Daily Log Sheets</h2>
            <p className="text-xs" style={{ color: '#4a5a78' }}>
              {daily_logs.length} day{daily_logs.length !== 1 ? 's' : ''} · FMCSA 49 CFR Part 395
            </p>
          </div>
        </div>

        {!hasLogs && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#fcd34d' }}
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>No log sheets generated. The trip may be too short or the route was not found.</span>
          </div>
        )}

        <div className="space-y-6">
          {daily_logs.map((day, i) => (
            <div key={day.date || i} className="animate-fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
              <LogbookGrid dayLog={day} dayIndex={i + 1} totalDays={daily_logs.length} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
