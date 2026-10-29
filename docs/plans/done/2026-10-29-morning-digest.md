---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-10-29
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Completed issues and outcomes

| Issue | Outcome |
|-------|---------|
| [#1](https://github.com/artur7/mega-s01e04-rig/issues/1) | Run log reader and shared digest contract completed; sample reader tests pass with five jobs and one bad line. |
| [#2](https://github.com/artur7/mega-s01e04-rig/issues/2) | Server-rendered digest page completed, including sorting, warnings, missing nights and empty nights. |
| [#3](https://github.com/artur7/mega-s01e04-rig/issues/3) | JSON digest route completed using the same rows and ordering as the page. |
| [#4](https://github.com/artur7/mega-s01e04-rig/issues/4) | Status board links both sample nights to their digests with status counts. |
| [#5](https://github.com/artur7/mega-s01e04-rig/issues/5) | Digest route tests completed for success, missing, empty and malformed-line nights. |
| [#6](https://github.com/artur7/mega-s01e04-rig/issues/6) | Marked preview and issue links submitted; the reviewer confirmed viewing the preview before cleanup. |
| [#7](https://github.com/artur7/mega-s01e04-rig/issues/7) | Human-approved unmarked replacement verified at the same public URL; old marked artifact deleted and this plan archived. Issue closure waits for the archive commit to be pushed. |

### Review and cleanup record · 2026-10-29

- Review completion is recorded in [the #6 closing comment](https://github.com/artur7/mega-s01e04-rig/issues/6#issuecomment-6498041839):
  the reviewer has seen the marked preview. The human explicitly approved its unmarked
  replacement and deletion of the old marked artifact after that confirmation.
- [Unmarked workflow run 40882660332](https://github.com/artur7/mega-s01e04-rig/actions/runs/40882660332)
  succeeded with `marked=false`. Its capture step unsets `LANE_MARKER`, tests and typechecks
  the app, and saves the digest again before deployment.
- The public preview remains at https://artur7.github.io/mega-s01e04-rig/. Both the normal
  URL and a cache-busted fetch returned HTTP 200 with `no marker set`, all five sorted sample
  jobs, inline CSS and no scripts or external assets. The exact private lane marker and its
  HTML-escaped form were absent from both responses; the public marker has been removed.
- New unmarked `github-pages` artifact: `12901276656` (retained; not deleted).
- Previous marked run: `40878994489`. Only its marked artifact `12899856149` was deleted;
  a subsequent artifact lookup returned HTTP 404.
- No preview HTML, `.env`, token or lane marker was added to git. The archive commit must
  be integrated and pushed before #7 is closed; the course answer keeps the same repository
  and preview URLs.
