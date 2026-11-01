#!/usr/bin/env bash
# Task 1 (Git): init media-encoder, branch release-v5.0, commit transcode.conf,
# merge into main, tag v5.0.0-final.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$ROOT/workspace/media-encoder"

# Empty the folder but keep the directory itself (Jenkins bind-mounts it)
mkdir -p "$REPO"; find "$REPO" -mindepth 1 -delete; cd "$REPO"

git init -b main
git commit --allow-empty -m "chore: initial commit"        # main needs a base to merge into

git checkout -b release-v5.0
echo "MAX_BITRATE=4K" > transcode.conf
git add transcode.conf
git commit -m "feat: add transcode.conf with MAX_BITRATE=4K"

git checkout main
git merge --no-ff release-v5.0 -m "Merge branch 'release-v5.0' into main"
git tag -a v5.0.0-final -m "Release v5.0.0-final"

echo; echo "=== verification ==="
git log --oneline --graph --all --decorate
git tag -n
git show v5.0.0-final --stat | head -12
