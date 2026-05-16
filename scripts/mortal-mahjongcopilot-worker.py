"""Long-running MahjongCopilot Mortal worker.

The sidecar sends one JSON request per line:
{"id":"...","actor":0,"mjai":"..."}

The worker loads the Mortal engine once, creates a fresh mjai Bot for each
request, feeds that request's independent mjai log, and returns the action lines
that Mortal produced:
{"id":"...","stdout":"..."}
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path


def write_response(payload: dict[str, object]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def load_engine():
    copilot_dir_raw = os.environ.get("MAHJONG_COPILOT_DIR", "").strip()
    model_file_raw = os.environ.get("MORTAL_MODEL_FILE", "").strip()

    if not copilot_dir_raw:
        raise RuntimeError("MAHJONG_COPILOT_DIR is required for this optional adapter")

    if not model_file_raw:
        raise RuntimeError("MORTAL_MODEL_FILE is required for this optional adapter")

    copilot_dir = Path(copilot_dir_raw)
    model_file = Path(model_file_raw)

    if not copilot_dir.exists():
        raise RuntimeError(f"MahjongCopilot directory not found: {copilot_dir}")

    if not model_file.exists():
        raise RuntimeError(f"Mortal model file not found: {model_file}")

    sys.path.insert(0, str(copilot_dir))
    os.chdir(copilot_dir)

    import libriichi
    from bot.local.engine import get_engine

    return libriichi, get_engine(str(model_file))


def run_request(libriichi, engine, actor: int, mjai: str) -> str:
    if actor not in range(4):
        raise ValueError("actor must be an integer in [0, 3]")

    bot = libriichi.mjai.Bot(engine, actor)
    outputs: list[str] = []

    for raw_line in mjai.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        json.loads(line)
        reaction = bot.react(line)
        if reaction:
            outputs.append(reaction)

    return "\n".join(outputs) + ("\n" if outputs else "")


def main() -> int:
    try:
        libriichi, engine = load_engine()
    except Exception as error:
        write_response({"id": None, "error": f"failed to initialize Mortal worker: {error}"})
        return 1

    write_response({"id": None, "type": "ready"})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        request_id: object = None

        try:
            request = json.loads(line)
            request_id = request.get("id")
            actor = int(request.get("actor", 0))
            mjai = request.get("mjai", "")

            if not isinstance(mjai, str):
                raise ValueError("mjai must be a string")

            stdout = run_request(libriichi, engine, actor, mjai)
            write_response({"id": request_id, "stdout": stdout})
        except Exception as error:
            write_response({
                "id": request_id,
                "error": str(error),
                "traceback": traceback.format_exc(limit=3),
            })

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
