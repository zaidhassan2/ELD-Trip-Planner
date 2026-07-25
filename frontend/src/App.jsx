import { useState } from 'react';
import { Truck, Zap, Shield, Clock, AlertTriangle, X } from 'lucide-react';
import TripForm from './components/TripForm';
import RouteMap from './components/RouteMap';
import TripResults from './components/TripResults';
import { planTrip } from './api/client';

const FEATURE_PILLS = [
  { icon: Shield, label: 'FMCSA Compliant' },
  { icon: Clock,  label: '11-hr / 14-hr Rules' },
  { icon: Zap,    label: 'Instant Generation' },
];

export default function App() {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tripData, setTripData] = useState(null);

  const handleSubmit = async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const data = await planTrip(payload);
      setTripData(data);
      // Scroll to results
      setTimeout(() => {
        document.getElementById('trip-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setError(err.message);
      setTripData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-base)' }}>

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header
        style={{
          background: 'rgba(13,17,23,0.88)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(45,58,82,0.6)',
        }}
        className="sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center animate-pulse-ring"
              style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', boxShadow: '0 4px 14px rgba(251,191,36,0.35)' }}
            >
              <Truck className="w-4 h-4" style={{ color: '#0d1117' }} />
            </div>
            <div>
              <h1 className="font-display text-base font-bold text-white leading-none">
                Spooter <span style={{ color: '#fbbf24' }}>ELD</span>
              </h1>
              <p className="text-xs" style={{ color: '#4a5a78' }}>HOS Compliance Planner</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {FEATURE_PILLS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(45,58,82,0.5)', color: '#94a3b8', border: '1px solid rgba(45,58,82,0.7)' }}
              >
                <Icon className="w-3 h-3" style={{ color: '#fbbf24' }} />
                {label}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#34d399' }}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
            70-hr / 8-Day Cycle
          </div>
        </div>
      </header>

      {/* ── Hero strip (hides once results are shown) ─────────────────── */}
      {!tripData && !loading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-4 text-center animate-fade-up">
          <p className="section-label mb-3">Electronic Logging Device</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
            Generate{' '}
            <span className="gradient-text">FMCSA-Compliant</span>
            <br />Logbooks Instantly
          </h2>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            Enter your route and we'll automatically build 24-hour HOS log sheets
            with legally-correct driving, rest, and inspection blocks.
          </p>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left col — form */}
          <div className="lg:col-span-4" style={{ position: 'relative', zIndex: 10 }}>
            <TripForm onSubmit={handleSubmit} loading={loading} />
          </div>

          {/* Right col — map + results */}
          <div className="lg:col-span-8 space-y-8" id="trip-results">

            {/* Error banner */}
            {error && (
              <div
                className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm animate-fade-up"
                style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.25)', color: '#fda4af' }}
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="flex-1">{error}</p>
                <button
                  onClick={() => setError(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fda4af', padding: 0, lineHeight: 1 }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-4 animate-fade-in">
                <div className="skeleton h-[340px] w-full rounded-2xl" />
                <div className="grid grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
                </div>
                <div className="skeleton h-64 rounded-2xl" />
                <div
                  className="text-center text-sm animate-fade-in"
                  style={{ color: '#4a5a78', paddingTop: '4px' }}
                >
                  ⏳ Calculating route &amp; generating HOS schedule…
                </div>
              </div>
            )}

            {/* Results */}
            {!loading && (
              <>
                <RouteMap route={tripData?.route} schedule={tripData?.schedule} />
                {tripData && <TripResults data={tripData} />}
              </>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer
        className="mt-20 py-6 text-center text-xs"
        style={{ borderTop: '1px solid rgba(45,58,82,0.5)', color: '#3d4f6e' }}
      >
        Spooter ELD · Property-Carrying Driver · 70 hrs / 8 days · FMCSA 49 CFR Part 395
      </footer>
    </div>
  );
}
