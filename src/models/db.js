// Windows-compatible SQLite setup
// Uses sqlite3 (pure JS prebuilds, no C++ compilation needed)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = process.env.DB_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const DB_PATH = path.join(dbDir, 'taskflow.db');

const rawDb = new sqlite3.Database(DB_PATH);

// Enable foreign keys
rawDb.run('PRAGMA foreign_keys = ON');

// Promisified helpers
function dbRun(sql, params = []) {
  return new Promise((res, rej) =>
    rawDb.run(sql, params, function (err) { err ? rej(err) : res(this); })
  );
}
function dbAll(sql, params = []) {
  return new Promise((res, rej) =>
    rawDb.all(sql, params, (err, rows) => err ? rej(err) : res(rows))
  );
}
function dbGet(sql, params = []) {
  return new Promise((res, rej) =>
    rawDb.get(sql, params, (err, row) => err ? rej(err) : res(row))
  );
}
function dbExec(sql) {
  return new Promise((res, rej) =>
    rawDb.exec(sql, (err) => err ? rej(err) : res())
  );
}

// Synchronous-style API using sync-rpc (via deasync) so all existing route code works unchanged
const deasync = require('deasync');

function syncify(asyncFn) {
  return (...args) => {
    let done = false, result, error;
    asyncFn(...args)
      .then(r => { result = r; done = true; })
      .catch(e => { error = e; done = true; });
    deasync.loopWhile(() => !done);
    if (error) throw error;
    return result;
  };
}

const syncRun = syncify(dbRun);
const syncAll = syncify(dbAll);
const syncGet = syncify(dbGet);
const syncExec = syncify(dbExec);

// Initialize schema
syncExec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','member')),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    project_id TEXT NOT NULL,
    assignee_id TEXT,
    creator_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','review','done')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
    due_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

console.log('DB ready at', DB_PATH);

// Export a better-sqlite3-compatible synchronous API
// so all routes work without any changes
module.exports = {
  prepare(sql) {
    return {
      run(...params) { return syncRun(sql, params.flat()); },
      get(...params) { return syncGet(sql, params.flat()); },
      all(...params) { return syncAll(sql, params.flat()); },
    };
  },
  exec(sql) { return syncExec(sql); },
};
