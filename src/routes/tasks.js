const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../models/db');
const { auth, projectRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// Get tasks for a project
router.get('/', auth, (req, res) => {
  const { projectId } = req.params;
  const membership = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Access denied' });

  const tasks = db.prepare(`
    SELECT t.*, 
      u.name as assignee_name, u.email as assignee_email,
      c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN users c ON c.id = t.creator_id
    WHERE t.project_id = ?
    ORDER BY 
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `).all(projectId);
  res.json({ tasks });
});

// Create task
router.post('/', auth, (req, res) => {
  const { projectId } = req.params;
  const membership = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Access denied' });

  const { title, description, assignee_id, priority, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title is required' });

  if (assignee_id) {
    const assigneeMember = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, assignee_id);
    if (!assigneeMember) return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO tasks (id, title, description, project_id, assignee_id, creator_id, priority, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), description || '', projectId, assignee_id || null, req.user.id, priority || 'medium', due_date || null);

  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN users c ON c.id = t.creator_id
    WHERE t.id = ?
  `).get(id);
  res.status(201).json({ task });
});

// Update task
router.put('/:taskId', auth, (req, res) => {
  const { projectId, taskId } = req.params;
  const membership = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Access denied' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Members can only update tasks assigned to them or created by them (for status)
  const isAdmin = membership.role === 'admin';
  const isOwner = task.creator_id === req.user.id || task.assignee_id === req.user.id;
  if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Insufficient permissions' });

  const { title, description, assignee_id, status, priority, due_date } = req.body;

  if (!isAdmin && (title || description || assignee_id || priority || due_date)) {
    // Members can only update status
  }

  const updates = {};
  if (title !== undefined && isAdmin) updates.title = title.trim();
  if (description !== undefined && isAdmin) updates.description = description;
  if (assignee_id !== undefined && isAdmin) updates.assignee_id = assignee_id || null;
  if (priority !== undefined && isAdmin) updates.priority = priority;
  if (due_date !== undefined && isAdmin) updates.due_date = due_date || null;
  if (status !== undefined) updates.status = status;
  updates.updated_at = new Date().toISOString();

  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE tasks SET ${fields} WHERE id = ?`).run(...Object.values(updates), taskId);

  const updated = db.prepare(`
    SELECT t.*, u.name as assignee_name, c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN users c ON c.id = t.creator_id
    WHERE t.id = ?
  `).get(taskId);
  res.json({ task: updated });
});

// Delete task (admin or creator)
router.delete('/:taskId', auth, (req, res) => {
  const { projectId, taskId } = req.params;
  const membership = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Access denied' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (membership.role !== 'admin' && task.creator_id !== req.user.id)
    return res.status(403).json({ error: 'Only admins or task creators can delete tasks' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  res.json({ success: true });
});

module.exports = router;
