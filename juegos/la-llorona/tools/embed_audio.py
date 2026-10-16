"""Genera audio-data.js con los MP3 de audio/ en base64.

El juego se abre directamente desde el disco (file://), donde fetch() no funciona,
así que los sonidos van incrustados en un .js. Ejecuta tras cambiar un MP3:

    python3 juegos/la-llorona/tools/embed_audio.py
"""
import base64
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOUNDS = {
    "lloronaBusca": "audio/llorona-busca.mp3",  # lamento mientras te busca
    "gritoMuerte": "audio/grito-muerte.mp3",  # grito cuando te atrapa
}

data = {key: base64.b64encode((ROOT / path).read_bytes()).decode("ascii") for key, path in SOUNDS.items()}
out = ROOT / "audio-data.js"
out.write_text(
    "// Archivo generado por tools/embed_audio.py: no editar a mano.\n"
    f"window.LLORONA_AUDIO = {json.dumps(data)};\n",
    encoding="utf-8",
)
print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB")
