// /public/js/protocol-inputs.js
(function () {
  function getValByNameOrId(name) {
    const el = document.querySelector(`[name="${name}"]`) || document.getElementById(name);
    if (!el) return '';
    if (el.type === 'checkbox') return !!el.checked;
    if (el.type === 'number') return el.value === '' ? '' : Number(el.value);
    return el.value ?? '';
  }

  // Collects common fields used in parameters.inc AND also sweeps up other inputs on the page
  function collectFormValues() {
    // keys your server expects/uses in parameters.inc replacement
    const keys = [
      'load1_kg','load2_kg','load3_kg','load4_kg','load5_kg',
      'pressure1','pressure2','pressure3',
      'speed_kmph','IA','SA','SR',
      'width','diameter','Outer_diameter','nomwidth','aspratio'
    ];

    const out = {};
    keys.forEach(k => { out[k] = getValByNameOrId(k); });

    // Also capture any other inputs/selects/textareas present on the page
    // (handy if some protocol pages use different names)
    document.querySelectorAll('input, select, textarea').forEach(el => {
      const key = el.name || el.id;
      if (!key) return;
      if (out[key] !== undefined && out[key] !== '') return; // keep explicit value above
      if (el.type === 'checkbox') out[key] = !!el.checked;
      else out[key] = el.value ?? '';
    });

    return out;
  }

  async function saveProtocolInputs() {
    try {
      const id = sessionStorage.getItem('currentProjectId');
      if (!id) {
        console.warn('[protocol-inputs] No currentProjectId in sessionStorage; skipping save.');
        return;
      }
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('[protocol-inputs] No authToken; skipping save.');
        return;
      }

      const inputs = collectFormValues();

      const r = await fetch(`/api/projects/${encodeURIComponent(id)}/inputs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inputs })
      });

      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Save inputs failed: ${r.status} ${t}`);
      }

      console.log('[protocol-inputs] Saved inputs for project', id, inputs);
    } catch (e) {
      console.error('[protocol-inputs] Error:', e);
    }
  }

  // Expose for your page scripts to call
  window.collectFormValues = collectFormValues;
  window.saveProtocolInputs = saveProtocolInputs;
})();
