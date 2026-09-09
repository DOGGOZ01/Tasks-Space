FROM python:3.12-slim AS builder

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --shell /bin/bash --create-home app

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV SQLITE_PATH=/app/data/db.sqlite3

WORKDIR /app

COPY --chown=app:app . .

RUN chmod +x entrypoint.sh \
    && mkdir -p /app/data /app/media /app/staticfiles \
    && chown -R app:app /app/data /app/media /app/staticfiles

USER app

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
