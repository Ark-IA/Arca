"""
Servicio de voz de ARCA: texto -> nota de voz, con la voz clonada de la cuenta.

Usa Chatterbox (Resemble AI, licencia MIT). Clona una voz a partir de una
muestra de unos 10 segundos: no hay que entrenar nada. Es lo que se probó en
el VPS de ARK-IA el 28-ago (/opt/arkia/tts).

Endpoints (todos piden la cabecera X-Arca-Clave si TTS_CLAVE está puesta):

  GET    /salud                  modelo cargado, voces guardadas
  PUT    /voces/{voz}            sube la muestra (cualquier formato de audio)
  DELETE /voces/{voz}
  POST   /sintetizar             {"texto", "voz"?} -> audio/ogg (Opus)

El resultado es OGG/Opus mono porque es lo que WhatsApp reproduce como nota
de voz. Se genera de a una petición por vez: el modelo en CPU usa todos los
núcleos, y dos a la vez tardan más que una detrás de otra.
"""

from __future__ import annotations

import asyncio
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

HILOS = int(os.environ.get("TTS_HILOS", str(os.cpu_count() or 4)))
os.environ.setdefault("OMP_NUM_THREADS", str(HILOS))
os.environ.setdefault("MKL_NUM_THREADS", str(HILOS))
os.environ.setdefault("HF_HOME", "/modelos")

import torch  # noqa: E402  (tiene que ir después de fijar los hilos)
import torchaudio  # noqa: E402

torch.set_num_threads(HILOS)

MODELO = os.environ.get("TTS_MODELO", "multilingue")  # multilingue | turbo | ingles
IDIOMA = os.environ.get("TTS_IDIOMA", "es")
CLAVE = os.environ.get("TTS_CLAVE", "")
DIR_VOCES = Path(os.environ.get("TTS_VOCES", "/datos/voces"))
DIR_VOCES.mkdir(parents=True, exist_ok=True)

# Una respuesta de WhatsApp larga es un audio de minutos que nadie escucha, y
# en CPU tarda más que el texto en leerse. Por encima de esto se corta.
MAX_CARACTERES = int(os.environ.get("TTS_MAX_CARACTERES", "700"))
MAX_BYTES_MUESTRA = 10 * 1024 * 1024

app = FastAPI(title="ARCA voz")
_modelo = None
_candado = asyncio.Lock()


def _cargar():
    global _modelo
    if _modelo is not None:
        return _modelo
    t0 = time.time()
    if MODELO == "turbo":
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        _modelo = ChatterboxTurboTTS.from_pretrained(device="cpu")
    elif MODELO == "ingles":
        from chatterbox.tts import ChatterboxTTS

        _modelo = ChatterboxTTS.from_pretrained(device="cpu")
    else:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        _modelo = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    print(f"[voz] modelo {MODELO} cargado en {time.time() - t0:.1f} s, {HILOS} hilos", flush=True)
    return _modelo


# Carga bajo demanda. Con TTS_CARGA_PEREZOSA=1 el modelo no se carga al
# arrancar sino con la primera síntesis, y se descarga tras
# TTS_DESCARGAR_TRAS_MIN minutos sin uso. Es para servidores compartidos
# (el de ARK-IA tiene la base de datos al lado): 2-3 GB ocupados todo el día
# para unas cuantas notas de voz no se justifican. El costo es que la
# primera nota tras un rato de silencio tarda lo que tarda cargar.
PEREZOSA = os.environ.get("TTS_CARGA_PEREZOSA", "0") == "1"
DESCARGAR_TRAS_S = int(os.environ.get("TTS_DESCARGAR_TRAS_MIN", "15")) * 60
_ultimo_uso = 0.0


def _descargar() -> None:
    global _modelo
    if _modelo is None:
        return
    import gc

    _modelo = None
    gc.collect()
    print("[voz] modelo descargado por inactividad", flush=True)


async def _vigilar_inactividad() -> None:
    while True:
        await asyncio.sleep(60)
        if _modelo is not None and time.time() - _ultimo_uso > DESCARGAR_TRAS_S and not _candado.locked():
            async with _candado:
                _descargar()


@app.on_event("startup")
async def _al_arrancar() -> None:
    if PEREZOSA:
        asyncio.create_task(_vigilar_inactividad())
        return
    # Sin carga perezosa se carga al arrancar: cargar tarda decenas de
    # segundos, y ese primer cliente se quedaría esperando.
    await asyncio.to_thread(_cargar)


def _autorizado(x_arca_clave: str | None = Header(default=None)) -> None:
    if CLAVE and x_arca_clave != CLAVE:
        raise HTTPException(status_code=401, detail="clave inválida")


def _ruta_voz(voz: str) -> Path:
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", voz):
        raise HTTPException(status_code=400, detail="identificador de voz inválido")
    return DIR_VOCES / f"{voz}.wav"


def _ffmpeg(args: list[str]) -> None:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True)
    if r.returncode != 0:
        raise HTTPException(status_code=422, detail=f"ffmpeg: {r.stderr.decode(errors='ignore')[:300]}")


@app.get("/salud")
def salud(_: None = Depends(_autorizado)) -> dict:
    return {
        # Con carga perezosa el servicio está listo aunque el modelo no esté
        # en memoria: lo carga la próxima síntesis.
        "ok": PEREZOSA or _modelo is not None,
        "cargado": _modelo is not None,
        "modelo": MODELO,
        "idioma": IDIOMA,
        "voces": sorted(p.stem for p in DIR_VOCES.glob("*.wav")),
    }


@app.put("/voces/{voz}")
async def subir_voz(voz: str, request: Request, _: None = Depends(_autorizado)) -> dict:
    destino = _ruta_voz(voz)
    cuerpo = await request.body()
    if not cuerpo:
        raise HTTPException(status_code=400, detail="la muestra está vacía")
    if len(cuerpo) > MAX_BYTES_MUESTRA:
        raise HTTPException(status_code=413, detail="la muestra pasa de 10 MB")

    with tempfile.NamedTemporaryFile(suffix=".bin") as crudo:
        crudo.write(cuerpo)
        crudo.flush()
        # Se normaliza a WAV mono 24 kHz y se recorta a 20 s: más muestra no
        # mejora la clonación y sí hace más lenta cada síntesis.
        _ffmpeg(["-i", crudo.name, "-ac", "1", "-ar", "24000", "-t", "20", str(destino)])

    info = torchaudio.info(str(destino))
    segundos = info.num_frames / info.sample_rate
    if segundos < 5:
        destino.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="la muestra tiene que durar al menos 5 segundos")
    return {"ok": True, "voz": voz, "segundos": round(segundos, 1)}


@app.delete("/voces/{voz}")
def borrar_voz(voz: str, _: None = Depends(_autorizado)) -> dict:
    _ruta_voz(voz).unlink(missing_ok=True)
    return {"ok": True}


class Pedido(BaseModel):
    texto: str = Field(min_length=1)
    voz: str | None = None


def _preparar(texto: str) -> str:
    # Emojis, asteriscos de negrita y enlaces se leen en voz alta como ruido.
    t = re.sub(r"https?://\S+", "el enlace que te dejo por escrito", texto)
    t = re.sub(r"[*_~`#>]", "", t)
    t = re.sub(r"[\U0001F000-\U0001FFFF☀-➿️]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) > MAX_CARACTERES:
        corte = t.rfind(".", 0, MAX_CARACTERES)
        t = t[: corte + 1 if corte > MAX_CARACTERES // 2 else MAX_CARACTERES]
    return t


def _generar(texto: str, muestra: Path | None):
    modelo = _cargar()
    extra: dict = {}
    if muestra is not None:
        extra["audio_prompt_path"] = str(muestra)
    if MODELO == "multilingue":
        extra["language_id"] = IDIOMA
    return modelo.generate(texto, **extra), modelo.sr


@app.post("/sintetizar")
async def sintetizar(pedido: Pedido, _: None = Depends(_autorizado)) -> Response:
    texto = _preparar(pedido.texto)
    if not texto:
        raise HTTPException(status_code=400, detail="no queda texto para leer")

    muestra = None
    if pedido.voz:
        ruta = _ruta_voz(pedido.voz)
        if ruta.exists():
            muestra = ruta

    t0 = time.time()
    global _ultimo_uso
    async with _candado:
        wav, sr = await asyncio.to_thread(_generar, texto, muestra)
        _ultimo_uso = time.time()
    generacion = time.time() - t0

    with tempfile.TemporaryDirectory() as d:
        entrada = Path(d) / "voz.wav"
        salida = Path(d) / "voz.ogg"
        torchaudio.save(str(entrada), wav.cpu(), sr)
        _ffmpeg(["-i", str(entrada), "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", str(salida)])
        audio = salida.read_bytes()

    duracion = wav.shape[-1] / sr
    print(f"[voz] {len(texto)} caracteres, {duracion:.1f} s de audio en {generacion:.1f} s", flush=True)
    return Response(
        content=audio,
        media_type="audio/ogg",
        headers={"X-Duracion": f"{duracion:.1f}", "X-Generacion": f"{generacion:.1f}"},
    )
