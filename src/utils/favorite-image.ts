import {
  DBFavoriteImageGroup,
  DBFavoriteImageItem,
  FavoriteImageGroupWithFiles,
  FavoriteImageGroupQueryOptions,
} from "../types";
import { dbManager } from "./database";
import { favoriteImagePath } from "./glv";

type FavoriteImageJoinedDBRawData = {
  gid: number;
  page_index: number;
  favorited_at: string;
  title: string;
};

type FavoriteImageFile = {
  file_name: string;
  is_original: boolean;
};

const FAVORITE_IMAGE_FILE_NAME_PATTERN = /^(\d+)_(\d+)(_original)?\.([^.]+)$/i;

class FavoriteImageManager {
  add(gid: number, pageIndex: number, favoritedAt: string = new Date().toISOString()): boolean {
    dbManager.update(
      `INSERT INTO favorite_images (gid, page_index, favorited_at)
      VALUES (?, ?, ?)
      ON CONFLICT(gid, page_index) DO NOTHING`,
      [gid, pageIndex, favoritedAt],
    );
    return true;
  }

  remove(gid: number, pageIndex: number) {
    dbManager.update("DELETE FROM favorite_images WHERE gid = ? AND page_index = ?", [gid, pageIndex]);
  }

  removeByGid(gid: number) {
    dbManager.update("DELETE FROM favorite_images WHERE gid = ?", [gid]);
  }

  get(gid: number, pageIndex: number): DBFavoriteImageItem | undefined {
    const rows = dbManager.query(
      `SELECT * FROM favorite_images 
      WHERE gid = ? AND page_index = ?`,
      [gid, pageIndex],
    ) as DBFavoriteImageItem[];
    return rows.length ? rows[0] : undefined;
  }

  isFavorite(gid: number, pageIndex: number) {
    return Boolean(this.get(gid, pageIndex));
  }

  queryAll(order: "asc" | "desc" = "desc"): DBFavoriteImageItem[] {
    const sqlOrder = order.toUpperCase();
    const rows = dbManager.query(
      `SELECT * FROM favorite_images 
      ORDER BY favorited_at ${sqlOrder}, gid ${sqlOrder}, page_index ASC`,
    ) as DBFavoriteImageItem[];
    return rows;
  }

  queryByGid(gid: number): DBFavoriteImageItem[] {
    const rows = dbManager.query(
      `SELECT * FROM favorite_images 
      WHERE gid = ? ORDER BY page_index ASC`,
      [gid],
    ) as DBFavoriteImageItem[];
    return rows;
  }

  queryGroups(options: FavoriteImageGroupQueryOptions): DBFavoriteImageGroup[] {
    const sort = options.sort ?? "favorited_at";
    const order = options.order ?? "desc";
    const rows = dbManager.query(`
      SELECT
        f.gid,
        f.page_index,
        f.favorited_at,
        COALESCE(
          NULLIF(a.japanese_title, ''),
          NULLIF(a.english_title, ''),
          NULLIF(a.title, ''),
          ''
        ) AS title
      FROM favorite_images f
      LEFT JOIN archives a ON a.gid = f.gid
      ORDER BY f.gid DESC, f.favorited_at DESC
    `) as FavoriteImageJoinedDBRawData[];

    const groups: DBFavoriteImageGroup[] = [];
    for (const row of rows) {
      if (groups.length === 0) {
        groups.push({
          gid: row.gid,
          latest_favorited_at: row.favorited_at,
          pages: [row.page_index],
          title: row.title,
        });
        continue;
      }
      const lastGroup = groups[groups.length - 1];
      if (lastGroup.gid === row.gid) {
        lastGroup.pages.push(row.page_index);
      } else {
        groups.push({
          gid: row.gid,
          latest_favorited_at: row.favorited_at,
          pages: [row.page_index],
          title: row.title,
        });
      }
    }

    groups
      .sort((a, b) => {
        if (sort === "favorited_at") {
          if (a.latest_favorited_at > b.latest_favorited_at) {
            return 1;
          } else if (a.latest_favorited_at < b.latest_favorited_at) {
            return -1;
          } else {
            return 0;
          }
        } else {
          return a.gid - b.gid;
        }
      })
      .map((n) => n.pages.sort((a, b) => a - b));

    if (order === "desc") groups.reverse();

    return groups;
  }

  queryGroupWithFileNames(options: FavoriteImageGroupQueryOptions): FavoriteImageGroupWithFiles[] {
    const groups = this.queryGroups(options)
    const filesByPage = new Map<string, FavoriteImageFile>();

    for (const fileName of ($file.list(favoriteImagePath) ?? [])) {
      const match = FAVORITE_IMAGE_FILE_NAME_PATTERN.exec(fileName);
      if (!match) continue;

      const gid = Number(match[1]);
      const pageIndex = Number(match[2]);
      const isOriginal = Boolean(match[3]);
      const key = `${gid}:${pageIndex}`;
      const current = filesByPage.get(key);

      // 文件替换中如果普通图和原图同时存在，优先展示原图。
      if (!current || (!current.is_original && isOriginal)) {
        filesByPage.set(key, {
          file_name: fileName,
          is_original: isOriginal,
        });
      }
    }

    return groups.map(({ pages, ...group }) => ({
      ...group,
      pages: pages.map((pageIndex) => {
        const file = filesByPage.get(`${group.gid}:${pageIndex}`);
        return file ? { page_index: pageIndex, ...file } : { page_index: pageIndex };
      }),
    }));
  }
}

export const favoriteImageManager = new FavoriteImageManager();