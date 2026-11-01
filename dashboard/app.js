/* Renders window.DASHBOARD (written by collect.mjs). No frameworks, no network calls. */
(function () {
  const D = window.DASHBOARD;
  if (!D) {
    document.body.innerHTML = '<p style="padding:40px;font:16px sans-serif;color:#fff">data.js not found. Run <code>./scripts/dashboard.sh</code> first.</p>';
    return;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: ignore */ } },
  };
  const STATUS = {
    pass: { label: 'Verified', icon: 'check' },
    fail: { label: 'Needs attention', icon: 'x' },
    pending: { label: 'Not run yet', icon: 'clock' },
    manual: { label: 'Manual step', icon: 'hand' },
  };
  const TOOL_ICON = { git: 'git', jira: 'jira', jenkins: 'jenkins', docker: 'docker', k8s: 'k8s', iac: 'iac' };
  const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms');
  const fmtTime = (t) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  /* ---------- Jira (manual) state, kept in this browser ---------- */
  const JKEY = 'transcoder.jira';
  const jira = () => D.tasks.find((t) => t.id === 'jira');
  const jstate = () => { try { return JSON.parse(store.get(JKEY) || '{}'); } catch (e) { return {}; } };
  const jdone = () => { const s = jstate(); return jira().manual.every((_, i) => s['m' + i]); };
  const eff = (t) => (t.id === 'jira' ? (jdone() ? 'pass' : 'manual') : t.status);

  /* ---------- chrome: rail, stats, flow ---------- */
  function renderChrome() {
    $('brandMark').innerHTML = icon('layers', 18);
    $('gen').textContent = D.generated;

    $('nav').innerHTML = D.tasks.map((t) => {
      const s = eff(t);
      return `<a class="nav-i" href="#t-${t.id}">${icon(TOOL_ICON[t.id], 17)}<span class="lbl">${esc(t.tool)}</span><span class="st s-${s}">${icon(STATUS[s].icon, 15)}</span></a>`;
    }).join('');

    let pass = 0, cOk = 0, cAll = 0;
    D.tasks.forEach((t) => {
      if (eff(t) === 'pass') pass++;
      (t.checks || []).forEach((c) => { cAll++; if (c.ok) cOk++; });
    });
    const jt = D.tasks.find((t) => t.id === 'jenkins');
    const lastB = (jt.builds || [])[0];
    $('stats').innerHTML =
      stat('Stages verified', `${pass}<small>/ ${D.tasks.length}</small>`, 'Jira is confirmed manually') +
      stat('Automated checks passed', `${cOk}<small>/ ${cAll}</small>`, 'Across git, docker, k8s, iac, jenkins') +
      stat('Service endpoints', `2<small>live</small>`, 'Docker :8087, Kubernetes NodePort :30097') +
      stat('Latest Jenkins build', lastB ? `#${lastB.number}` : 'None', lastB ? `${lastB.result || 'running'} at ${fmtTime(lastB.timestamp)}` : 'Pipeline has not run');

    $('flow').innerHTML = D.tasks.map((t) => {
      const s = eff(t);
      return `<a class="node ${s}" href="#t-${t.id}"><span class="box">${icon(TOOL_ICON[t.id], 20)}</span>` +
        `<span class="t">${t.n}. ${esc(t.tool)}<small class="s-${s}">${STATUS[s].label}</small></span></a>`;
    }).join('');
  }
  const stat = (k, v, s) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;

  /* ---------- diagrams ---------- */
  const nd = (ic, title, sub, cls = '') => `<div class="nd ${cls}">${icon(ic, 18, 'lead')}<div><div class="nt">${title}</div><div class="ns">${sub}</div></div></div>`;
  const arrow = () => '';
  const vstack = (items) => `<div class="stack">${items.join(`<div class="vlink">${icon('arrowDown', 16)}</div>`)}</div>`;

  function gitViz(t) {
    const c = t.commits || [];
    if (!c.length) return '';
    const X0 = 80, DX = 150, Y = [96, 170];
    const idx = {}; c.forEach((k, i) => { idx[k.h] = i; });
    const W = X0 * 2 + DX * (c.length - 1), pos = (k) => [X0 + DX * idx[k.h], Y[k.lane]];
    let svg = `<svg style="width:100%;min-width:${Math.min(W, 420)}px;height:auto;display:block" viewBox="0 0 ${W} 240" role="img" aria-label="Commit graph">`;
    c.forEach((k) => k.parents.forEach((p) => {
      if (!(p in idx)) return;
      const [x1, y1] = pos(c[idx[p]]), [x2, y2] = pos(k);
      svg += y1 === y2
        ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6b6f78" stroke-width="2"/>`
        : `<path d="M${x1},${y1} C${x1 + 60},${y1} ${x2 - 60},${y2} ${x2},${y2}" fill="none" stroke="#6b6f78" stroke-width="2"/>`;
    }));
    c.forEach((k) => {
      const [x, y] = pos(k), merge = k.parents.length > 1;
      svg += `<circle cx="${x}" cy="${y}" r="9" fill="${merge ? '#f4f5f7' : '#1c1d20'}" stroke="${k.lane ? '#e6b84a' : '#5fcf8d'}" stroke-width="3"/>`;
      svg += `<text class="mono" x="${x}" y="${y + 30}" text-anchor="middle" font-size="11" fill="#a3a6ae">${esc(k.h)}</text>`;
      const sub = k.subject.length > 22 ? k.subject.slice(0, 21) + '...' : k.subject;
      svg += `<text x="${x}" y="${y + 46}" text-anchor="middle" font-size="11.5" fill="#f4f5f7">${esc(sub)}</text>`;
      (k.refs || '').split(',').map((s) => s.trim().replace('HEAD -> ', '')).filter(Boolean).forEach((r, i) => {
        const isTag = r.startsWith('tag: '), label = r.replace('tag: ', ''), w = label.length * 6.8 + 16, ry = y - 34 - i * 26;
        svg += `<rect x="${x - w / 2}" y="${ry - 14}" width="${w}" height="20" rx="4" fill="none" stroke="${isTag ? '#e6b84a' : '#7e8697'}"/>`;
        svg += `<text class="mono" x="${x}" y="${ry}" text-anchor="middle" font-size="11" fill="${isTag ? '#e6b84a' : '#c3c7d1'}">${esc(label)}</text>`;
      });
    });
    return `<div class="graph">${svg}</svg></div><p class="note">Green is <b>main</b>, amber is <b>release-v5.0</b>. The white node is the merge commit that carries the tag.</p>`;
  }

  function jenkinsViz(t) {
    const m = { pass: ['ok', 'check', 'passed'], fail: ['bad', 'x', 'failed'], run: ['run', 'clock', 'running'], notrun: ['off', 'clock', 'not run yet'] };
    const stages = vstack(t.stages.map((s) => {
      const [cls, ic, lbl] = m[s.state];
      return nd(ic, esc(s.name), lbl + (s.ms ? ' / ' + fmtMs(s.ms) : ''), cls);
    }));
    let hist = '';
    if ((t.builds || []).length) {
      hist = `<table><thead><tr><th>Build</th><th>Result</th><th>Started</th><th>Duration</th></tr></thead><tbody>` +
        t.builds.map((b) => `<tr><td class="k">#${b.number}</td><td class="${b.result === 'SUCCESS' ? 's-pass' : 's-fail'}">${esc(b.result || 'RUNNING')}</td><td class="m">${fmtTime(b.timestamp)}</td><td class="m">${fmtMs(b.duration)}</td></tr>`).join('') +
        `</tbody></table>`;
    }
    return `${stages}${hist}<p class="note">${esc(t.note)} Open <a href="http://127.0.0.1:8080/job/video-encoder-pipeline/" target="_blank" rel="noopener">Jenkins</a>.</p>`;
  }

  function dockerViz(t) {
    const c = t.container || {};
    return vstack([nd('globe', 'Browser', `localhost:${esc(c.hostPort || '8087')}`),
      nd('docker', 'video-encoder', `container ${esc(c.id)} / port 80`, c.running ? 'ok' : 'bad'),
      nd('layers', esc(c.image), 'built FROM alpine')]) +
      `<table><tbody><tr><td class="k">publish</td><td class="m">-p 8087:80 (host:container)</td></tr><tr><td class="k">mode</td><td class="m">detached (-d)</td></tr>` +
      `<tr><td class="k">image size</td><td class="m">${c.size ? (c.size / 1048576).toFixed(1) + ' MB' : 'n/a'}</td></tr></tbody></table>` +
      `<p class="note"><a href="http://localhost:8087" target="_blank" rel="noopener">Open the live service</a></p>`;
  }

  function k8sViz(t) {
    if (!t.pods) return '';
    const s = t.service, d = t.deployment;
    const pods = t.pods.map((p) => nd('server', 'Pod', `${esc(p.name)}<br>${esc(p.ip)} / ${p.ready ? 'Ready' : 'Not ready'}`, p.ready ? 'ok' : 'bad')).join('');
    return `<div class="stack">${nd('globe', 'Client', `node port ${esc(s.nodePort)}`)}<div class="vlink">${icon('arrowDown', 16)}</div>` +
      `${nd('k8s', `Service ${esc(s.name)}`, `${esc(s.type)} / port ${esc(s.port)} / ${esc(s.clusterIp)}`, 'ok')}<div class="vlink">${icon('arrowDown', 16)}</div>` +
      `${nd('layers', `Deployment ${esc(d.name)}`, `replicas ${esc(d.replicas)} / ${esc(d.image)} / app=transcoder`)}<div class="vlink">${icon('arrowDown', 16)}</div>` +
      `<div class="pods">${pods}</div></div>` +
      `<p class="note">Cluster context: <b>${esc(t.context)}</b>. From your Mac with minikube: <code>minikube service transcoder-svc -p transcoder --url</code></p>`;
  }

  function iacViz(t) {
    const ok = t.checks[2].ok;
    const rows = (t.env || []).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="m">${esc(v)}</td></tr>`).join('');
    return vstack([nd('file', 'main.tf', 'local_file resource'), nd('iac', 'terraform apply', '-auto-approve'),
      nd('file', 'transcoder_output.env', 'created', t.checks[1].ok ? 'ok' : 'bad'),
      nd('terminal', 'Ansible ad-hoc', ok ? 'verified' : 'not verified', ok ? 'ok' : 'bad')]) +
      (rows ? `<table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>` : '');
  }

  /* ---------- evidence tabs ---------- */
  function evidence(t) {
    if (!(t.evidence || []).length) return '<p class="note">No evidence collected.</p>';
    const tabs = t.evidence.map((e, i) => `<button class="tab" role="tab" data-t="${t.id}" data-i="${i}" aria-selected="${i === 0}">${esc(e.label.length > 28 ? e.label.slice(0, 26) + '...' : e.label)}</button>`).join('');
    return `<div class="tabs" role="tablist">${tabs}</div><div class="term"><div class="term-h">${icon('terminal', 14)}<span id="tl-${t.id}">${esc(t.evidence[0].label)}</span></div><pre id="tp-${t.id}">${esc(t.evidence[0].text) || '(no output)'}</pre></div>`;
  }

  /* ---------- tasks ---------- */
  function jiraCols(t) {
    const s = jstate();
    const items = t.manual.map((m, i) => `<label class="tick"><input type="checkbox" data-k="m${i}" ${s['m' + i] ? 'checked' : ''}><span>${esc(m)}</span></label>`).join('');
    const tickets = t.tickets.map((x, i) => nd('jira', esc(x), s['m' + i] ? 'Done' : 'To do / in progress', s['m' + i] ? 'ok' : '')).join('');
    return `<div class="col"><div class="col-h">${icon('list', 14)}Checklist</div>${items}</div>` +
      `<div class="col"><div class="col-h">${icon('jira', 14)}Sprint-Video-Encoder</div><div class="nodes" id="jtickets">${tickets}</div>` +
      `<p class="note">Jira is a web app, so this stage is confirmed by hand. Ticks and the screenshot stay in this browser only.</p></div>` +
      `<div class="col"><div class="col-h">${icon('upload', 14)}Burndown chart</div><label class="upload"><input type="file" id="shotIn" accept="image/*" aria-label="Upload burndown screenshot"></label><img id="shot" alt="Burndown chart screenshot"></div>`;
  }

  function renderTasks() {
    $('tasks').innerHTML = D.tasks.map((t) => {
      const s = eff(t);
      let cols;
      if (t.id === 'jira') cols = jiraCols(t);
      else {
        const viz = ({ git: gitViz, jenkins: jenkinsViz, docker: dockerViz, k8s: k8sViz, iac: iacViz })[t.id](t);
        const checks = `<ul class="checks">${t.checks.map((c) => `<li><span class="${c.ok ? 's-pass' : 's-fail'}">${icon(c.ok ? 'check' : 'x', 17)}</span><span>${md(c.label)}${c.detail ? `<span class="d">${esc(c.detail)}</span>` : ''}</span></li>`).join('')}</ul>`;
        cols = `<div class="col"><div class="col-h">${icon('check', 14)}Requirements</div>${checks}</div>` +
          `<div class="col"><div class="col-h">${icon('eye', 14)}Overview</div>${viz}</div>` +
          `<div class="col"><div class="col-h">${icon('terminal', 14)}Evidence</div>${evidence(t)}</div>`;
      }
      return `<section class="task" id="t-${t.id}"><div class="task-h"><div class="th-l"><span class="th-ico">${icon(TOOL_ICON[t.id], 20)}</span>` +
        `<div><div class="th-t"><span class="th-idx">0${t.n}</span>&nbsp; ${esc(t.tool)}</div><div class="th-sub">${esc(t.title)}</div></div></div>` +
        `<div class="th-r"><span class="status s-${s}" id="st-${t.id}">${icon(STATUS[s].icon, 17)}${STATUS[s].label}</span></div></div>` +
        `<div class="body">${cols}</div></section>`;
    }).join('');

    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      const t = D.tasks.find((x) => x.id === b.dataset.t), e = t.evidence[b.dataset.i];
      document.querySelectorAll(`.tab[data-t="${t.id}"]`).forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
      $('tl-' + t.id).textContent = e.label;
      $('tp-' + t.id).textContent = e.text || '(no output)';
    }));
    wireJira();
  }

  function wireJira() {
    document.querySelectorAll('#t-jira input[type=checkbox]').forEach((cb) => cb.addEventListener('change', () => {
      const s = jstate(); s[cb.dataset.k] = cb.checked; store.set(JKEY, JSON.stringify(s));
      renderChrome();
      const st = eff(jira());
      $('st-jira').className = 'status s-' + st;
      $('st-jira').innerHTML = icon(STATUS[st].icon, 17) + STATUS[st].label;
      $('jtickets').innerHTML = jira().tickets.map((x, i) => nd('jira', esc(x), s['m' + i] ? 'Done' : 'To do / in progress', s['m' + i] ? 'ok' : '')).join('');
    }));
    const img = $('shot'), inp = $('shotIn'), saved = store.get('transcoder.shot');
    if (saved) { img.src = saved; img.style.display = 'block'; }
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { img.src = r.result; img.style.display = 'block'; if (r.result.length < 3e6) store.set('transcoder.shot', r.result); };
      r.readAsDataURL(f);
    });
  }

  renderChrome();
  renderTasks();
})();
