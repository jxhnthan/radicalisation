FROM python:3.12-slim

WORKDIR /app

# Install backend deps first (cache-friendly)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the app + everything the backend needs
COPY backend ./backend
COPY src ./src
COPY prompts ./prompts
# Precomputed data makes the demo run fully offline: the app pool, the judge
# analyses (instant reveal), and the evaluation results for /api/performance
COPY data/labelled_personas.csv ./data/labelled_personas.csv
COPY data/app_pool.csv ./data/app_pool.csv
COPY data/analyses.json ./data/analyses.json
COPY data/evaluation_results.json ./data/evaluation_results.json

# Run as an unprivileged user (SonarQube: containers should not run as root).
# /app stays writable so /api/sessions can append to data/admin/.
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Ollama is optional at runtime (only used as a fallback for uncached personas);
# host.docker.internal reaches an Ollama running on the host machine.
# LLM_API_KEY is a non-secret placeholder for local Ollama (which ignores auth);
# it is supplied at runtime by docker-compose, not baked into the image.
ENV LLM_BASE_URL=http://host.docker.internal:11434/v1
ENV LLM_MODEL=qwen2.5:7b

EXPOSE 8000
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
