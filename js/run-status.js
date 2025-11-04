// minimal SSE client to update per-row progress and a top status bar
(function () {
  if (!window.EventSource) return;

  const es = new EventSource('/events');
  const summaryEl = document.getElementById('live-summary');
  const countsEl = document.getElementById('live-counts');
  const overallBar = document.getElementById('overall-progress-bar');
  const liveArea = document.querySelector('.live-area');

  const state = { queued: new Set(), running: new Set(), done: new Set(), failed: new Set() };

  function updateVisualState() {
    const q = state.queued.size, r = state.running.size, d = state.done.size, f = state.failed.size;
    if (countsEl) countsEl.textContent = `Queued: ${q} • Running: ${r} • Done: ${d} • Failed: ${f}`;
    const total = q + r + d + f;
    const pct = total === 0 ? 0 : Math.round((d / total) * 100);
    if (overallBar) overallBar.style.width = pct + '%';
    if (summaryEl) summaryEl.textContent = r ? `Running ${r} test(s)` : (q ? `Queued ${q} test(s)` : (d ? 'Idle — recent runs done' : 'Idle'));
    // set live-area class
    if (!liveArea) return;
    liveArea.classList.remove('state-idle','state-queued','state-running','state-done','state-failed');
    if (r > 0) liveArea.classList.add('state-running');
    else if (q > 0) liveArea.classList.add('state-queued');
    else if (f > 0) liveArea.classList.add('state-failed');
    else if (d > 0) liveArea.classList.add('state-done');
    else liveArea.classList.add('state-idle');
  }

  es.addEventListener('run-status', (ev) => {
    try {
      console.debug('SSE run-status:', ev.data);
      const p = JSON.parse(ev.data); // { run, folder, status, progress, message }
      const run = String(p.run);

      if (p.status === 'queued') { state.queued.add(run); state.running.delete(run); }
      if (p.status === 'running') { state.running.add(run); state.queued.delete(run); }
      if (p.status === 'done')    { state.done.add(run); state.running.delete(run); state.queued.delete(run); state.failed.delete(run); }
      if (p.status === 'failed')  { state.failed.add(run); state.running.delete(run); state.queued.delete(run); }

      // badge + per-row progress updates (keep existing behavior)
      const badge = document.querySelector(`.queue-badge[data-run="${run}"]`);
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.className = 'queue-badge ' + (p.status === 'running' ? 'running' : p.status === 'done' ? 'done' : p.status === 'failed' ? 'failed' : 'queued');
        if (p.status === 'running' && typeof p.progress === 'number') {
          badge.textContent = Math.min(99, Math.round(p.progress)) + '%';
        } else {
          badge.textContent = p.status === 'done' ? 'OK' : p.status === 'failed' ? 'ERR' : 'Q';
        }
      }

      // update per-row progress bar
      const row = document.querySelector(`tr:has(button[data-run="${run}"])`);
      if (row) {
        let pr = row.querySelector('.row-progress');
        if (!pr) {
          pr = document.createElement('div');
          pr.className = 'row-progress';
          pr.innerHTML = '<div class="row-progress-bar" style="width:0%"></div>';
          const statusCell = row.querySelector('.status-cell') || row.lastElementChild;
          if (statusCell) statusCell.appendChild(pr);
        }
        const bar = pr.querySelector('.row-progress-bar');
        const pct = typeof p.progress === 'number' ? Math.max(0, Math.min(100, Math.round(p.progress))) : (p.status === 'done' ? 100 : (p.status === 'failed' ? 100 : (p.status === 'running' ? 5 : 0)));
        if (bar) bar.style.width = pct + '%';
      }

      updateVisualState();
    } catch (e) {
      console.warn('run-status parse', e);
    }
  });

  es.addEventListener('ping', () => { /* keepalive */ });

  es.addEventListener('error', (ev) => {
    console.warn('SSE connection error', ev);
    if (summaryEl) summaryEl.textContent = 'Live updates disconnected';
    if (liveArea) {
      liveArea.classList.remove('state-running','state-queued');
      liveArea.classList.add('state-idle');
    }
  });
})();