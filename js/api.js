// public/js/api.js
async function saveRunSnapshot(projectName, inputs, results, tydexPath = null) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/run-snapshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ inputs, results, tydexPath })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    await logSnapshotSave(projectName, false);
    throw new Error('Failed to save snapshot: ' + t);
  }
  await logSnapshotSave(projectName, true);
  return res.json();
}

// Log snapshot save
async function logSnapshotSave(projectName, success = true) {
  try {
    await fetch('/api/activity-log', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        activity_type: 'Project',
        action: success ? 'Snapshot Saved' : 'Snapshot Save Failed',
        description: `${success ? 'Successfully saved' : 'Failed to save'} snapshot for project "${projectName}"`,
        status: success ? 'success' : 'failed',
        metadata: { project_name: projectName }
      })
    });
  } catch (e) { /* ignore */ }
}


async function getProject(projectName) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Project not found or not yours');
  return res.json(); // { success, project }
}

// Optional helper: read current project name from URL (?projectName=...) or localStorage
function currentProjectName() {
  const u = new URL(window.location.href);
  return (
    u.searchParams.get('projectName') ||
    localStorage.getItem('currentProjectName') ||
    sessionStorage.getItem('currentProject') || // legacy fallback (you already use this in
    ''
  );
}

// Prefill form fields from a saved project snapshot and lock UI if completed.
// fieldMap: { inputKeyFromSnapshot: ['#selector1', '#fallbackSelector2', ...], ... }
// opts.renderFn(tableArray) -> optional: re-render table from snapshot
// opts.disableSelectors: extra selectors to disable if project is Completed
// opts.onCompleted(project) -> optional: run when project is Completed
async function prefillProjectForm(fieldMap, opts = {}) {
  const pname = currentProjectName();
  if (!pname) return;

  try {
    const { project } = await getProject(pname);
    if (!project) return;

    const setVal = (selectors, val) => {
      if (!Array.isArray(selectors)) selectors = [selectors];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.value = val ?? ''; return true; }
      }
      return false;
    };

    // fill inputs
    const i = project.inputs || {};
    Object.entries(fieldMap).forEach(([key, selectors]) => {
      if (key in i) setVal(selectors, i[key]);
    });

    // render table if provided
    if (opts.renderFn && project.results?.table) {
      try { opts.renderFn(project.results.table); } catch (_e) {}
    }

    // lock UI if completed
    if (project.status === 'Completed') {
      const defaultToDisable = [
        ...document.querySelectorAll('input, select, textarea, button.run-button')
      ];
      const extra = (opts.disableSelectors || [])
        .map(sel => document.querySelector(sel))
        .filter(Boolean);

      [...defaultToDisable, ...extra].forEach(el => { el.disabled = true; });

      if (typeof opts.onCompleted === 'function') {
        opts.onCompleted(project);
      }
    }
  } catch (e) {
    console.error('Error pre-filling project form:', e);
  }
}
