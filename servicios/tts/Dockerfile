# Servicio de voz de ARCA: Chatterbox en CPU.
# Base igual a la que se probó en el VPS el 28-ago (/opt/arkia/tts).
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir \
      --index-url https://download.pytorch.org/whl/cpu \
      torch torchaudio
RUN pip install --no-cache-dir chatterbox-tts "fastapi>=0.110" "uvicorn>=0.29"
WORKDIR /app
COPY app.py .
# Los pesos del modelo se descargan la primera vez a /modelos (montarlo como
# volumen para no bajarlos en cada arranque). Las muestras de voz, en /datos.
ENV HF_HOME=/modelos TTS_VOCES=/datos/voces
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
