import {
  DBFavoriteImageGroup,
  DBFavoriteImageItem,
  FavoriteImageFile,
  FavoriteImageGroupWithFiles,
  FavoriteImageGroupQueryOptions,
} from "../types";
import { EHGallery } from "ehentai-parser";
import { dbManager } from "./database";
import { imagePath, thumbnailPath, galleryInfoPath } from "./glv";
import { api, downloaderManager } from "./api";

class FavoriteImageManager {
  add(gid: number, pageIndex: number, favoritedAt = new Date().toISOString()): boolean {
    try {
      dbManager.update(
        `INSERT INTO favorite_images (gid, page_index, favorited_at) VALUES (?, ?, ?)
        ON CONFLICT(gid, page_index) DO UPDATE SET favorited_at = excluded.favorited_at`,
        [gid, pageIndex, favoritedAt],
      );
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  remove(gid: number, pageIndex: number): boolean {
    try {
      dbManager.update("DELETE FROM favorite_images WHERE gid = ? AND page_index = ?", [gid, pageIndex]);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  removeByGid(gid: number): boolean {
    dbManager.update("DELETE FROM favorite_images WHERE gid = ?", [gid]);
    return true;
  }

  // 字段保留以兼容现有视图，内容改为原缓存的完整路径。
  getFile(gid: number, pageIndex: number): FavoriteImageFile {
    const directory = imagePath + gid + "/";
    const name = ($file.list(directory) ?? []).find(
      (name) => /\.(png|jpe?g|gif|webp)$/i.test(name) && Number(name.split(".")[0].split("_")[0]) === pageIndex + 1,
    );
    const thumbnail = thumbnailPath + `${gid}/${pageIndex + 1}.jpg`;
    return {
      page_index: pageIndex,
      file_name: name ? directory + name : "",
      thumbnail_file_name: $file.exists(thumbnail) ? thumbnail : "",
      is_original: false,
    };
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
        COALESCE(a.token, '') AS token,
        COALESCE(a.length, 0) AS length,
        MAX(f.favorited_at) AS latest_favorited_at,
        COALESCE(
            NULLIF(a.japanese_title, ''),
            NULLIF(a.english_title, ''),
            NULLIF(a.title, ''),
            ''
        ) AS title,
        json_group_array(f.page_index) AS pages
      FROM favorite_images f
      LEFT JOIN archives a ON a.gid = f.gid
      GROUP BY f.gid
      ORDER BY ${sort === "favorited_at" ? "latest_favorited_at" : "f.gid"} ${order === "desc" ? "DESC" : "ASC"};
    `) as { gid: number; token: string; length: number; latest_favorited_at: string; title: string; pages: string }[];

    return rows.map((row) => ({
      gid: row.gid,
      token: row.token,
      length: row.length,
      latest_favorited_at: row.latest_favorited_at,
      title: row.title,
      pages: (JSON.parse(row.pages) as number[]).sort((a, b) => a - b),
    }));
  }

  queryGroupWithFileNames(options: FavoriteImageGroupQueryOptions): FavoriteImageGroupWithFiles[] {
    return this.queryGroups(options).map(({ pages, ...group }) => ({
      ...group,
      pages: pages.map((page) => this.getFile(group.gid, page)),
    }));
  }
}

export const favoriteImageManager = new FavoriteImageManager();

/** 每个可见浏览页面拥有自己的队列；退出时停止派发，完成后立即继续下一张。 */
export class FavoriteImageDownloadQueue {
  private generation = 0;
  private cancelCurrent?: () => void;

  stop() {
    this.generation++;
    this.cancelCurrent?.();
    this.cancelCurrent = undefined;
  }

  start(items: { gid: number; token: string; pageIndex: number }[], changed: () => void) {
    this.stop();
    const generation = this.generation;
    const active = () => generation === this.generation;
    void (async () => {
      const infosByGid = new Map<number, EHGallery>();
      for (const item of items) {
        if (!active()) return;
        const file = favoriteImageManager.getFile(item.gid, item.pageIndex);
        if (file.file_name && file.thumbnail_file_name) continue;
        try {
          let infos = infosByGid.get(item.gid);
          if (!infos) {
            const cached = downloaderManager.get(item.gid)?.infos;
            const path = galleryInfoPath + `${item.gid}.json`;
            if (cached) infos = JSON.parse(JSON.stringify(cached)) as EHGallery;
            else if ($file.exists(path)) {
              try {
                infos = JSON.parse($file.read(path).string || "") as EHGallery;
              } catch (_) {
                /* 重新获取 */
              }
            }
            if (!infos) {
              if (!item.token) continue;
              infos = await api.getGalleryInfo(item.gid, item.token, false);
            }
            infosByGid.set(item.gid, infos);
          }
          if (!active()) return;
          const task = downloaderManager.downloadSinglePage(infos, item.pageIndex);
          this.cancelCurrent = task.cancel;
          await task.done;
          if (task.isCancelled()) return;
        } catch (error) {
          console.error(error);
        }
        if (!active()) return;
        this.cancelCurrent = undefined;
        changed();
      }
      if (active()) downloaderManager.startIfIdle();
    })().catch((error) => console.error(error));
  }
}
