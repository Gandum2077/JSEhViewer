import { TagNamespace, tagNamespaces } from "ehentai-parser";
import { MarkedTag } from "../types";
import { MutationOrigin, requireMutationOrigin } from "./mutation-origin";
import { RepositoryDatabase } from "./repository-database";

export const MarkedTagMode = {
  localSync: "localSync",
  upstreamMirror: "upstreamMirror",
} as const;

export type MarkedTagMode = (typeof MarkedTagMode)[keyof typeof MarkedTagMode];

interface MarkedTagRow {
  tagid: number | null;
  namespace: string;
  name: string;
  watched: number | null;
  hidden: number | null;
  color: string | null;
  weight: number | null;
}

function requireMode(mode: MarkedTagMode): void {
  if (!Object.values(MarkedTagMode).includes(mode)) {
    throw new Error("必须明确指定有效的标签数据模式");
  }
}

function requireTagIdentity(namespace: TagNamespace, name: string): void {
  if (!tagNamespaces.includes(namespace)) throw new Error("标签命名空间无效");
  if (typeof name !== "string" || name.length === 0) throw new Error("标签名称不能为空");
}

function normalizeTag(tag: MarkedTag): MarkedTag {
  requireTagIdentity(tag.namespace, tag.name);
  if (!Number.isSafeInteger(tag.tagid) || tag.tagid < 0) throw new Error("标签 ID 必须是非负安全整数");
  if (!Number.isFinite(tag.weight)) throw new Error("标签权重必须是有限数字");
  return {
    tagid: tag.tagid,
    namespace: tag.namespace,
    name: tag.name,
    watched: Boolean(tag.watched),
    hidden: Boolean(tag.hidden),
    color: tag.color || "",
    weight: tag.weight,
  };
}

function mapRow(row: MarkedTagRow): MarkedTag {
  return {
    tagid: Number(row.tagid ?? 0),
    namespace: row.namespace as TagNamespace,
    name: row.name,
    watched: Boolean(row.watched),
    hidden: Boolean(row.hidden),
    color: row.color || "",
    weight: Number(row.weight ?? 0),
  };
}

function requireLocalWrite(mode: MarkedTagMode, origin: MutationOrigin): void {
  requireMode(mode);
  requireMutationOrigin(origin);
  if (mode !== MarkedTagMode.localSync) throw new Error("E-Hentai 镜像模式不接受 D1 或本地逐项标签变更");
  if (origin !== MutationOrigin.user && origin !== MutationOrigin.remote && origin !== MutationOrigin.migrationSeed) {
    throw new Error("本地标签模式只接受用户、远端或迁移种子变更");
  }
}

function requireUpstreamWrite(mode: MarkedTagMode, origin: MutationOrigin): void {
  requireMode(mode);
  requireMutationOrigin(origin);
  if (mode !== MarkedTagMode.upstreamMirror || origin !== MutationOrigin.upstreamMirror) {
    throw new Error("E-Hentai 标签镜像只能由上游镜像来源写入");
  }
}

export class MarkedTagRepository {
  constructor(protected readonly database: RepositoryDatabase) {}

  queryMarkedTags(): MarkedTag[] {
    return (
      this.database.query(
        `SELECT tagid, namespace, name, watched, hidden, color, weight
         FROM marked_tags
         WHERE namespace IS NOT NULL AND name IS NOT NULL AND name <> ''
         ORDER BY rowid`,
      ) as MarkedTagRow[]
    )
      .filter((row) => tagNamespaces.includes(row.namespace as TagNamespace))
      .map(mapRow);
  }

  replaceUpstreamMirror(tags: MarkedTag[], mode: MarkedTagMode, origin: MutationOrigin): MarkedTag[] {
    requireUpstreamWrite(mode, origin);
    const normalized = tags.map(normalizeTag);
    return this.database.transaction((transaction) => {
      transaction.update("DELETE FROM marked_tags");
      for (const tag of normalized) {
        transaction.update(
          `INSERT INTO marked_tags
           (tagid, namespace, name, watched, hidden, color, weight)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tag.tagid, tag.namespace, tag.name, tag.watched, tag.hidden, tag.color, tag.weight],
        );
      }
      return normalized;
    }, "刷新 E-Hentai 标签镜像");
  }

  upsertLocalTag(tag: MarkedTag, mode: MarkedTagMode, origin: MutationOrigin): MarkedTag {
    requireLocalWrite(mode, origin);
    const normalized = normalizeTag(tag);
    return this.database.transaction((transaction) => {
      transaction.update(
        `INSERT INTO marked_tags
         (tagid, namespace, name, watched, hidden, color, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(namespace, name) DO UPDATE SET
           tagid = excluded.tagid,
           watched = excluded.watched,
           hidden = excluded.hidden,
           color = excluded.color,
           weight = excluded.weight`,
        [
          normalized.tagid,
          normalized.namespace,
          normalized.name,
          normalized.watched,
          normalized.hidden,
          normalized.color,
          normalized.weight,
        ],
      );
      return normalized;
    }, "保存本地标签");
  }

  updateUpstreamTag(tag: MarkedTag, mode: MarkedTagMode, origin: MutationOrigin): MarkedTag {
    requireUpstreamWrite(mode, origin);
    const normalized = normalizeTag(tag);
    return this.database.transaction((transaction) => {
      transaction.update(
        `INSERT INTO marked_tags
         (tagid, namespace, name, watched, hidden, color, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(namespace, name) DO UPDATE SET
           tagid = excluded.tagid,
           watched = excluded.watched,
           hidden = excluded.hidden,
           color = excluded.color,
           weight = excluded.weight`,
        [
          normalized.tagid,
          normalized.namespace,
          normalized.name,
          normalized.watched,
          normalized.hidden,
          normalized.color,
          normalized.weight,
        ],
      );
      return normalized;
    }, "更新 E-Hentai 标签镜像");
  }

  deleteLocalTag(namespace: TagNamespace, name: string, mode: MarkedTagMode, origin: MutationOrigin): boolean {
    requireLocalWrite(mode, origin);
    requireTagIdentity(namespace, name);
    return this.database.transaction((transaction) => {
      const existing = transaction.query<{ found: number }>(
        "SELECT 1 AS found FROM marked_tags WHERE namespace = ? AND name = ? LIMIT 1",
        [namespace, name],
      )[0];
      if (!existing) return false;
      transaction.update("DELETE FROM marked_tags WHERE namespace = ? AND name = ?", [namespace, name]);
      return true;
    }, "删除本地标签");
  }

  clearForRelogin(origin: MutationOrigin): number {
    requireMutationOrigin(origin);
    if (origin !== MutationOrigin.localMaintenance) {
      throw new Error("重新登录清理必须标记为本机维护操作");
    }
    return this.database.transaction((transaction) => {
      const count = Number(transaction.query<{ count: number }>("SELECT COUNT(*) AS count FROM marked_tags")[0]?.count);
      transaction.update("DELETE FROM marked_tags");
      return count;
    }, "重新登录前清空标签模式数据");
  }
}
