const express = require('express');

module.exports = function registerInputRoutes(app, db) {
  console.log('[inputRoutes] registerInputRoutes called');

  const router = express.Router();

  function parseInputsField(row) {
    try {
      if (!row || row.inputs == null) return {};
      if (typeof row.inputs === 'object') return row.inputs;
      return JSON.parse(row.inputs);
    } catch (e) {
      console.warn('[inputRoutes] parseInputsField JSON parse error', e && e.message);
      return {};
    }
  }

  // GET recent projects that have non-empty inputs
  router.get('/project-inputs', async (req, res) => {
    console.log('[inputRoutes] GET /project-inputs q=', req.query);
    try {
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
      const q = `
        SELECT id, project_name, protocol, inputs, created_at
        FROM projects
        WHERE inputs IS NOT NULL AND inputs <> '{}'::jsonb
        ORDER BY created_at DESC
        LIMIT $1
      `;
      const { rows } = await db.query(q, [limit]);
      const mapped = rows.map(r => ({
        id: r.id,
        project_name: r.project_name,
        protocol: r.protocol,
        created_at: r.created_at,
        inputs: parseInputsField(r)
      }));
      return res.json(mapped);
    } catch (err) {
      console.error('[inputRoutes] GET /project-inputs error', err && err.stack || err);
      return res.status(500).json({ error: 'internal_server_error', message: err.message || String(err) });
    }
  });

  // GET single project's inputs
  router.get('/projects/:id/inputs', async (req, res) => {
    console.log('[inputRoutes] GET /projects/%s/inputs', req.params.id);
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: 'invalid id' });
      const q = 'SELECT id, project_name, protocol, inputs FROM projects WHERE id = $1 LIMIT 1';
      const { rows } = await db.query(q, [id]);
      if (!rows[0]) return res.status(404).json({ success: false, message: 'not found' });
      return res.json({ id: rows[0].id, project_name: rows[0].project_name, protocol: rows[0].protocol, inputs: parseInputsField(rows[0]) });
    } catch (err) {
      console.error('[inputRoutes] GET /projects/:id/inputs error', err && err.stack || err);
      return res.status(500).json({ success: false, message: 'server error' });
    }
  });

  // PUT update project inputs (upserts inputs JSONB)
  router.put('/projects/:id/inputs', async (req, res) => {
    console.log('[inputRoutes] PUT /projects/%s/inputs', req.params.id);
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: 'invalid id' });
      const inputs = req.body.inputs || {};
      // ensure JSONB storage; use parameterized query
      const q = `UPDATE projects SET inputs = $1 WHERE id = $2 RETURNING id, inputs`;
      const values = [inputs, id];
      const { rows } = await db.query(q, values);
      if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
      return res.json({ success: true, inputs: rows[0].inputs });
    } catch (err) {
      console.error('[inputRoutes] PUT /projects/:id/inputs error', err && err.stack || err);
      return res.status(500).json({ success: false, message: 'server error' });
    }
  });

  // mount router under /api
  app.use('/api', router);
  console.log('[inputRoutes] mounted /api router');
};