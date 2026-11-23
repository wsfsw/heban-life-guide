CREATE TABLE IF NOT EXISTS assistant_requests (
  id TEXT PRIMARY KEY NOT NULL,
  visitor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_requests_time ON assistant_requests (created_at);
CREATE INDEX IF NOT EXISTS assistant_requests_visitor ON assistant_requests (visitor, created_at);
