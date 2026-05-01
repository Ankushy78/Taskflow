# TaskFlow — Project Management App

A full-stack project & task management application with role-based access control.

## Features

- **Authentication** — JWT-based signup/login, session persistence
- **Projects** — Create, edit, delete projects; invite team members
- **Role-Based Access Control** — Admin (full control) vs Member (view + status updates)
- **Tasks** — Create, assign, prioritize, track with Kanban board (Todo → In Progress → Review → Done)
- **Dashboard** — Live stats: projects, tasks, completions, overdue alerts
- **REST API** — Full CRUD with proper validations and relational integrity

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite via better-sqlite3 (zero-config, file-based)
- **Auth**: JWT + bcrypt
- **Frontend**: Vanilla JS SPA (single HTML file, no build step)

## Local Development

```bash
npm install
npm run dev     # nodemon auto-restart
# Open http://localhost:3000
```

## Deploy to Railway

### Option 1: GitHub (Recommended)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select your repo → Railway auto-detects Node.js
4. Set environment variables (optional):
   - `JWT_SECRET` — a long random string (e.g. `openssl rand -hex 32`)
   - `DB_DIR` — defaults to `./data` (Railway ephemeral storage)
5. Railway assigns a public URL — your app is live!

> **Tip for persistent DB**: In Railway dashboard, add a Volume mounted at `/data` and set `DB_DIR=/data`

### Option 2: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway open
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (Railway sets this automatically) |
| `JWT_SECRET` | `taskflow_secret_...` | Change in production! |
| `DB_DIR` | `./data` | Directory for SQLite database file |

## API Reference

### Auth
- `POST /api/auth/signup` — `{ name, email, password }`
- `POST /api/auth/login` — `{ email, password }`
- `GET /api/auth/me` — Get current user (requires token)

### Projects
- `GET /api/projects` — List user's projects
- `POST /api/projects` — Create project
- `GET /api/projects/:id` — Get project details + members
- `PUT /api/projects/:id` — Update (admin only)
- `DELETE /api/projects/:id` — Delete (admin only)

### Members
- `POST /api/projects/:id/members` — Invite by email (admin only)
- `PUT /api/projects/:id/members/:userId` — Change role (admin only)
- `DELETE /api/projects/:id/members/:userId` — Remove (admin only)

### Tasks
- `GET /api/projects/:id/tasks` — List tasks
- `POST /api/projects/:id/tasks` — Create task
- `PUT /api/projects/:id/tasks/:taskId` — Update task
- `DELETE /api/projects/:id/tasks/:taskId` — Delete task

### Dashboard
- `GET /api/dashboard` — Stats, recent tasks, overdue, my tasks

## Role Permissions

| Action | Admin | Member |
|--------|-------|--------|
| View project & tasks | ✅ | ✅ |
| Update task status | ✅ | ✅ (assigned/created) |
| Create tasks | ✅ | ✅ |
| Edit/delete tasks | ✅ | Own tasks only |
| Manage members | ✅ | ❌ |
| Edit project | ✅ | ❌ |
| Delete project | ✅ | ❌ |
