#!/usr/bin/env bash
# Native jobs check out an exact SHA (detached HEAD), never an implicit push branch.
set -euo pipefail
: "${GITHUB_REF_NAME:?A source branch is required}"
: "${GITHUB_SHA:?The captured source SHA is required}"
git check-ref-format "refs/heads/$GITHUB_REF_NAME"
source_dir="${1:?Screenshot directory required}"
prefix="${2-}"
native_source="${3:?Native source directory required}"
shopt -s nullglob
shots=("$source_dir"/*.png)
if [[ ${#shots[@]} -eq 0 ]]; then echo 'No native screenshots to publish.'; exit 0; fi
for shot in "${shots[@]}"; do cp "$shot" "docs/media/$prefix$(basename "$shot")"; done
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add docs/media/*.png
if git diff --cached --quiet; then echo 'Native screenshots unchanged.'; exit 0; fi
git commit -m "Refresh ${prefix:-Android }native screenshots [skip ci]"
for attempt in 1 2 3 4; do
  git fetch --quiet origin "$GITHUB_REF_NAME"
  if ! git diff --quiet "$GITHUB_SHA" FETCH_HEAD -- "$native_source"; then
    echo '::notice::Native sources advanced; keep these captures in the run artifacts instead of publishing stale images.'
    exit 0
  fi
  if ! git rebase FETCH_HEAD; then
    git rebase --abort
    echo '::warning::Newer captures conflict; keeping this run in artifacts without replacing them.'
    exit 0
  fi
  if git push --quiet origin "HEAD:refs/heads/$GITHUB_REF_NAME"; then exit 0; fi
  sleep "$((attempt * 3))"
done
echo '::error::Could not publish native screenshots after four attempts.'
exit 1
