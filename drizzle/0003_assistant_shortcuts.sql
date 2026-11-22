CREATE TABLE assistant_requests (
  id TEXT PRIMARY KEY NOT NULL,
  visitor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX assistant_requests_time ON assistant_requests (created_at);
--> statement-breakpoint
CREATE INDEX assistant_requests_visitor ON assistant_requests (visitor, created_at);
--> statement-breakpoint
CREATE TABLE family_shortcuts (
  id TEXT PRIMARY KEY NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (sender_id, recipient_id, kind, target)
);
--> statement-breakpoint
CREATE INDEX family_shortcuts_recipient ON family_shortcuts (recipient_id, created_at);
