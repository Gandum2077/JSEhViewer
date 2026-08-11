import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";

export interface ReplaceBannedUploadersResult {
  bannedUploaders: string[];
  markedUploaders: string[];
  removedMarkedUploaders: string[];
}

function requireUploader(uploader: string): void {
  if (typeof uploader !== "string" || uploader.length === 0) {
    throw new Error("上传者名称不能为空");
  }
}

function uniqueUploaders(uploaders: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const uploader of uploaders) {
    requireUploader(uploader);
    if (!seen.has(uploader)) {
      seen.add(uploader);
      result.push(uploader);
    }
  }
  return result;
}

export class UploaderRepository {
  constructor(private readonly database: RepositoryDatabase) {}

  queryMarkedUploaders(): string[] {
    return (
      this.database.query(
        `SELECT uploader FROM marked_uploaders
         WHERE uploader IS NOT NULL AND uploader <> ''
         ORDER BY rowid`,
      ) as { uploader: string }[]
    ).map((row) => row.uploader);
  }

  queryBannedUploaders(): string[] {
    return (
      this.database.query(
        `SELECT uploader FROM banned_uploaders
         WHERE uploader IS NOT NULL AND uploader <> ''
         ORDER BY rowid`,
      ) as { uploader: string }[]
    ).map((row) => row.uploader);
  }

  addMarkedUploader(uploader: string, origin: MutationOrigin): boolean {
    requireMutationOrigin(origin);
    requireUploader(uploader);
    return this.database.transaction((transaction) => {
      const banned = transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM banned_uploaders WHERE uploader = ? LIMIT 1",
        [uploader],
      )[0];
      if (banned) return false;
      const existing = transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM marked_uploaders WHERE uploader = ? LIMIT 1",
        [uploader],
      )[0];
      if (existing) return false;
      transaction.update("INSERT INTO marked_uploaders (uploader) VALUES (?)", [uploader]);
      return true;
    }, "标记上传者");
  }

  deleteMarkedUploader(uploader: string, origin: MutationOrigin): boolean {
    requireMutationOrigin(origin);
    requireUploader(uploader);
    return this.database.transaction((transaction) => {
      const existing = transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM marked_uploaders WHERE uploader = ? LIMIT 1",
        [uploader],
      )[0];
      if (!existing) return false;
      transaction.update("DELETE FROM marked_uploaders WHERE uploader = ?", [uploader]);
      return true;
    }, "取消标记上传者");
  }

  replaceBannedUploaders(uploaders: string[], origin: MutationOrigin): ReplaceBannedUploadersResult {
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.upstreamMirror) {
      throw new Error("屏蔽上传者表只能由上游镜像刷新");
    }
    const unique = uniqueUploaders(uploaders);
    return this.database.transaction((transaction) => {
      transaction.update("DELETE FROM banned_uploaders");
      for (const uploader of unique) {
        transaction.update("INSERT INTO banned_uploaders (uploader) VALUES (?)", [uploader]);
      }
      const removedMarkedUploaders = transaction
        .query<{ uploader: string }>(
          `SELECT marked.uploader
           FROM marked_uploaders AS marked
           JOIN banned_uploaders AS banned ON banned.uploader = marked.uploader
           ORDER BY marked.rowid`,
        )
        .map((row) => row.uploader);
      transaction.update(
        `DELETE FROM marked_uploaders
         WHERE uploader IN (SELECT uploader FROM banned_uploaders)`,
      );
      const markedUploaders = transaction
        .query<{ uploader: string }>(
          `SELECT uploader FROM marked_uploaders
           WHERE uploader IS NOT NULL AND uploader <> ''
           ORDER BY rowid`,
        )
        .map((row) => row.uploader);
      const bannedUploaders = transaction
        .query<{ uploader: string }>(
          `SELECT uploader FROM banned_uploaders
           WHERE uploader IS NOT NULL AND uploader <> ''
           ORDER BY rowid`,
        )
        .map((row) => row.uploader);
      return { bannedUploaders, markedUploaders, removedMarkedUploaders };
    }, "刷新上游屏蔽上传者镜像");
  }
}
