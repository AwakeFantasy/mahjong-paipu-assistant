from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from typing import Any

try:
    from mahjong.constants import EAST, NORTH, SOUTH, WEST
    from mahjong.hand_calculating.hand import HandCalculator
    from mahjong.hand_calculating.hand_config import HandConfig, OptionalRules
    from mahjong.meld import Meld
    from mahjong.tile import TilesConverter
except Exception as error:  # pragma: no cover - handled at runtime
    _IMPORT_ERROR = error
    HandCalculator = None  # type: ignore[assignment]
else:
    _IMPORT_ERROR = None


WIND_MAP = {"E": EAST, "S": SOUTH, "W": WEST, "N": NORTH}


@dataclass
class ScoreResult:
    valid: bool
    kind: str
    point: int = 0
    han: int | None = None
    fu: int | None = None
    yaku: list[str] | None = None
    error: str | None = None
    main: int | None = None
    additional: int | None = None
    total: int | None = None


def main() -> None:
    send_json({"type": "ready", "available": _IMPORT_ERROR is None, "reason": None if _IMPORT_ERROR is None else str(_IMPORT_ERROR)})

    for raw_line in sys.stdin:
      line = raw_line.strip()
      if not line:
          continue

      try:
          message = json.loads(line)
      except Exception as error:  # pragma: no cover - runtime guard
          send_json({"id": None, "error": f"invalid_json: {error}"})
          continue

      request_id = message.get("id")
      command = message.get("command")
      payload = message.get("payload") or {}

      if command == "score":
          if _IMPORT_ERROR is not None:
              send_json({"id": request_id, "error": f"mahjong_unavailable: {_IMPORT_ERROR}"})
              continue

          try:
              result = score_hand(payload)
              send_json({"id": request_id, "result": result.__dict__})
          except Exception as error:  # pragma: no cover - runtime guard
              send_json({"id": request_id, "error": str(error)})
          continue

      send_json({"id": request_id, "error": f"unknown_command: {command}"})


def score_hand(payload: dict[str, Any]) -> ScoreResult:
    tiles = [normalize_tile(tile) for tile in payload.get("tiles", []) if isinstance(tile, str)]
    win_tile = normalize_tile(str(payload.get("winTile", "")))
    melds = [to_meld(item) for item in payload.get("melds", []) if isinstance(item, dict)]
    dora_indicators = [tiles_to_136([normalize_tile(tile)], False)[0] for tile in payload.get("doraIndicators", []) if isinstance(tile, str)]
    ura_dora_indicators = [tiles_to_136([normalize_tile(tile)], False)[0] for tile in payload.get("uraDoraIndicators", []) if isinstance(tile, str)]
    round_wind = WIND_MAP.get(str(payload.get("roundWind", "E")).upper(), EAST)
    seat_wind = WIND_MAP.get(str(payload.get("seatWind", "E")).upper(), EAST)
    has_open_tanyao = bool(payload.get("hasOpenTanyao", True))
    has_aka_dora = bool(payload.get("hasAkaDora", True))
    allow_riichi = bool(payload.get("allowRiichi", True))
    open_melds = [meld for meld in melds if meld.opened]

    if not tiles or not win_tile:
        return ScoreResult(valid=False, kind=str(payload.get("kind", "ron")), error="missing_tiles")

    # Preserve red fives by replacing one normal five when a red tile is present.
    normalized_full = tiles_to_136(tiles, has_aka_dora)
    win_tile_136 = find_win_tile_id(win_tile, normalized_full)
    if win_tile_136 is None:
        return ScoreResult(valid=False, kind=str(payload.get("kind", "ron")), error="winning_tile_not_in_hand")

    calc = HandCalculator()
    kind = "tsumo" if bool(payload.get("isTsumo")) else "ron"
    is_open_hand = any(meld.opened for meld in melds)
    configs = [build_config(kind, round_wind, seat_wind, allow_riichi and not is_open_hand, payload)]
    if allow_riichi and not is_open_hand:
        configs.append(build_config(kind, round_wind, seat_wind, False, payload))

    best: ScoreResult | None = None
    for config in configs:
        response = calc.estimate_hand_value(
            normalized_full,
            win_tile_136,
            melds=melds,
            dora_indicators=dora_indicators,
            ura_dora_indicators=ura_dora_indicators,
            config=config,
        )
        if response.error:
            continue

        cost = response.cost or {}
        point = int(cost.get("total") or 0)
        candidate = ScoreResult(
            valid=True,
            kind=kind,
            point=point,
            han=int(response.han or 0),
            fu=int(response.fu or 0),
            yaku=[str(item) for item in response.yaku or []],
            error=None,
            main=int(cost.get("main") or 0),
            additional=int(cost.get("additional") or 0),
            total=point,
        )
        if best is None or candidate.point > best.point:
            best = candidate

    if best is None:
        return ScoreResult(valid=False, kind=kind, error="hand_not_winning_or_no_yaku")

    return best


def build_config(kind: str, round_wind: int, seat_wind: int, is_riichi: bool, payload: dict[str, Any]) -> HandConfig:
    return HandConfig(
        is_tsumo=kind == "tsumo",
        is_riichi=is_riichi,
        player_wind=seat_wind,
        round_wind=round_wind,
        kyoutaku_number=int(payload.get("kyoutakuNumber", 0) or 0),
        tsumi_number=int(payload.get("tsumiNumber", 0) or 0),
        options=OptionalRules(
            has_open_tanyao=bool(payload.get("hasOpenTanyao", True)),
            has_aka_dora=bool(payload.get("hasAkaDora", True)),
        ),
    )


def to_meld(item: dict[str, Any]) -> Meld:
    raw_tiles = [normalize_tile(str(tile)) for tile in item.get("tiles", []) if isinstance(tile, str)]
    tiles = tiles_to_136(raw_tiles, True)
    meld_type = str(item.get("type", "")).lower()
    opened = bool(item.get("opened", True))
    if meld_type in {"chi", "吃"}:
      return Meld(meld_type=Meld.CHI, tiles=tiles, opened=True)
    if meld_type in {"pon", "碰"}:
      return Meld(meld_type=Meld.PON, tiles=tiles, opened=True)
    if meld_type in {"shouminkan", "kakan", "加杠", "加槓"}:
      return Meld(meld_type=Meld.SHOUMINKAN, tiles=tiles, opened=True)
    if meld_type in {"ankan", "暗杠", "暗槓"}:
      return Meld(meld_type=Meld.KAN, tiles=tiles, opened=False)
    return Meld(meld_type=Meld.KAN, tiles=tiles, opened=opened)


def normalize_tile(tile: str) -> str:
    tile = tile.strip().lower()
    if tile.startswith("5") and len(tile) == 2 and tile[1] in "mps":
        return tile
    if tile.startswith("0") and len(tile) == 2 and tile[1] in "mps":
        return tile
    return tile


def tiles_to_136(tiles: list[str], has_aka_dora: bool) -> list[int]:
    counts: dict[str, int] = {}
    result: list[int] = []
    for tile in tiles:
        counts[tile] = counts.get(tile, 0) + 1
        if tile in {"0m", "0p", "0s"}:
            result.append(to_136_tile(tile))
            continue
        suit = tile[-1]
        rank = int(tile[:-1])
        base = {"m": 0, "p": 36, "s": 72, "z": 108}[suit]
        offset = min(counts[tile] - 1, 3)
        if has_aka_dora and suit in {"m", "p", "s"} and rank == 5:
            offset = min(counts[tile], 3)
        result.append(base + (rank - 1) * 4 + offset)
    return result


def find_win_tile_id(tile: str, full_tiles: list[int]) -> int | None:
    wanted = tile_to_34(tile)
    if wanted is None:
        return None

    if tile in {"0m", "0p", "0s"}:
        red_id = {"0m": 16, "0p": 52, "0s": 88}[tile]
        return red_id if red_id in full_tiles else None

    for tile_id in full_tiles:
        if tile_id // 4 == wanted and tile_id not in {16, 52, 88}:
            return tile_id

    for tile_id in full_tiles:
        if tile_id // 4 == wanted:
            return tile_id

    return None


def tile_to_34(tile: str) -> int | None:
    tile = normalize_tile(tile)
    if len(tile) != 2:
        return None

    rank = 5 if tile[0] == "0" else int(tile[0])
    suit = tile[1]
    base = {"m": 0, "p": 9, "s": 18, "z": 27}.get(suit)
    if base is None:
        return None

    return base + rank - 1


def send_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
