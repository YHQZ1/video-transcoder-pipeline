#!/usr/bin/env bash
# Task 6 (IaC): Terraform creates transcoder_output.env; Ansible ad-hoc verifies it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANSIBLE="${ANSIBLE:-$ROOT/.venv/bin/ansible}"
[ -x "$ANSIBLE" ] || ANSIBLE="$(command -v ansible)"

cd "$ROOT/terraform"
terraform init -input=false
terraform validate
terraform apply -auto-approve -input=false

F="$ROOT/terraform/transcoder_output.env"
cd "$ROOT/ansible"
echo; echo "=== ansible: file exists? ==="
"$ANSIBLE" localhost -c local -m stat -a "{\"path\": \"$F\"}"
echo; echo "=== ansible: file contents ==="
"$ANSIBLE" localhost -c local -m command -a "{\"argv\": [\"cat\", \"$F\"]}"
