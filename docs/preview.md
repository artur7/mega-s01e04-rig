# Digest preview operations (issue #6)

Preparation is not publication approval. **Dispatch only after explicit human approval.**
This workflow never runs on push or pull request, and only
accepts dispatches against `main`. No preview or marker belongs in git, issues, or attachments.

## Before any publication

1. Integrate and verify issues [#1](https://github.com/artur7/mega-s01e04-rig/issues/1),
   [#2](https://github.com/artur7/mega-s01e04-rig/issues/2),
   [#3](https://github.com/artur7/mega-s01e04-rig/issues/3),
   [#4](https://github.com/artur7/mega-s01e04-rig/issues/4), and
   [#5](https://github.com/artur7/mega-s01e04-rig/issues/5). Integrate this workflow into `main`.
2. The operator must explicitly approve marked-page publication separately from hosting.
   Only after approval, enable GitHub Pages with **GitHub Actions** as its source in this
   repository's Settings → Pages. The workflow does not enable Pages itself.
3. After approval, set repository Actions secret `LANE_MARKER` from the lane's ignored `.env`
   using GitHub's secret UI (never put the value in commands, logs, git, or issue text).
   Consider a required reviewer on the `github-pages` environment as a second deployment gate.
   The workflow sends the secret only to the marked capture step, not to tests.

Node 22+ is required. Dependencies use `npx --yes pnpm@12.15.0 install --frozen-lockfile`.
The workflow uses official action majors: checkout/setup-node v6, configure-pages v5,
upload-pages-artifact/deploy-pages v4.

## Local unmarked check (does not publish)

```sh
npx --yes pnpm@12.15.0 install --frozen-lockfile
bash scripts/capture-preview.sh
# Inspect .preview/site/index.html locally; never attach it.
rm -f .preview/site/index.html
```

The command tests and typechecks first, ignores `.env`, unsets any inherited marker by
default, runs the actual app against committed `runs/` sample data on loopback, waits for
HTTP readiness, and uses curl to save `/digest/2026-10-28`. It stops its specific server PID
on exit and removes failed captures. The ignored `.preview/site/` contains only `index.html`.
Validation requires a full document, inline CSS, no client JS/external assets, the sample lane,
the five sorted sample jobs, and the selected banner mode. Verify the complete page locally
contains only template sample data before publication; do not dump its HTML into logs.

## Approved marked deployment (operator only; not executed during preparation)

```sh
gh workflow run digest-preview.yml --repo artur7/mega-s01e04-rig --ref main -f marked=true
gh run list --repo artur7/mega-s01e04-rig --workflow digest-preview.yml --limit 5
gh run watch RUN_ID --repo artur7/mega-s01e04-rig --exit-status
gh api repos/artur7/mega-s01e04-rig/actions/runs/RUN_ID/artifacts \
  --jq '.artifacts[] | {id, name, expires_at}'
```

Record the marked run ID and `github-pages` artifact ID. The run summary reports both IDs
and the deployment URL; `deploy` also exposes job outputs `page_url` and `artifact_id`.
Use that actual HTTPS URL (normally `https://artur7.github.io/mega-s01e04-rig/`), not an
artifact download URL. Open the complete page and send the reviewer that URL with the plan's
issue links #1–#5 above, [#6](https://github.com/artur7/mega-s01e04-rig/issues/6), and
[#7](https://github.com/artur7/mega-s01e04-rig/issues/7).
Submission is not review completion. Keep #6 open until the course confirms that
the reviewer has actually inspected the marked preview. Only then may #6 be closed.

## After review: unmarked replacement at the same URL

Do not remove the marker before review is in. Dispatch the same workflow with its safe default:

```sh
gh workflow run digest-preview.yml --repo artur7/mega-s01e04-rig --ref main -f marked=false
# Locate the new run ID and wait for successful deployment as above.
```

Check the same HTTPS URL now says `no marker set` and the digest remains complete. Then
delete the **old marked artifact**, using the ID recorded from the marked run (not the
unmarked replacement's ID):

```sh
gh api --method DELETE repos/artur7/mega-s01e04-rig/actions/artifacts/MARKED_ARTIFACT_ID
```

Artifacts have one-day retention, but expiry does not remove a deployed page. Replacement
removes the public marker; deleting the marked artifact removes its downloadable build copy.
If a marked deployment fails after upload, delete that run's marked artifact as well.
The host may have caches: verify the normal URL and a cache-busted fetch, allow propagation,
and report any lingering copy rather than claiming immediate erasure.
