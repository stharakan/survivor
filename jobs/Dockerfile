# Use the same Python minor version pinned in .python-version so the Job's
# runtime matches Heroku's. Keep in sync manually if .python-version bumps.
FROM python:3.13-slim

# uv for lockfile-fidelity installs (same tool used locally and on Heroku's
# uv-enabled Python buildpack).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency manifest first for layer caching.
COPY pyproject.toml uv.lock .python-version ./

# --frozen: fail if uv.lock is out of date, guaranteeing the container
# resolves to the exact same versions as the Heroku app.
# --no-dev: skip test-only deps (pytest, motor-with-mock, etc.).
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code. api/ provides the app.* package; jobs/ provides
# the entrypoint.
COPY api/ ./api/
COPY jobs/ ./jobs/

# Put api/ on sys.path so `from app.db.game_updater import ...` works.
ENV PYTHONPATH=/app/api

# uv creates .venv/; put its bin on PATH so `python` resolves to it.
ENV PATH="/app/.venv/bin:$PATH"

# Jobs have no port and no HTTP server; just run the script.
CMD ["python", "jobs/update_game_scores.py"]
