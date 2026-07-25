# Spooter ELD — FMCSA Hours of Service Compliance Planner

A full-stack web application that automates Electronic Logging Device (ELD) compliance. Enter trip locations, and the app calculates the route, chunks the trip into legally compliant daily schedules, and renders FMCSA-compliant 24-hour logbook grids.

## Features

- **Trip Input Form** — Current location, pickup, dropoff, cycle hours used, driver/carrier info
- **Route Map** — Interactive map with route polyline and waypoint markers (OpenStreetMap + OSRM)
- **FMCSA HOS Engine** — Enforces all property-carrying driver rules:
  - 14-hour on-duty window
  - 11-hour driving limit per shift
  - 30-minute break after 8 hours driving
  - 10-hour off-duty/sleeper reset between shifts
  - Pre/post-trip inspections (30 min each)
  - Fuel stop every 1,000 miles
  - 1-hour pickup and 1-hour dropoff
  - 70-hour / 8-day cycle tracking
- **24-Hour Logbook Grid** — SVG-rendered ELD log with:
  - 15-minute time increments
  - Four status rows with horizontal timeline lines
  - Vertical connectors on status changes
  - Remarks section with time, location, and activity
  - Daily totals column (always sums to 24.0 hours)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4, Leaflet |
| Backend | Django 5, Django REST Framework |
| Routing | OSRM (free) + Nominatim geocoding |
| Maps | OpenStreetMap tiles |

## Project Structure

```
spooter/
├── backend/                 # Django API
│   ├── eld_backend/         # Project settings
│   ├── trips/
│   │   ├── services/
│   │   │   ├── hos_engine.py   # FMCSA HOS algorithm
│   │   │   └── routing.py      # OSRM + geocoding
│   │   ├── views.py
│   │   └── serializers.py
│   ├── requirements.txt
│   └── build.sh             # Render.com start script
├── frontend/                # React SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── TripForm.jsx
│   │   │   ├── RouteMap.jsx
│   │   │   ├── LogbookGrid.jsx
│   │   │   └── TripResults.jsx
│   │   └── api/client.js
│   └── vercel.json
└── README.md
```

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 8000
```

API health check: `http://localhost:8000/api/health/`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173` — the Vite dev server proxies `/api` to Django on port 8000.

### Test the API directly

```bash
curl -X POST http://localhost:8000/api/plan-trip/ \
  -H "Content-Type: application/json" \
  -d '{
    "current_location": "Chicago, IL",
    "pickup_location": "Indianapolis, IN",
    "dropoff_location": "Dallas, TX",
    "cycle_used_hours": 0
  }'
```

## Deployment Guide

### Backend → Render.com

1. Push code to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect your repo, set:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt && python manage.py migrate --noinput && python manage.py collectstatic --noinput`
   - **Start Command:** `gunicorn eld_backend.wsgi:application --bind 0.0.0.0:$PORT`
4. Add environment variables:
   ```
   DEBUG=False
   DJANGO_SECRET_KEY=<generate-a-strong-secret>
   ALLOWED_HOSTS=.onrender.com
   CORS_ALLOW_ALL=True
   ```
5. Deploy — note your URL (e.g. `https://spooter-eld.onrender.com`)

### Frontend → Vercel

1. Push code to GitHub
2. Import project on [Vercel](https://vercel.com)
3. Set:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
4. Add environment variable:
   ```
   VITE_API_URL=https://spooter-eld.onrender.com
   ```
5. Deploy — your app will be live at `https://your-app.vercel.app`

### Post-Deployment Checklist

- [ ] Backend `/api/health/` returns `{"status": "ok"}`
- [ ] Frontend loads and can submit a trip
- [ ] Map renders with route polyline
- [ ] Daily log sheets appear with correct totals (24.0 hrs)
- [ ] Remarks list all status changes

## HOS Algorithm Overview

The engine in `backend/trips/services/hos_engine.py` simulates a property-carrying driver's trip as a sequence of status blocks:

```
For each driving leg (current→pickup, pickup→dropoff):
  While driving time remains:
    Start shift → 30-min Pre-Trip Inspection
    Drive until 8 hrs cumulative → 30-min Break
    Drive until 11-hr drive limit OR 14-hr duty limit
    30-min Post-Trip Inspection
    10-hr Sleeper Berth rest
  Insert 1-hr Pickup/Dropoff at waypoints
  Insert Fuel Stop every 1,000 miles
```

Each block includes start/end timestamps, status, location (reverse-geocoded from route position), and activity label. Blocks are then split into calendar days for the logbook UI.

## API Reference

### `POST /api/plan-trip/`

**Request body:**
```json
{
  "current_location": "Chicago, IL",
  "pickup_location": "Indianapolis, IN",
  "dropoff_location": "Dallas, TX",
  "cycle_used_hours": 0,
  "trip_start": "2026-07-22T08:00:00Z",
  "driver_name": "John Driver",
  "carrier_name": "Spooter Logistics LLC"
}
```

**Response:** Route data (coordinates, distance, waypoints) + schedule (blocks, daily_logs, summary).

### `GET /api/health/`

Returns `{"status": "ok"}`.

## Assumptions (per assessment)

- Property-carrying driver, 70 hrs / 8 days cycle
- No adverse driving conditions
- Fueling at least once every 1,000 miles
- 1 hour for pickup and 1 hour for drop-off
- Free OSRM/Nominatim APIs (rate-limited; suitable for demo/production light use)

## Loom Video Script (3–5 min)

1. **Intro (30s)** — Show the app, explain the ELD compliance problem
2. **Demo (90s)** — Enter a trip (Chicago → Indianapolis → Dallas), generate logs, scroll through map and daily sheets
3. **Algorithm (90s)** — Open `hos_engine.py`, walk through shift loop, break triggers, rest periods
4. **Architecture (30s)** — Django API + React frontend, OSRM routing, deployment on Render/Vercel
5. **Wrap-up (30s)** — Show daily totals = 24.0, remarks, cycle tracking

## License

Built for the Spooter full-stack developer assessment.
# ELD-Trip-Planner
