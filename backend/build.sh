#!/usr/bin/env bash
set -e
python manage.py migrate --noinput
gunicorn eld_backend.wsgi:application --bind 0.0.0.0:${PORT:-8000}
