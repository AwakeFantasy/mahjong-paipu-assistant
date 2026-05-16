"""Run the local MahjongCopilot Mortal model as an mjai stdin/stdout bot.

This wrapper is used by scripts/mortal-sidecar.mjs through MORTAL_COMMAND_TEMPLATE.
It avoids `docker run` during development and reuses the local MahjongCopilot
Python environment/model files.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/mortal-mahjongcopilot-wrapper.py <actor>", file=sys.stderr)
        return 1

    try:
        actor = int(sys.argv[1])
        if actor not in range(4):
            raise ValueError
    except ValueError:
        print("actor must be an integer in [0, 3]", file=sys.stderr)
        return 1

    copilot_dir_raw = os.environ.get("MAHJONG_COPILOT_DIR", "").strip()
    model_file_raw = os.environ.get("MORTAL_MODEL_FILE", "").strip()

    if not copilot_dir_raw:
        print("MAHJONG_COPILOT_DIR is required for this optional adapter", file=sys.stderr)
        return 1

    if not model_file_raw:
        print("MORTAL_MODEL_FILE is required for this optional adapter", file=sys.stderr)
        return 1

    copilot_dir = Path(copilot_dir_raw)
    model_file = Path(model_file_raw)

    if not copilot_dir.exists():
        print(f"MahjongCopilot directory not found: {copilot_dir}", file=sys.stderr)
        return 1

    if not model_file.exists():
        print(f"Mortal model file not found: {model_file}", file=sys.stderr)
        return 1

    sys.path.insert(0, str(copilot_dir))
    os.chdir(copilot_dir)

    try:
        import libriichi
        from bot.local.engine import get_engine
    except Exception as error:
        print(f"failed to import MahjongCopilot Mortal dependencies: {error}", file=sys.stderr)
        return 1

    try:
        engine = get_engine(str(model_file))
        bot = libriichi.mjai.Bot(engine, actor)
    except Exception as error:
        print(f"failed to initialize Mortal engine: {error}", file=sys.stderr)
        return 1

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            json.loads(line)
        except json.JSONDecodeError:
            print(f"invalid mjai json line: {line}", file=sys.stderr)
            return 1

        reaction = bot.react(line)
        if reaction:
            print(reaction, flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
