const express = require('express');
const db = require('../models/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().split('T')[0];

  const projectCount = db.prepare(
    'SELECT COUNT(*) as count FROM project_members WHERE user_id = ?'
  ).get(userId).count;

  const taskStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN due_date < ? AND status != 'done' THEN 1 ELSE 0 END) as overdue
    FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
  `).get(today, userId);

  const myTaskStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN due_date < ? AND status != 'done' THEN 1 ELSE 0 END) as overdue
    FROM tasks WHERE assignee_id = ?
  `).get(today, userId);

  const recentTasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date, t.updated_at,
      p.name as project_name, p.id as project_id,
      u.name as assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
    LEFT JOIN users u ON u.id = t.assignee_id
    ORDER BY t.updated_at DESC LIMIT 10
  `).all(userId);

  const overdueTasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date,
      p.name as project_name, p.id as project_id,
      u.name as assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.due_date < ? AND t.status != 'done'
    ORDER BY t.due_date ASC LIMIT 10
  `).all(userId, today);

  const myTasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date,
      p.name as project_name, p.id as project_id
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.assignee_id = ? AND t.status != 'done'
    ORDER BY 
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      t.due_date ASC NULLS LAST
    LIMIT 10
  `).all(userId);

  res.json({
    stats: {
      projects: projectCount,
      tasks: taskStats,
      my_tasks: myTaskStats
    },
    recent_tasks: recentTasks,
    overdue_tasks: overdueTasks,
    my_tasks: myTasks
  });
});

module.exports = router;
