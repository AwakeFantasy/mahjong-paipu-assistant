# QA Handoff: Paipu Player v2

Date: 2026-04-29

## Pause Status

This task was intentionally paused before the final full QA pass. The implementation work from the first multi-agent wave has landed in the working tree, and the current priority on resume is verification plus small UI polish, not another broad rewrite.

## Completed Work

- Created the planning docs under `docs/paipu-player-v2/`.
- Data Model Playback Agent moved playback derivation into `src/lib/majsoul/playback.ts` and added tests.
- Tile/River, Controls/Timeline, Table Layout, and Panels/Responsive work has been integrated into:
  - `src/components/paipu/tiles.tsx`
  - `src/components/paipu/event-format.ts`
  - `src/components/paipu/playback-controls.tsx`
  - `src/components/paipu/paipu-table.tsx`
  - `src/components/paipu/panels.tsx`
  - `src/app/home-client.tsx`
- Mojibake text in the integrated UI files was cleaned up before this pause.

## Checks Already Passed

The following checks passed before pausing:

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

Last known test result:

- 7 test files passed.
- 23 tests passed.
- Next.js build passed on Next.js 16.2.4.

## Real Paipu Sample

Use this sample for resume testing:

```text
https://game.maj-soul.com/1/?paipu=260429-1ccbed45-15bd-4708-85d3-fabeac0241f0
```

Expected API/debug summary:

```json
{
  "rounds": 5,
  "selectedRoundEvents": 109,
  "recordSource": "data",
  "recordsTotal": 395,
  "recordCounts": {
    "RecordNewRound": 5,
    "RecordDiscardTile": 194,
    "RecordDealTile": 176,
    "RecordChiPengGang": 15,
    "RecordHule": 5
  },
  "normalize": {
    "rounds": 5,
    "eventCount": 395
  }
}
```

Important expected interaction:

- Open East 1.
- Initial cursor shows `0 / 109` and the starting-hand state.
- Click next event twice.
- Expected current event: `东家 刹那の未来。 切 2z`.
- The target player's river should contain `2z`.

## Known Follow-Up Issues

- [P2] Mobile table internals can still overflow at around 390px width. Continue with Table Layout or Panels/Responsive ownership.
- [P3] Playback controls may appear in more than one responsive branch. This is visually workable, but it can complicate keyboard focus and browser automation.
- [P3] Finish the event #2 interaction QA in the browser after the task resumes.

## Suggested Resume Steps

1. Check the working tree:

   ```powershell
   git status --short
   ```

2. Re-run the required checks:

   ```powershell
   npm.cmd run test
   npm.cmd run lint
   npm.cmd run build
   ```

3. Start the dev server if it is not already running:

   ```powershell
   npm.cmd run dev -- --port 3000
   ```

4. Open the debug page:

   ```text
   http://localhost:3000/?debug=1
   ```

5. Paste the sample paipu URL and verify:

   - 5 rounds load.
   - Debug shows `recordSource: data`, `recordsTotal: 395`, and `normalize.eventCount: 395`.
   - East 1 at cursor 0 shows the starting-hand state.
   - After two next-event clicks, the current event is `东家 刹那の未来。 切 2z`.
   - The target player river shows `2z`.

6. Check narrow layout around 390px width:

   - No page-level horizontal scroll.
   - Center status stays inside the table.
   - Target player hand, river, and controls remain readable.
   - Debug panel appears after the main player area and does not squeeze the table.

## Recommended Next Agent

Resume with one focused agent first:

- `Panels/Responsive + Table Layout polish`

Give that agent ownership of `src/components/paipu/paipu-table.tsx`, `src/components/paipu/panels.tsx`, and layout-only edits in `src/app/home-client.tsx`.

After that, run a final QA agent using `docs/paipu-player-v2/06-qa-acceptance.md`.

## Files Changed By This Handoff

- `docs/paipu-player-v2/07-qa-handoff.md`
