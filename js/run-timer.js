// Full enhanced run-timer.js (replace existing file) — queue manager + persistence + UI badges

(function () {
  // Simple formatter
  function formatDurationSeconds(sec) {
    if (isNaN(sec) || sec < 0) return '00:00:00';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map(x => String(x).padStart(2, '0')).join(':');
  }

  async function findProjectId() {
    if (window.findProjectId) return window.findProjectId();
    const qs = new URLSearchParams(location.search);
    return qs.get('projectId') || sessionStorage.getItem('currentProjectId') || null;
  }

  function getVisibleProtocolKey() {
    const t = document.querySelector('.data-table:not([style*="display: none"])');
    if (!t) return null;
    return t.id.replace('Table', ''); // returns e.g. 'mf62'
  }

  // queue state
  let queue = [];
  let running = false;
  let paused = false;
  let abortRequested = false;
  let currentRun = null;

  // helpers to set badge state
  function setBadge(run, state, text) {
    const b = document.querySelector(`.queue-badge[data-run="${run}"]`);
    if (!b) return;
    b.style.display = 'inline-flex';
    b.className = 'queue-badge ' + state;
    b.textContent = text || (state === 'queued' ? 'Q' : state === 'running' ? '...' : state === 'done' ? 'OK' : state === 'failed' ? 'ERR' : 'SKP');
    updateLiveCounts(); // <-- add
  }
  function clearBadge(run) {
    const b = document.querySelector(`.queue-badge[data-run="${run}"]`);
    if (!b) return;
    b.style.display = 'none';
    b.className = 'queue-badge';
    b.textContent = '';
    updateLiveCounts(); // <-- add
  }

  // Add this helper near top-level functions in this file
  function updateLiveCounts() {
    const liveArea = document.querySelector('.live-area');
    const summaryEl = document.getElementById('live-summary');
    const countsEl = document.getElementById('live-counts');
    const overallBar = document.getElementById('overall-progress-bar');

    const runningCount = document.querySelectorAll('.queue-badge.running').length;
    const queuedCount  = document.querySelectorAll('.queue-badge.queued').length;
    const doneCount    = document.querySelectorAll('.queue-badge.done').length;
    const failedCount  = document.querySelectorAll('.queue-badge.failed').length;

    if (countsEl) countsEl.textContent = `Queued: ${queuedCount} • Running: ${runningCount} • Done: ${doneCount} • Failed: ${failedCount}`;
    if (summaryEl) summaryEl.textContent = runningCount ? `Running ${runningCount} test(s)` : (queuedCount ? `Queued ${queuedCount} test(s)` : (doneCount ? 'Idle — recent runs done' : 'Idle'));

    const total = queuedCount + runningCount + doneCount + failedCount;
    const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
    if (overallBar) overallBar.style.width = pct + '%';

    if (!liveArea) return;
    liveArea.classList.remove('state-idle','state-queued','state-running','state-done','state-failed');
    if (runningCount > 0) liveArea.classList.add('state-running');
    else if (queuedCount > 0) liveArea.classList.add('state-queued');
    else if (failedCount > 0) liveArea.classList.add('state-failed');
    else if (doneCount > 0) liveArea.classList.add('state-done');
    else liveArea.classList.add('state-idle');
  }

  // record to server (same as before)
  async function recordRunTimeToServer(payload) {
    try {
      const res = await fetch('/api/record-run-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.json();
    } catch (e) { console.warn('recordRunTimeToServer error', e); return null; }
  }

  // set duration UI (keeps classes)
  function setRowDurationDisplay(row, seconds, startISO, endISO, runningFlag = false, final = false) {
    if (!row) return;
    let d = row.querySelector('.run-duration');
    const statusCell = row.querySelector('.status-cell') || row.querySelector('td:last-child');
    if (!d) {
      if (!statusCell) return;
      d = document.createElement('div');
      d.className = 'run-duration';
      d.style.fontFamily = 'monospace';
      d.style.fontSize = '12px';
      d.style.marginTop = '6px';
      statusCell.appendChild(d);
    }
    d.textContent = formatDurationSeconds(seconds);
    d.classList.remove('running', 'finished', 'zero');
    if (runningFlag) d.classList.add('running');
    if (final) d.classList.add('finished');
    if (!final && seconds === 0) d.classList.add('zero');
    if (final && seconds === 0) d.classList.add('zero');
    row.dataset.runStart = startISO || row.dataset.runStart || '';
    row.dataset.runEnd = endISO || row.dataset.runEnd || '';
    row.dataset.runDuration = String(Math.round(seconds));
  }

  function updateTotalTimeUI() {
    const rows = Array.from(document.querySelectorAll('.data-table:not([style*="display: none"]) tbody tr'));
    let totalSec = 0;
    rows.forEach(r => {
      const v = Number(r.dataset.runDuration || 0);
      if (!isNaN(v)) totalSec += v;
    });
    const el = document.getElementById('total-time-value');
    const totalCard = document.getElementById('total-time');
    if (el) el.textContent = formatDurationSeconds(totalSec);
    if (totalCard) {
      totalCard.classList.remove('zero','positive','running','long');
      if (totalSec === 0) totalCard.classList.add('zero');
      else totalCard.classList.add('positive');
      if (totalSec >= 4 * 3600) totalCard.classList.add('long');
    }
  }

  // wait until a run finishes by monitoring status or run-duration.finished
  function waitForRunFinish(runNumber, timeoutMs = 20*60*1000) {
    return new Promise((resolve) => {
      const row = document.querySelector(`tr:has(button[data-run="${runNumber}"])`);
      if (!row) return resolve({ ok: false, reason: 'no-row' });

      // fast-pass: already finished
      const statusText = row.querySelector('.status-indicator')?.textContent || '';
      if (/completed/i.test(statusText) || row.querySelector('.run-duration')?.classList.contains('finished')) {
        return resolve({ ok: true });
      }

      const mo = new MutationObserver(() => {
        const st = row.querySelector('.status-indicator')?.textContent || '';
        if (/completed/i.test(st) || row.querySelector('.run-duration')?.classList.contains('finished')) {
          clearTimeout(t);
          mo.disconnect();
          return resolve({ ok: true });
        }
        // check badge turned failed
        const badge = row.querySelector('.queue-badge');
        if (badge && badge.classList.contains('failed')) {
          clearTimeout(t);
          mo.disconnect();
          return resolve({ ok: false, reason: 'failed' });
        }
      });
      mo.observe(row, { attributes: true, childList: true, subtree: true, characterData: true });

      // timeout fallback
      const t = setTimeout(() => {
        mo.disconnect();
        resolve({ ok: false, reason: 'timeout' });
      }, timeoutMs);
    });
  }

  // queue runner: sequential
  async function runQueue(runIds = [], opts = { delaySec: 0 }) {
    if (!Array.isArray(runIds) || runIds.length === 0) return;
    queue = Array.from(runIds);
    abortRequested = false;
    running = true;
    paused = false;

    document.getElementById('abortQueueBtn').style.display = 'inline-flex';
    const pauseBtn = document.getElementById('pauseResumeBtn');
    if (pauseBtn) { pauseBtn.style.display='inline-flex'; pauseBtn.dataset.paused = 'false'; pauseBtn.querySelector('span').textContent = 'Pause'; }

    // set queued badges
    queue.forEach(r => setBadge(r, 'queued', 'Q'));
    updateLiveCounts();
    updateETA();

    for (let i = 0; i < queue.length; i++) {
      if (abortRequested) break;
      while (paused && !abortRequested) { await new Promise(r=>setTimeout(r,400)); }
      if (abortRequested) break;

      const run = queue[i];
      currentRun = run;
      setBadge(run, 'running', '...');
      const row = document.querySelector(`tr:has(button[data-run="${run}"])`);
      // try to generate TYDEX first if a tydex button exists and is enabled
      try {
        const tydexBtn = row?.querySelector('.tydex-btn, .generate-tydex-btn');
        if (tydexBtn && !tydexBtn.disabled) {
          // click to generate tydex; allow a short wait for generation to start/complete
          tydexBtn.click();
          // Wait heuristically for generation (adjust ms as appropriate)
          await new Promise(r => setTimeout(r, 900));
        }
      } catch (e) { /* ignore */ }

      // trigger run button
      const btn = document.querySelector(`button.row-run-btn[data-run="${run}"]`);
      if (btn && !btn.disabled) {
        btn.click();
      } else {
        setBadge(run, 'failed', 'ERR');
        updateLiveCounts();
        continue;
      }

      // wait for finish (or failure)
      const finish = await waitForRunFinish(run);
      if (finish.ok) setBadge(run, 'done', 'OK'); else setBadge(run, 'failed', 'ERR');
      updateLiveCounts();
      updateETA();

      if (opts.delaySec) await new Promise(r => setTimeout(r, opts.delaySec * 1000));
    }

    running = false;
    currentRun = null;
    queue = [];
    abortRequested = false;
    const abortBtn = document.getElementById('abortQueueBtn');
    if (abortBtn) abortBtn.style.display = 'none';
    updateLiveCounts();
    updateETA();
  }

  // compute ETA (sum of historical durations or 0)
  function updateETA() {
    const selectedRows = queue.slice();
    let total = 0;
    selectedRows.forEach(r => {
      const row = document.querySelector(`tr:has(button[data-run="${r}"])`);
      if (!row) return;
      const v = Number(row.dataset.runDuration || 0);
      // if no previous duration, estimate 30s
      total += (v > 0 ? v : 30);
    });
    const el = document.getElementById('queue-eta');
    if (el) el.textContent = formatDurationSeconds(total);
  }

  // Pause / Resume / Abort handlers
  function togglePause() {
    paused = !paused;
    const btn = document.getElementById('pauseResumeBtn');
    if (btn) {
      btn.dataset.paused = String(paused);
      const span = btn.querySelector('span');
      if (span) span.textContent = paused ? 'Resume' : 'Pause';
      if (paused) { btn.classList.add('paused'); }
      else { btn.classList.remove('paused'); }
    }
  }
  function abortQueue() {
    abortRequested = true;
    // mark remaining queued as skipped
    queue.forEach(r => {
      if (String(currentRun) !== String(r)) setBadge(r, 'skipped', 'SKP');
    });
    queue = [];
  }

  // Run Selected / Run All wiring (DOM)
  function attachQueueControls() {
    document.getElementById('runAllBtn')?.addEventListener('click', async () => {
      // collect all runs in visible table in order
      const rows = Array.from(document.querySelectorAll('.data-table:not([style*="display: none"]) tbody tr'));
      const ids = rows.map(tr => tr.querySelector('.row-run-btn')?.dataset.run).filter(Boolean);
      await runQueue(ids, { delaySec: 1 });
    });

    document.getElementById('runSelectedBtn')?.addEventListener('click', async () => {
      const ids = Array.from(document.querySelectorAll('.select-row:checked'))
        .map(cb => cb.dataset.run)
        .filter(Boolean);
      if (ids.length === 0) return;
      // mark queued badges
      await runQueue(ids, { delaySec: 1 });
    });

    document.getElementById('pauseResumeBtn')?.addEventListener('click', () => {
      togglePause();
    });

    document.getElementById('abortQueueBtn')?.addEventListener('click', () => {
      if (!confirm('Abort remaining queued runs?')) return;
      abortQueue();
    });

    document.getElementById('retryFailedBtn')?.addEventListener('click', async () => {
      // find failed badges
      const failed = Array.from(document.querySelectorAll('.queue-badge.failed'))
        .map(b => b.dataset.run)
        .filter(Boolean);
      if (failed.length === 0) {
        alert('No failed runs in current view.');
        return;
      }
      // clear failed badges and re-run
      failed.forEach(r => clearBadge(r));
      await runQueue(failed, { delaySec: 1 });
    });

    // Stop All — terminate running simulations on server and mark UI
    document.getElementById('stopAllBtn')?.addEventListener('click', async () => {
      if (!confirm('Stop ALL running simulations now? This will terminate the processes on the server.')) return;
      try {
        // optimistic UI: mark running as "stopping"
        document.querySelectorAll('.queue-badge.running').forEach(b => {
          b.className = 'queue-badge stopping';
          b.textContent = 'STOP';
        });
        const resp = await fetch('/api/stop-all', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const json = await resp.json().catch(()=>({}));
        // After server responds, mark running ones as failed/stopped
        document.querySelectorAll('.queue-badge.stopping, .queue-badge.running').forEach(b => {
          const run = b.dataset.run;
          setBadge(run, 'failed', 'ERR');
        });
        // clear queue and update local state
        abortRequested = true;
        queue = [];
        running = false;
        paused = false;
        currentRun = null;
        const abortBtn = document.getElementById('abortQueueBtn'); if (abortBtn) abortBtn.style.display = 'none';
        updateLiveCounts();
        updateETA();
        console.log('stop-all result', json);
        alert('Stop request sent to server.');
      } catch (err) {
        console.warn('stop-all error', err);
        alert('Failed to send stop request to server.');
      }
    });

    // Mark-skip removed — no-op
  }
  // ...existing code...
  // attach listeners to per-row run buttons so queue badges and durations update when run finishes
  function attachRunListeners() {
    document.querySelectorAll('.row-run-btn').forEach(btn => {
      if (btn.dataset._runTimerAttached) return;
      btn.dataset._runTimerAttached = '1';

      btn.addEventListener('click', async (e) => {
        const run = btn.dataset.run;
        const row = btn.closest('tr');
        if (!run || !row) return;
        const projectId = await findProjectId();
        const projectName = sessionStorage.getItem('currentProject') || '';
        const protocolKey = getVisibleProtocolKey() || null;
        const start = new Date();
        row.dataset._timerStartMs = String(start.getTime());
        row.dataset.runStart = start.toISOString();

        // visual
        const status = row.querySelector('.status-indicator');
        if (status) {
          status.textContent = 'Running...';
          status.style.color = '#d97706';
        }
        setRowDurationDisplay(row, 0, start.toISOString(), '', true, false);
        setBadge(run, 'running', '...');

        // send start to server
        recordRunTimeToServer({
          projectId,
          projectName,
          protocol: protocolKey,
          runNumber: run,
          startTime: start.toISOString()
        });

        // poll for run completion (existing runSingleAnalysis workflow will update status)
        // fallback: watch for tydex button or status change
        const checkInterval = setInterval(async () => {
          try {
            const statusText = row.querySelector('.status-indicator')?.textContent || '';
            const tydexBtn = row.querySelector('.tydex-btn');
            const tydexVisible = tydexBtn && (tydexBtn.style.display === '' || tydexBtn.style.display === 'inline-block' || !tydexBtn.hasAttribute('style'));
            const completed = /completed/i.test(statusText);

            if (completed || tydexVisible) {
              clearInterval(checkInterval);
              const end = new Date();
              const durationSec = Math.round((end.getTime() - start.getTime()) / 1000);
              setRowDurationDisplay(row, durationSec, start.toISOString(), end.toISOString(), false, true);
              setBadge(run, 'done', 'OK');
              updateTotalTimeUI();

              // persist end & duration
              await recordRunTimeToServer({
                projectId,
                projectName,
                protocol: protocolKey,
                runNumber: run,
                endTime: end.toISOString(),
                durationSeconds: durationSec
              });
            }
          } catch (err) {
            clearInterval(checkInterval);
            console.warn('run-timer detection error', err);
          }
        }, 1000);
      });
    });
  }

  // Fetch stored durations and apply badges when page loads / table renders
  async function fetchAndApplySavedTimes() {
    const projectId = await findProjectId();
    let protocolKey = getVisibleProtocolKey();
    if ((!protocolKey || protocolKey === '') && projectId) {
      try {
        const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  }
});
        if (r.ok) {
          const j = await r.json();
          const protoName = j.project?.protocol || j.project?.protocol_name || '';
          // simple mapping
          if (/mf6/i.test(protoName)) protocolKey = 'mf62';
          if (/mf5/i.test(protoName)) protocolKey = 'mf52';
          if (/ftire/i.test(protoName)) protocolKey = 'ftire';
          if (/cdtire/i.test(protoName)) protocolKey = 'cdtire';
          if (/custom/i.test(protoName)) protocolKey = 'custom';
        }
      } catch (e) {}
    }
    if (!protocolKey) { updateTotalTimeUI(); return; }

    try {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      params.set('protocol', protocolKey || '');
      const res = await fetch('/api/get-run-times?' + params.toString(), {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  }
});
      if (!res.ok) return;
      const json = await res.json();
      if (!Array.isArray(json)) return;
      json.forEach(r => {
        const row = document.querySelector(`tr:has(button[data-run="${r.number_of_runs}"])`);
        if (!row) return;
        const seconds = Number(r.run_duration_seconds || 0);
        const startISO = r.run_start_time || '';
        const endISO = r.run_end_time || '';
        if (seconds > 0) {
          setRowDurationDisplay(row, seconds, startISO, endISO, false, true);
          setBadge(r.number_of_runs, 'done', 'OK');
        } else if (startISO && endISO) {
          const s = Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000);
          setRowDurationDisplay(row, s, startISO, endISO, false, true);
          setBadge(r.number_of_runs, 'done', 'OK');
        } else {
          setRowDurationDisplay(row, 0, startISO, endISO, false, false);
        }
      });
      updateTotalTimeUI();
    } catch (e) { console.warn('fetchAndApplySavedTimes error', e); }
  }

  // watch for table renders and attach listeners / fetch saved times
  function watchForTableRenders() {
    const container = document.getElementById('data-container') || document.body;
    let mutationTimer = null;
    const mo = new MutationObserver((mutations) => {
      if (mutationTimer) clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        attachRunListeners();
        fetchAndApplySavedTimes();
      }, 1000); // Only run once per second max
      });
      
mo.observe(container, { 
  childList: true, 
  subtree: false, // Don't watch nested changes
  attributes: false // Don't watch attribute changes
});
    mo.observe(container, { childList: true, subtree: true, attributes: true });
  }

  // Observe status-cell text changes and update badges/live counts when server-driven updates occur
  function observeStatusChanges() {
    const container = document.getElementById('data-container') || document.body;
    const mo = new MutationObserver(() => {
      // debounce small burst of mutations
      if (observeStatusChanges._timer) clearTimeout(observeStatusChanges._timer);
      observeStatusChanges._timer = setTimeout(() => {
        document.querySelectorAll('.data-table tbody tr').forEach(row => {
          const run = row.querySelector('button.row-run-btn')?.dataset.run;
          if (!run) return;
          const raw = (row.querySelector('.status-indicator')?.textContent || '').trim().toLowerCase();
          if (!raw) return;
          if (/processing|running|in progress|queued|starting/.test(raw)) {
            setBadge(run, 'running', '...');
          } else if (/completed|done|success|finished/.test(raw)) {
            setBadge(run, 'done', 'OK');
          } else if (/failed|error|aborted|timeout/.test(raw)) {
            setBadge(run, 'failed', 'ERR');
          } else if (/skip|skipped/.test(raw)) {
            setBadge(run, 'skipped', 'SKP');
          }
        });
        updateLiveCounts();
      }, 70);
    });
    mo.observe(container, { childList: true, subtree: true, characterData: true, attributes: true });
    // expose observer so it isn't GC'd (optional)
    observeStatusChanges._mo = mo;
  }

  // init
  document.addEventListener('DOMContentLoaded', () => {
    attachRunListeners();
    fetchAndApplySavedTimes();
    watchForTableRenders();
    attachQueueControls();
    observeStatusChanges(); // <-- start watching server-driven status changes
    setInterval(updateTotalTimeUI, 2000);
  });

})();

