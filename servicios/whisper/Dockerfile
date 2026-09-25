# Transcripción de notas de voz: whisper.cpp con su servidor HTTP.
#
# Es la copia de lo que corre en el VPS de ARK-IA desde el 28-ago
# (/opt/arkia/whisper/Dockerfile.avx, contenedor `arkia-whisper`). Compilado
# con AVX pero SIN AVX2/FMA: la CPU de ese VPS no los tiene, y un binario con
# instrucciones que la CPU no conoce muere con "Illegal instruction" en la
# primera nota de voz. En un servidor con AVX2, pasar
#   --build-arg AVX2=ON
# lo acelera bastante.
#
# ARCA le habla con el protocolo `whispercpp` (POST /inference); ver
# src/lib/ai/transcribir.ts.
FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
      git build-essential cmake ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git .
ARG AVX2=OFF
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
      -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=${AVX2} -DGGML_AVX512=OFF \
      -DGGML_FMA=${AVX2} -DGGML_F16C=ON -DGGML_BMI2=OFF -DGGML_OPENMP=OFF \
      -DWHISPER_BUILD_SERVER=ON \
 && cmake --build build -j"$(nproc)" --config Release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/build/bin/ /usr/local/bin/
WORKDIR /models
# El modelo NO va en la imagen (son cientos de MB): se monta en /models.
# small-q5_0 es el equilibrio que se midió en el VPS entre calidad en
# español y tiempo de respuesta en CPU. Descarga:
#   curl -L -o ggml-small-q5_0.bin \
#     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_0.bin
EXPOSE 8080
CMD ["whisper-server", "--model", "/models/ggml-small-q5_0.bin", "--host", "0.0.0.0", \
     "--port", "8080", "--language", "es", "--threads", "6", "--convert"]
