export const PRE_SYNC_DATABASE_BACKUP_PATH = "assets/database.pre-sync-v1.backup.db";

export interface DatabaseFileOperations {
  exists(path: string): boolean;
  copy(args: { src: string; dst: string }): boolean;
  move(args: { src: string; dst: string }): boolean;
  delete(path: string): boolean;
}

export type DatabaseBackupResult = "source-missing" | "already-exists" | "created";

export class DatabaseBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseBackupError";
  }
}

/**
 * Creates the pre-sync backup once and never overwrites it. Copying first to a
 * temporary sibling avoids treating an interrupted copy as a valid backup.
 * This must run before opening the SQLite queue.
 */
export function ensurePreSyncDatabaseBackup(
  files: DatabaseFileOperations,
  sourcePath: string,
  backupPath = PRE_SYNC_DATABASE_BACKUP_PATH,
): DatabaseBackupResult {
  if (!files.exists(sourcePath)) return "source-missing";
  if (files.exists(backupPath)) return "already-exists";

  const temporaryPath = `${backupPath}.tmp`;
  if (files.exists(temporaryPath) && !files.delete(temporaryPath)) {
    throw new DatabaseBackupError("无法清理上次未完成的数据库备份临时文件");
  }
  if (!files.copy({ src: sourcePath, dst: temporaryPath }) || !files.exists(temporaryPath)) {
    if (files.exists(temporaryPath)) files.delete(temporaryPath);
    throw new DatabaseBackupError("无法复制数据库备份临时文件");
  }
  if (!files.move({ src: temporaryPath, dst: backupPath }) || !files.exists(backupPath)) {
    if (files.exists(temporaryPath)) files.delete(temporaryPath);
    throw new DatabaseBackupError("无法完成数据库备份");
  }
  return "created";
}
