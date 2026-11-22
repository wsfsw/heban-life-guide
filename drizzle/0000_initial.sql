CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE photos (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY NOT NULL,
  issuer_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_by TEXT
);
--> statement-breakpoint
CREATE INDEX invites_issuer ON invites (issuer_id, expires_at);
--> statement-breakpoint
CREATE TABLE family_links (
  person_a TEXT NOT NULL,
  person_b TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (person_a, person_b)
);
--> statement-breakpoint
CREATE TABLE family_shares (
  id TEXT PRIMARY KEY NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  photo_id TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX shares_recipient ON family_shares (recipient_id, created_at);
--> statement-breakpoint
CREATE INDEX shares_sender ON family_shares (sender_id, created_at);
