// Falls back to the deployed Render backend when VITE_API_URL is not set
const API_BASE = import.meta.env.VITE_API_URL || 'https://eld-trip-planner-b7en.onrender.com';

let _inFlight = false; // prevent double-submit

export async function planTrip(payload) {
  if (_inFlight) {
    throw new Error('A trip calculation is already in progress. Please wait.');
  }
  _inFlight = true;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout

    const res = await fetch(`${API_BASE}/api/plan-trip/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('Server returned an invalid response. Please try again.');
    }

    if (!res.ok) {
      const msg =
        data?.error ||
        data?.detail ||
        (data?.non_field_errors?.[0]) ||
        `Request failed (${res.status})`;
      throw new Error(msg);
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        'Request timed out (60s). The backend may be starting up — please try again in a moment.'
      );
    }
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error(
        'Cannot reach the server. Check your network or try again when the backend is running.'
      );
    }
    throw err;
  } finally {
    _inFlight = false;
  }
}

export async function geocodeSearch(query, limit = 5) {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(
      `${API_BASE}/api/geocode-search/?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
