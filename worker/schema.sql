-- Simpleman waitlist submissions
CREATE TABLE IF NOT EXISTS waitlist (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  based         TEXT,
  about         TEXT,
  people        TEXT,
  anything_else TEXT,
  email         TEXT    NOT NULL,
  country       TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS waitlist_created_at ON waitlist (created_at);
