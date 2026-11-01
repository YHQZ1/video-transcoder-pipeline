#!/usr/bin/env node
// Collects live evidence for every task and writes dashboard/data.js.
// Read-only: runs git / docker / kubectl / terraform / ansible query commands and reads project files.
// A browser page cannot run these tools itself, so this tiny script feeds the static UI.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(ROOT, 'workspace', 'media-encoder');
const TF_DIR = path.join(ROOT, 'terraform');
const ENV_FILE = path.join(TF_DIR, 'transcoder_output.env');
const ANSIBLE = path.join(ROOT, '.venv', 'bin', 'ansible');
const J = 'http://127.0.0.1:8080';

const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(ROOT, p);

function sh(cmd, args = [], { cwd, timeout = 25000, env } = {}) {
  const r = spawnSync(cmd, args, { cwd, timeout, encoding: 'utf8', env: env || process.env });
  if (r.error) return [r.error.code === 'ENOENT' ? 127 : 124, r.error.code === 'ENOENT' ? `${cmd}: command not found` : `timed out: ${cmd}`];
  return [r.status, `${r.stdout || ''}${r.stderr || ''}`.trim()];
}
const check = (label, ok, detail = '') => ({ label, ok: !!ok, detail });
const statusOf = (c) => (!c.length ? 'pending' : c.every((x) => x.ok) ? 'pass' : 'fail');
const get = async (url, opts = {}) => {
  try { return await fetch(url, { signal: AbortSignal.timeout(5000), ...opts }); } catch { return null; }
};

// ---------------------------------------------------------------- Git
function collectGit() {
  const t = { id: 'git', n: 1, tool: 'Git', title: 'Release branching, merge and annotated tag' };
  if (!fs.existsSync(path.join(REPO, '.git'))) {
    return { ...t, status: 'fail', checks: [check('Repository `media-encoder` exists', false, 'run scripts/01-git.sh')], evidence: [] };
  }
  const g = (...a) => sh('git', a, { cwd: REPO });
  const branches = g('branch', '--format=%(refname:short)')[1].split(/\s+/).filter(Boolean);
  const conf = g('show', 'main:transcode.conf')[1].trim();
  const merged = g('merge-base', '--is-ancestor', 'release-v5.0', 'main')[0] === 0;
  const tagType = g('cat-file', '-t', 'v5.0.0-final')[1].trim();
  const tagMsg = g('tag', '-n', 'v5.0.0-final')[1];
  const graph = g('log', '--graph', '--oneline', '--all', '--decorate', '--color=never')[1];
  const mainLine = new Set(g('rev-list', '--first-parent', 'main')[1].split(/\s+/));
  const commits = g('log', '--all', '--topo-order', '--reverse', '--format=%H|%P|%s|%D')[1]
    .split('\n').filter(Boolean).map((line) => {
      const p = line.split('|');
      return { h: p[0].slice(0, 7), parents: p[1].split(' ').filter(Boolean).map((x) => x.slice(0, 7)),
        subject: p.slice(2, -1).join('|'), refs: p[p.length - 1], lane: mainLine.has(p[0]) ? 0 : 1 };
    });
  t.checks = [
    check('Repository `media-encoder` initialised', true, 'workspace/media-encoder'),
    check('Branch `release-v5.0` created', branches.includes('release-v5.0'), branches.join(', ')),
    check('`transcode.conf` holds MAX_BITRATE=4K on main', conf === 'MAX_BITRATE=4K', conf || 'missing'),
    check('`release-v5.0` merged into `main`', merged),
    check('Annotated tag `v5.0.0-final` applied', tagType === 'tag', tagMsg || 'no tag'),
  ];
  t.status = statusOf(t.checks);
  t.commits = commits;
  t.evidence = [{ label: 'git log --graph --oneline --all --decorate', text: graph },
    { label: 'git tag -n', text: tagMsg },
    { label: 'transcode.conf', text: conf }];
  return t;
}

// ---------------------------------------------------------------- Jira (manual)
function collectJira() {
  return { id: 'jira', n: 2, tool: 'Jira', title: 'Close sprint tickets, complete sprint, review burndown',
    status: 'manual', checks: [], evidence: [],
    manual: ['Move STREAM-401 to Done', 'Move STREAM-402 to Done', 'Complete the active sprint: Sprint-Video-Encoder',
      'Open Reports, Burndown Chart, and capture it'],
    tickets: ['STREAM-401', 'STREAM-402'] };
}

// ---------------------------------------------------------------- Jenkins
async function collectJenkins() {
  const t = { id: 'jenkins', n: 3, tool: 'Jenkins', title: 'Declarative pipeline: fetch, lint, build' };
  const jf = read(path.join(ROOT, 'jenkins', 'Jenkinsfile'));
  const stages = [...jf.matchAll(/stage\('([^']+)'\)/g)].map((m) => m[1]);
  const expected = ['Source Fetch', 'Media Linting', 'Build Transcoder'];
  t.stages = stages.map((name) => ({ name, state: 'notrun', ms: 0 }));
  t.builds = [];
  t.checks = [
    check('Jenkinsfile is a Declarative pipeline (`pipeline { agent any }`)', jf.includes('pipeline {') && jf.includes('agent any')),
    check(`Stages match the paper: ${expected.join(' > ')}`, JSON.stringify(stages) === JSON.stringify(expected), stages.join(' > ')),
  ];
  t.note = 'Jenkins was not queried (not running, or no password available).';
  let ran = false;

  let pw = process.env.JENKINS_ADMIN_PASSWORD;
  const envf = path.join(ROOT, 'jenkins', '.env');
  if (!pw && fs.existsSync(envf)) pw = (read(envf).match(/^JENKINS_ADMIN_PASSWORD=(.+)$/m) || [])[1]?.trim();
  if (pw) {
    const headers = { Authorization: `Basic ${Buffer.from(`admin:${pw}`).toString('base64')}` };
    const r = await get(`${J}/job/video-encoder-pipeline/lastBuild/wfapi/describe`, { headers });
    if (r && r.ok) {
      const d = await r.json();
      const map = { SUCCESS: 'pass', FAILED: 'fail', IN_PROGRESS: 'run', NOT_EXECUTED: 'notrun', ABORTED: 'fail', UNSTABLE: 'fail' };
      t.stages = (d.stages || []).filter((s) => !s.name.startsWith('Declarative')).map((s) => ({ name: s.name, state: map[s.status] || 'notrun', ms: s.durationMillis || 0 }));
      ran = true;
      t.note = `Latest build ${d.name} finished with status ${d.status}.`;
      t.checks.push(check('Pipeline build succeeded in Jenkins', d.status === 'SUCCESS', `build ${d.name}: ${d.status}`));
      const b = await get(`${J}/job/video-encoder-pipeline/api/json?tree=builds[number,result,timestamp,duration]{0,6}`, { headers });
      if (b && b.ok) t.builds = (await b.json()).builds || [];
    } else {
      t.note = 'Could not reach Jenkins at 127.0.0.1:8080. Start it, then regenerate the dashboard.';
    }
  }
  if (!ran) t.checks.push(check('Pipeline build run in Jenkins', false, 'not run yet'));
  t.status = ran ? statusOf(t.checks) : (t.checks.slice(0, 2).every((c) => c.ok) ? 'pending' : 'fail');
  t.evidence = [{ label: 'Jenkinsfile', text: jf }];
  return t;
}

// ---------------------------------------------------------------- Docker
async function collectDocker() {
  const t = { id: 'docker', n: 4, tool: 'Docker', title: 'Build video-encoder:1.0 from alpine, run on 8087:80' };
  const df = read(path.join(ROOT, 'docker', 'Dockerfile'));
  const [rc, insp] = sh('docker', ['inspect', 'video-encoder']);
  let c = null;
  try { c = rc === 0 ? JSON.parse(insp)[0] : null; } catch { c = null; }
  const imgOk = sh('docker', ['image', 'inspect', 'video-encoder:1.0'])[0] === 0;
  const size = imgOk ? Number(sh('docker', ['image', 'inspect', 'video-encoder:1.0', '--format', '{{.Size}}'])[1]) : 0;
  const logs = c ? sh('docker', ['logs', 'video-encoder'])[1] : '';
  const ps = sh('docker', ['ps', '--filter', 'name=video-encoder', '--format', 'table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}'])[1];
  const bind = c ? ((c.NetworkSettings.Ports || {})['80/tcp'] || [])[0] : null;
  const hostPort = bind ? bind.HostPort : null;
  let httpOk = false;
  const r = await get('http://localhost:8087/');
  if (r) { const body = await r.text(); httpOk = r.status === 200 && body.includes('Transcoder Engine Ready'); }
  const running = !!(c && c.State.Running);
  t.checks = [
    check('Dockerfile starts `FROM alpine`', /^FROM alpine/m.test(df)),
    check('Image `video-encoder:1.0` built', imgOk, size ? `${(size / 1048576).toFixed(1)} MB` : ''),
    check('Container running detached', running, c ? c.State.Status : 'no container'),
    check('Port mapping 8087 -> 80', hostPort === '8087', `host port ${hostPort}`),
    check('Prints "Transcoder Engine Ready"', logs.includes('Transcoder Engine Ready'), logs.split('\n')[0] || ''),
    check('HTTP 200 on http://localhost:8087', httpOk),
  ];
  t.status = statusOf(t.checks);
  t.container = { running, hostPort, id: c ? c.Id.slice(0, 12) : '', image: 'video-encoder:1.0', size };
  t.evidence = [{ label: 'docker ps', text: ps }, { label: 'docker logs video-encoder', text: logs }, { label: 'Dockerfile', text: df }];
  return t;
}

// ---------------------------------------------------------------- Kubernetes
function collectK8s() {
  const t = { id: 'k8s', n: 5, tool: 'Kubernetes', title: '2 replicas of nginx:alpine exposed on NodePort 30097' };
  const ctx = sh('kubectl', ['config', 'current-context'])[1].trim();
  const [drc, dep] = sh('kubectl', ['get', 'deploy', 'transcoder', '-o', 'json']);
  const [prc, pods] = sh('kubectl', ['get', 'pods', '-l', 'app=transcoder', '-o', 'json']);
  const [src, svc] = sh('kubectl', ['get', 'svc', 'transcoder-svc', '-o', 'json']);
  if (drc || prc || src) {
    return { ...t, status: 'fail', pods: [], checks: [check('Deployment and Service reachable via kubectl', false, (drc ? dep : svc).slice(0, 200))], evidence: [] };
  }
  const d = JSON.parse(dep), p = JSON.parse(pods), s = JSON.parse(svc);
  const img = d.spec.template.spec.containers[0].image;
  const labels = d.spec.template.metadata.labels;
  const plist = p.items.filter((x) => !x.metadata.deletionTimestamp).map((x) => ({
    name: x.metadata.name, phase: x.status.phase,
    ready: (x.status.containerStatuses || []).every((cs) => cs.ready) && (x.status.containerStatuses || []).length > 0,
    ip: x.status.podIP || '' }));
  const sp = s.spec.ports[0];
  let reach;
  if (ctx === 'transcoder') reach = sh('minikube', ['-p', 'transcoder', 'ssh', 'curl -sI http://localhost:30097 | head -1'], { timeout: 40000 })[1];
  else reach = (sh('curl', ['-sI', 'http://localhost:30097'])[1] || '').split('\n')[0];
  const getAll = sh('kubectl', ['get', 'pods,svc', '-l', 'app=transcoder', '-o', 'wide'])[1];
  t.checks = [
    check('Deployment has 2 replicas', d.spec.replicas === 2, `spec.replicas = ${d.spec.replicas}`),
    check('2 pods Running and Ready', plist.length === 2 && plist.every((x) => x.ready), `${plist.filter((x) => x.ready).length}/${plist.length} ready`),
    check('Image is nginx:alpine', img === 'nginx:alpine', img),
    check('Label `app=transcoder`', labels.app === 'transcoder', JSON.stringify(labels)),
    check('Service type NodePort', s.spec.type === 'NodePort', s.spec.type),
    check('NodePort is 30097', sp.nodePort === 30097, String(sp.nodePort)),
    check('Service answers HTTP 200 on 30097', reach.includes('200'), reach || 'no response'),
  ];
  t.status = statusOf(t.checks);
  t.pods = plist;
  t.service = { name: s.metadata.name, type: s.spec.type, port: sp.port, nodePort: sp.nodePort, clusterIp: s.spec.clusterIP };
  t.deployment = { name: d.metadata.name, replicas: d.spec.replicas, image: img };
  t.context = ctx;
  t.evidence = [{ label: 'kubectl get pods,svc -l app=transcoder -o wide', text: getAll },
    { label: 'k8s/deployment.yaml', text: read(path.join(ROOT, 'k8s/deployment.yaml')) },
    { label: 'k8s/service.yaml', text: read(path.join(ROOT, 'k8s/service.yaml')) }];
  return t;
}

// ---------------------------------------------------------------- Terraform + Ansible
function collectIac() {
  const t = { id: 'iac', n: 6, tool: 'Terraform + Ansible', title: 'Terraform creates transcoder_output.env, Ansible verifies it' };
  const exists = fs.existsSync(ENV_FILE);
  const content = exists ? read(ENV_FILE) : '';
  const env = content.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]);
  const state = sh('terraform', [`-chdir=${TF_DIR}`, 'state', 'list'])[1];
  let aOk = false, aOut = 'ansible not installed (create .venv, see README)';
  if (fs.existsSync(ANSIBLE)) {
    const [rc, out] = sh(ANSIBLE, ['localhost', '-c', 'local', '-m', 'command', '-a', JSON.stringify({ argv: ['cat', ENV_FILE] })],
      { cwd: path.join(ROOT, 'ansible'), env: { ...process.env, ANSIBLE_LOCALHOST_WARNING: 'False', ANSIBLE_INVENTORY_UNPARSED_WARNING: 'False' } });
    aOut = out; aOk = rc === 0 && out.includes('SERVICE=transcoder');
  }
  t.checks = [
    check('Terraform applied (state holds the local_file)', state.includes('local_file.transcoder_output'), state || 'empty state'),
    check('`transcoder_output.env` created', exists, rel(ENV_FILE)),
    check('Ansible ad-hoc module reads the file', aOk, "ansible localhost -m command -a 'cat ...'"),
  ];
  t.status = statusOf(t.checks);
  t.env = env;
  t.evidence = [{ label: "ansible localhost -c local -m command -a 'cat transcoder_output.env'", text: aOut },
    { label: 'terraform state list', text: state },
    { label: 'terraform/main.tf', text: read(path.join(TF_DIR, 'main.tf')) }];
  return t;
}

const tasks = [collectGit(), collectJira(), await collectJenkins(), await collectDocker(), collectK8s(), collectIac()];
const data = { generated: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }), tasks };
fs.writeFileSync(path.join(ROOT, 'dashboard', 'data.js'), `window.DASHBOARD = ${JSON.stringify(data, null, 1)};\n`);
console.log(`wrote ${rel(path.join(ROOT, 'dashboard', 'data.js'))}`);
for (const t of tasks) console.log(`  ${t.n}. ${t.tool.padEnd(20)} ${t.status}`);
