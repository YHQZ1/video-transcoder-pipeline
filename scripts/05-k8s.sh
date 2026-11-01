#!/usr/bin/env bash
# Task 5 (K8s): 2 replicas nginx:alpine, label app=transcoder, NodePort 30097.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Page + nginx config come from one source of truth (docker/www/index.html, k8s/nginx-default.conf)
CM_OUT=$(kubectl create configmap transcoder-site \
  --from-file=index.html="$ROOT/docker/www/index.html" \
  --from-file=default.conf="$ROOT/k8s/nginx-default.conf" \
  --dry-run=client -o yaml | kubectl apply -f -)
echo "$CM_OUT"
kubectl apply -f "$ROOT/k8s/deployment.yaml" -f "$ROOT/k8s/service.yaml"
# ConfigMap content changed on an existing deployment -> restart pods to pick it up
echo "$CM_OUT" | grep -q configured && kubectl rollout restart deployment/transcoder
kubectl rollout status deployment/transcoder --timeout=120s

echo; echo "=== pods ==="
kubectl get pods -l app=transcoder -o wide
echo; echo "=== service ==="
kubectl get svc transcoder-svc
echo; echo "=== all -l app=transcoder ==="
kubectl get all -l app=transcoder
echo; echo "=== NodePort reachability ==="
if [ "$(kubectl config current-context)" = "transcoder" ]; then
  # minikube (docker driver, macOS): NodePort lives on the node, not the host
  minikube -p transcoder ssh "curl -sI http://localhost:30097 | head -1"
else
  curl -sI http://localhost:30097 | head -1   # Docker Desktop / bare-metal
fi
