const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../models/db');
const { auth, projectRole } = require('../middleware/auth');

const router = express.Router();

// List all projects for current user
router.get('/', auth, (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, pm.role as my_role, u.name as owner_name,
      (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_count
    FROM projects p
    JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    JOIN users u ON u.id = p.owner_id
    ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json({ projects });
});

// Create project
router.post('/', auth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  const id = uuid();
  db.prepare('INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)').run(id, name.trim(), description || '', req.user.id);
  db.prepare('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)').run(uuid(), id, req.user.id, 'admin');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json({ project });
});

// Get single project
router.get('/:projectId', auth, (req, res) => {
  const { projectId } = req.params;
  const membership = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Access denied' });

  const project = db.prepare(`
    SELECT p.*, u.name as owner_name
    FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?
  `).get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, pm.role, pm.joined_at
    FROM project_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ? ORDER BY pm.role, u.name
  `).all(projectId);

  res.json({ project, members, my_role: membership.role });
});

// Update project (admin only)
router.put('/:projectId', auth, projectRole('admin'), (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });
  db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(name.trim(), description || '', req.params.projectId);
  res.json({ success: true });
});

// Delete project (admin only)
router.delete('/:projectId', auth, projectRole('admin'), (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
  res.json({ success: true });
});

// Add member (admin only)
router.post('/:projectId/members', auth, projectRole('admin'), (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) return res.status(400).json({ error: 'Email and role are required' });
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Role must be admin or member' });

  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'User not found. They must sign up first.' });

  const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(req.params.projectId, user.id);
  if (existing) return res.status(409).json({ error: 'User is already a member' });

  db.prepare('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)').run(uuid(), req.params.projectId, user.id, role);
  res.status(201).json({ user, role });
});

// Update member role (admin only)
router.put('/:projectId/members/:userId', auth, projectRole('admin'), (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  db.prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?').run(role, req.params.projectId, req.params.userId);
  res.json({ success: true });
});

// Remove member (admin only)
router.delete('/:projectId/members/:userId', auth, projectRole('admin'), (req, res) => {
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' });
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.params.projectId, req.params.userId);
  res.json({ success: true });
});

module.exports = router;
