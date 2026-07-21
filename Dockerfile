FROM python:3.14-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/pyproject.toml .
RUN pip install --no-cache-dir .

COPY backend/ .

# Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.14-slim
WORKDIR /app
COPY --from=0 /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=0 /app /app
COPY --from=frontend-builder /app/frontend/out /app/static

ENV STORAGE_PATH=/data/documents
ENV MODELS_PATH=/models

EXPOSE 3000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3000"]
