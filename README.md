# Video Transcoding Pipeline

DevOps Lab (TE7950) ESE, Section B. An end-to-end delivery pipeline for an OTT
transcoding microservice: **Git -> Jenkins -> Docker -> Kubernetes -> Terraform/Ansible**.

```
 media-encoder repo         Jenkins pipeline            Docker               Kubernetes
 release-v5.0 -> main  ->  Source Fetch -> Lint  ->  video-encoder:1.0  ->  2x nginx:alpine
 tag v5.0.0-final          -> Build Transcoder       -p 8087:80             NodePort 30097

                 Terraform -> transcoder_output.env  --verified by-->  Ansible ad-hoc
```

## See it: dashboard + live service

```bash
./scripts/dashboard.sh      # collects live evidence from git/docker/kubectl/terraform/ansible and opens dashboard/index.html
```

The dashboard is plain HTML/CSS/JS (`dashboard/index.html`, `style.css`, `app.js`, `icons.js`). A small Node script, `collect.mjs`, runs the read-only checks and writes `data.js`. No server needed. It shows: pipeline strip, per-task requirement checklists with
real pass/fail, Git commit graph, Jenkins stages, Docker port mapping, K8s pods and Service, Terraform file + Ansible
check, and a Jira checklist with screenshot upload.
Use your browser's print dialog to export a PDF. Re-run the script after any change. Requires Node 18+.
Add `JENKINS_ADMIN_PASSWORD=...` before the command to pull the latest Jenkins build result into it.

The service itself has a page too: http://localhost:8087 (Docker) and, on Kubernetes, the NodePort 30097
(`minikube service transcoder-svc -p transcoder --url`). Refresh the K8s one to see which of the 2 pods answered.

## Layout

| Path                              | Task                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/01-git.sh`               | 1. Git: init `media-encoder`, branch `release-v5.0`, commit `transcode.conf` (`MAX_BITRATE=4K`), merge to `main`, tag `v5.0.0-final` |
| _(Jira, manual)_                  | 2. Jira: see below                                                                                                                   |
| `jenkins/Jenkinsfile`             | 3. Declarative pipeline: `Source Fetch`, `Media Linting`, `Build Transcoder`                                                         |
| `docker/`, `scripts/04-docker.sh` | 4. Build `video-encoder:1.0` from alpine, prints `Transcoder Engine Ready`, run `-p 8087:80`                                         |
| `k8s/`, `scripts/05-k8s.sh`       | 5. 2 replicas `nginx:alpine`, label `app=transcoder`, NodePort 30097                                                                 |
| `terraform/`, `scripts/06-iac.sh` | 6. Terraform creates `transcoder_output.env`; Ansible ad-hoc verifies                                                                |
| `dashboard/` | Evidence dashboard: `index.html`, `style.css`, `app.js`, `icons.js` + `collect.mjs` (data collector) |
| `docs/`                           | MCQ answers (Section A), viva prep (Section C)                                                                                       |

## Prerequisites

git, Docker, kubectl + a cluster (Docker Desktop Kubernetes **or** minikube), Terraform >= 1.3,
Ansible (`python3 -m venv .venv && .venv/bin/pip install ansible-core`; scripts use `.venv` if present).

## Run

```bash
./scripts/01-git.sh
./scripts/04-docker.sh
minikube start -p transcoder --driver=docker     # skip if Docker Desktop Kubernetes is on
./scripts/05-k8s.sh
./scripts/06-iac.sh
./scripts/cleanup.sh                        # tear everything down
```

### Verification commands (what to show the examiner)

```bash
git log --oneline --graph --all --decorate && git tag -n   # in workspace/media-encoder
docker ps
kubectl get pods -l app=transcoder && kubectl get svc transcoder-svc
ansible localhost -c local -m command -a "cat terraform/transcoder_output.env"
```

## Jira (Task 2, manual, 1 mark)

1. Board -> Active sprint -> drag `STREAM-401` and `STREAM-402` to **Done**.
2. **Complete sprint** (`Sprint-Video-Encoder`).
3. Reports -> **Burndown Chart**; screenshot it.

## Jenkins (Task 3)

`jenkins/` has a Jenkins image (docker CLI + pipeline plugins) with the pipeline pre-seeded.
It needs the Docker socket and requires an admin password:

```bash
cd jenkins
printf 'JENKINS_ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)" > .env   # git-ignored
docker compose up -d --build          # http://127.0.0.1:8080, login: admin / password in jenkins/.env
```

Alternatively paste `jenkins/Jenkinsfile` into any Pipeline job on your lab Jenkins.

## Status

| Task                | Status                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Git                 | Run and verified                                                                          |
| Docker              | Run and verified (container on 8087, banner in logs, HTTP 200)                            |
| K8s                 | Run and verified (2/2 pods, NodePort 30097 returns 200 from the node)                     |
| Terraform + Ansible | Run and verified                                                                          |
| Jenkins             | Pipeline written; stage shell steps simulated locally; **server not started** (see above) |
| Jira                | Manual                                                                                    |
