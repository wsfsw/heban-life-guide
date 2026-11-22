import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function localStorageBindings(folder) {
  if (folder) await mkdir(folder, { recursive: true });
  const sql = new DatabaseSync(folder ? join(folder, 'heban.sqlite') : ':memory:');
  sql.exec('PRAGMA foreign_keys = ON;');
  for (const [table, migration] of Object.entries({
    profiles: '0000_initial', scene_records: '0001_scene_records', passkey_accounts: '0002_passkeys',
    assistant_requests: '0003_assistant_shortcuts',
  })) {
    if (!sql.prepare("select 1 from sqlite_master where type='table' and name=?").get(table)) {
      sql.exec(await readFile(new URL(`../drizzle/${migration}.sql`, import.meta.url), 'utf8'));
    }
  }
  const prepare = (statement) => {
    const query = sql.prepare(statement);
    return { bind: (...values) => ({
      first: async () => query.get(...values) ?? null,
      all: async () => ({ results: query.all(...values) }),
      run: async () => ({ meta: query.run(...values) }),
      exec: () => ({ meta: query.run(...values) }),
    }) };
  };
  const files = new Map();
  return {
    DB: {
      prepare,
      async batch(items) {
        sql.exec('BEGIN IMMEDIATE');
        try {
          const results = items.map((item) => item.exec());
          sql.exec('COMMIT');
          return results;
        } catch (error) { sql.exec('ROLLBACK'); throw error; }
      },
    },
    BUCKET: {
      async put(key, value) {
        if (folder) await writeFile(join(folder, key), value);
        else files.set(key, value);
      },
      async get(key) {
        try {
          const value = folder ? await readFile(join(folder, key)) : files.get(key);
          return value ? { body: value } : null;
        } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      },
      async delete(key) {
        if (!folder) { files.delete(key); return; }
        try { await unlink(join(folder, key)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      },
    },
    close: () => sql.close(),
  };
}
