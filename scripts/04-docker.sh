#!/usr/bin/env bash
# Task 4 (Docker): build video-encoder:1.0 from alpine, run detached on 8087:80, verify.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

docker build -t video-encoder:1.0 "$ROOT/docker"
docker rm -f video-encoder >/dev/null 2>&1 || true
docker run -d --name video-encoder -p 8087:80 video-encoder:1.0

sleep 2
echo; echo "=== docker ps ==="
docker ps --filter name=video-encoder
echo; echo "=== container log (banner) ==="
docker logs video-encoder
echo; echo "=== HTTP check ==="
curl -s http://localhost:8087 | grep -o 'Transcoder Engine Ready'
