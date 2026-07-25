import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Search, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

/**
 * LocationAutocomplete
 *
 * Props:
 *   label        – field label text
 *   name         – HTML name attribute
 *   iconColor    – color for the map pin icon
 *   value        – current value (string OR resolved {lat,lng,city_state} object)
 *   onChange     – called with (name, resolvedValue) where resolvedValue is:
 *                  • { lat, lng, city_state, display_name, short_name } when a suggestion is selected
 *                  • null when the user clears the field
 *   placeholder  – input placeholder
 *   disabled     – disable the input
 */
export default function LocationAutocomplete({
  label,
  name,
  iconColor = '#6b7fa3',
  value,
  onChange,
  placeholder = 'City, State or Address',
  disabled = false,
}) {
  // The text shown in the input
  const [inputText, setInputText] = useState(
    typeof value === 'string'
      ? value
      : value?.short_name || value?.city_state || ''
  );
  // Whether a valid suggestion has been selected (locks in lat/lng)
  const [isResolved, setIsResolved] = useState(
    value && typeof value === 'object' && value.lat != null
  );
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // ── Sync external value changes (e.g. preset button) ─────────────────────
  useEffect(() => {
    if (value && typeof value === 'object' && value.lat != null) {
      setInputText(value.short_name || value.city_state || '');
      setIsResolved(true);
      setSuggestions([]);
      setOpen(false);
    } else if (typeof value === 'string') {
      setInputText(value);
      setIsResolved(false);
    } else if (value === null || value === undefined) {
      setInputText('');
      setIsResolved(false);
    }
  }, [value]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setOpen(false);
        setHighlighted(-1);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── Debounced search ──────────────────────────────────────────────────────
  const fetchSuggestions = useCallback(async (q) => {
    if (q.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setError(null);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/geocode-search/?q=${encodeURIComponent(q)}&limit=5`
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSuggestions(data);
      setOpen(true);
      setHighlighted(-1);
      if (data.length === 0) {
        setError(`No results found for "${q}". Try a different city or address.`);
      }
    } catch (err) {
      setError('Search unavailable. You can still type a location manually.');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTextChange = (e) => {
    const q = e.target.value;
    setInputText(q);
    setIsResolved(false);
    setError(null);

    // Notify parent that the value is no longer resolved
    onChange(name, q);

    clearTimeout(debounceRef.current);
    if (q.trim().length >= MIN_QUERY_LEN) {
      debounceRef.current = setTimeout(() => fetchSuggestions(q.trim()), DEBOUNCE_MS);
    } else {
      setSuggestions([]);
      setOpen(false);
    }
  };

  const selectSuggestion = (suggestion) => {
    setInputText(suggestion.short_name || suggestion.city_state || suggestion.display_name);
    setIsResolved(true);
    setSuggestions([]);
    setOpen(false);
    setHighlighted(-1);
    setError(null);
    // Pass the fully resolved object to the parent
    onChange(name, {
      lat:          suggestion.lat,
      lng:          suggestion.lng,
      city_state:   suggestion.short_name || suggestion.city_state,
      short_name:   suggestion.short_name,
      display_name: suggestion.display_name,
    });
  };

  const clearField = () => {
    setInputText('');
    setIsResolved(false);
    setSuggestions([]);
    setOpen(false);
    setError(null);
    onChange(name, null);
    inputRef.current?.focus();
  };

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  const statusColor = isResolved ? '#34d399' : iconColor;

  return (
    <div style={{ position: 'relative' }}>
      <label
        htmlFor={name}
        className="section-label block mb-1.5"
      >
        {label}
      </label>

      {/* Input wrapper */}
      <div style={{ position: 'relative' }}>
        {/* Left icon */}
        <MapPin
          style={{
            position: 'absolute', left: '10px', top: '50%',
            transform: 'translateY(-50%)',
            width: '14px', height: '14px',
            color: statusColor,
            pointerEvents: 'none',
            transition: 'color 0.2s',
          }}
        />

        <input
          ref={inputRef}
          id={name}
          name={name}
          type="text"
          value={inputText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="input-field"
          style={{
            paddingLeft: '2.2rem',
            paddingRight: (loading || isResolved || inputText) ? '2.5rem' : '0.9rem',
            borderColor: isResolved
              ? 'rgba(52,211,153,0.4)'
              : error
              ? 'rgba(251,113,133,0.4)'
              : undefined,
          }}
        />

        {/* Right indicator: spinner / resolved check / clear */}
        <div
          style={{
            position: 'absolute', right: '10px', top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center',
          }}
        >
          {loading && (
            <Loader2 style={{ width: '14px', height: '14px', color: '#4a5a78', animation: 'spin 1s linear infinite' }} />
          )}
          {!loading && isResolved && (
            <CheckCircle2 style={{ width: '14px', height: '14px', color: '#34d399' }} />
          )}
          {!loading && !isResolved && inputText && (
            <button
              type="button"
              onClick={clearField}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', color: '#4a5a78', lineHeight: 1,
              }}
              title="Clear"
            >
              <X style={{ width: '14px', height: '14px' }} />
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '11px', color: '#fb7185' }}>
          <AlertCircle style={{ width: '11px', height: '11px', flexShrink: 0 }} />
          {error}
        </p>
      )}

      {/* Autocomplete dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            margin: 0,
            padding: '4px',
            listStyle: 'none',
            background: 'rgba(22,27,39,0.98)',
            border: '1px solid rgba(45,58,82,0.9)',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            maxHeight: '220px',
            overflowY: 'auto',
          }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.place_id || i}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur before click
                selectSuggestion(s);
              }}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '7px',
                cursor: 'pointer',
                background: highlighted === i ? 'rgba(251,191,36,0.1)' : 'transparent',
                transition: 'background 0.12s',
              }}
            >
              <MapPin
                style={{
                  width: '13px', height: '13px',
                  color: highlighted === i ? '#fbbf24' : '#4a5a78',
                  flexShrink: 0, marginTop: '2px',
                  transition: 'color 0.12s',
                }}
              />
              <div>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: highlighted === i ? '#fcd34d' : '#e2e8f0', lineHeight: '1.3' }}>
                  {s.short_name}
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: '#4a5a78', lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' }}>
                  {s.display_name}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
