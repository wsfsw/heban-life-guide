CREATE TABLE passkey_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE passkey_requests (
  challenge TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  account_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX passkey_requests_expiry ON passkey_requests (expires_at);
--> statement-breakpoint
CREATE INDEX passkey_requests_email ON passkey_requests (email);
--> statement-breakpoint
CREATE TABLE passkey_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES passkey_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX passkey_sessions_expiry ON passkey_sessions (expires_at);
