CREATE TABLE scene_records (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  scene TEXT NOT NULL,
  note TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX scene_records_owner ON scene_records (owner_id, created_at);
