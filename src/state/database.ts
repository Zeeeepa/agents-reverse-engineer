/**
 * SQLite state database with prepared statements
 */
import Database from 'better-sqlite3';
import type { FileRecord, RunRecord, StateDatabase } from './types.js';
import { CURRENT_SCHEMA_VERSION, migrateSchema } from './migrations.js';

/**
 * Opens the state database, applying migrations if needed.
 * Uses WAL mode for performance.
 *
 * @param dbPath - Path to the SQLite database file
 */
export function openDatabase(dbPath: string): StateDatabase {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Check and apply migrations
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < CURRENT_SCHEMA_VERSION) {
    migrateSchema(db, version, CURRENT_SCHEMA_VERSION);
  }

  // Prepared statements for performance
  const getFileStmt = db.prepare<[string], FileRecord>(
    'SELECT path, content_hash, sum_generated_at, last_analyzed_commit FROM files WHERE path = ?'
  );

  const upsertFileStmt = db.prepare<[string, string, string | null, string | null]>(`
    INSERT INTO files (path, content_hash, sum_generated_at, last_analyzed_commit)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      content_hash = excluded.content_hash,
      sum_generated_at = excluded.sum_generated_at,
      last_analyzed_commit = excluded.last_analyzed_commit
  `);

  const deleteFileStmt = db.prepare<[string]>(
    'DELETE FROM files WHERE path = ?'
  );

  const getAllFilesStmt = db.prepare<[], FileRecord>(
    'SELECT path, content_hash, sum_generated_at, last_analyzed_commit FROM files'
  );

  const getLastRunStmt = db.prepare<[], RunRecord>(
    'SELECT id, commit_hash, completed_at, files_analyzed, files_skipped FROM runs ORDER BY id DESC LIMIT 1'
  );

  const insertRunStmt = db.prepare<[string, string, number, number]>(`
    INSERT INTO runs (commit_hash, completed_at, files_analyzed, files_skipped)
    VALUES (?, ?, ?, ?)
  `);

  return {
    getFile(path: string): FileRecord | undefined {
      return getFileStmt.get(path);
    },

    upsertFile(record: FileRecord): void {
      upsertFileStmt.run(
        record.path,
        record.content_hash,
        record.sum_generated_at,
        record.last_analyzed_commit
      );
    },

    deleteFile(path: string): void {
      deleteFileStmt.run(path);
    },

    getAllFiles(): FileRecord[] {
      return getAllFilesStmt.all();
    },

    getLastRun(): RunRecord | undefined {
      return getLastRunStmt.get();
    },

    insertRun(run: Omit<RunRecord, 'id'>): number {
      const result = insertRunStmt.run(
        run.commit_hash,
        run.completed_at,
        run.files_analyzed,
        run.files_skipped
      );
      return Number(result.lastInsertRowid);
    },

    close(): void {
      db.close();
    },

    getDb(): Database.Database {
      return db;
    },
  };
}
