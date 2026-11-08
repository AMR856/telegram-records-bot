# Use the lightweight Debian-based Python 3.12 slim image
FROM python:3.12-slim

# Configure Python & pip behavior for containers:
# - PYTHONDONTWRITEBYTECODE: Do not write .pyc files
# - PYTHONUNBUFFERED: Flush stdout/stderr immediately so logs appear in real time
# - PIP_NO_CACHE_DIR: Disable pip cache to keep the image size small
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Set the working directory inside the container
WORKDIR /app

# Create a non-root system group and user named "app" for security
RUN addgroup --system app && adduser --system --ingroup app app

# Copy requirements first to leverage Docker layer caching
COPY requirements.txt ./

# Install Python dependencies without caching
RUN pip install --no-cache-dir -r requirements.txt

# Copy Alembic migration config, migration scripts, and application source code
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Grant ownership of /app to the non-root "app" user and switch to it
RUN chown -R app:app /app
USER app

# Document that the container listens on port 8000
EXPOSE 8000

# Run database migrations, then start Uvicorn.
# One worker only: the Telegram pollers are in-process and must not be duplicated.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]