#!/usr/bin/env bash
# Reset to a clean slate for a fresh demo run.
# Jenkins is left running (it takes a while to start); pass --all to stop it too.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "[docker] removing container video-encoder"; docker rm -f video-encoder 2>/dev/null
echo "[k8s]    deleting deployment, service, configmap"
kubectl delete -f "$ROOT/k8s/" --ignore-not-found
kubectl delete configmap transcoder-site --ignore-not-found
echo "[tf]     terraform destroy"
(cd "$ROOT/terraform" && terraform destroy -auto-approve -input=false 2>&1 | tail -2)
rm -f "$ROOT/dashboard/data.js"
if [ "${1:-}" = "--all" ]; then
  echo "[jenkins] stopping"; docker compose -f "$ROOT/jenkins/docker-compose.yml" down
fi
true
