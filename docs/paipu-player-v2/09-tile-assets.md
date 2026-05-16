# Tile Assets

## Current Source

- Source repository: https://github.com/FluffyStuff/riichi-mahjong-tiles
- Asset set: `Regular`
- License: public domain / CC0, as stated by the upstream `README.md` and `LICENSE.md`.
- Imported date: 2026-05-02.

## Local Mapping

The app keeps using the existing normalized tile-code paths:

- `1m` to `9m`: characters, copied from `Man1.svg` to `Man9.svg`.
- `0m`: red five characters, copied from `Man5-Dora.svg`.
- `1p` to `9p`: circles, copied from `Pin1.svg` to `Pin9.svg`.
- `0p`: red five circles, copied from `Pin5-Dora.svg`.
- `1s` to `9s`: bamboo, copied from `Sou1.svg` to `Sou9.svg`.
- `0s`: red five bamboo, copied from `Sou5-Dora.svg`.
- `1z` to `7z`: east, south, west, north, white, green, red, copied from `Ton.svg`, `Nan.svg`, `Shaa.svg`, `Pei.svg`, `Haku.svg`, `Hatsu.svg`, `Chun.svg`.
- `back`: tile back, copied from `Back.svg`, used only for hidden opponent-hand placeholders.

The copied files live in `public/mahjong-tiles/` and are referenced through `src/components/paipu/tile-images.ts`.

## Notes

- Keep the stable `/mahjong-tiles/{tileCode}.svg` paths so playback, hover highlight, dora indicators, and future table layout work do not need to know the upstream filename scheme.
- If another tile set is tried later, replace files behind the same local names first before changing component logic.
