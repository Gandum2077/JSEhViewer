import {
  DBFavoriteImageGroup,
  DBFavoriteImageItem,
  FavoriteImageGroupWithFiles,
  FavoriteImageGroupQueryOptions,
} from "../types";
import { dbManager } from "./database";
import { favoriteImagePath } from "./glv";

type FavoriteImageFile = {
  page_index: number;
  thumbnail_file_name: string;
  file_name: string;
  is_original: boolean;
};

const FAVORITE_IMAGE_FILE_NAME_PATTERN = /^(\d+)_(\d+)(_original|_thumbnail)?\.([^.]+)$/i;

class FavoriteImageManager {
  add(
    gid: number,
    pageIndex: number,
    imagePath: string,
    thumbnailPath: string,
    isOriginal = false,
    favoritedAt: string = new Date().toISOString(),
  ): boolean {
    if (!$file.exists(imagePath) || !$file.exists(thumbnailPath)) return false;
    if (!this._removeFiles(gid, pageIndex)) return false;

    const imageFileName = `${gid}_${pageIndex}${isOriginal ? "_original" : ""}.${this._getExtension(imagePath)}`;
    const thumbnailFileName = `${gid}_${pageIndex}_thumbnail.${this._getExtension(thumbnailPath)}`;
    const imageDestination = favoriteImagePath + imageFileName;
    const thumbnailDestination = favoriteImagePath + thumbnailFileName;

    if (!$file.copy({ src: imagePath, dst: imageDestination })) return false;
    if (!$file.copy({ src: thumbnailPath, dst: thumbnailDestination })) {
      $file.delete(imageDestination);
      return false;
    }

    try {
      dbManager.update(
        `INSERT INTO favorite_images (gid, page_index, favorited_at)
        VALUES (?, ?, ?)
        ON CONFLICT(gid, page_index) DO NOTHING`,
        [gid, pageIndex, favoritedAt],
      );
      return true;
    } catch (error) {
      $file.delete(imageDestination);
      $file.delete(thumbnailDestination);
      console.error(error);
      return false;
    }
  }

  remove(gid: number, pageIndex: number): boolean {
    if (!this._removeFiles(gid, pageIndex)) return false;
    dbManager.update("DELETE FROM favorite_images WHERE gid = ? AND page_index = ?", [gid, pageIndex]);
    return true;
  }

  removeByGid(gid: number): boolean {
    if (!this._removeFiles(gid)) return false;
    dbManager.update("DELETE FROM favorite_images WHERE gid = ?", [gid]);
    return true;
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
    `) as { gid: number; latest_favorited_at: string; title: string; pages: string }[];

    return rows.map((row) => ({
      gid: row.gid,
      latest_favorited_at: row.latest_favorited_at,
      title: row.title,
      pages: (JSON.parse(row.pages) as number[]).sort((a, b) => a - b),
    }));
  }

  queryGroupWithFileNames(options: FavoriteImageGroupQueryOptions): FavoriteImageGroupWithFiles[] {
    const groups = this.queryGroups(options);
    const filesByPage = new Map<string, FavoriteImageFile>();

    for (const fileName of $file.list(favoriteImagePath) ?? []) {
      const match = FAVORITE_IMAGE_FILE_NAME_PATTERN.exec(fileName);
      if (!match) continue;

      const gid = Number(match[1]);
      const pageIndex = Number(match[2]);
      const suffix = match[3]?.toLowerCase();
      const isOriginal = suffix === "_original";
      const isThumbnail = suffix === "_thumbnail";
      const key = `${gid}:${pageIndex}`;
      const current = filesByPage.get(key);

      if (!current) {
        filesByPage.set(key, {
          page_index: pageIndex,
          file_name: "",
          is_original: false,
          thumbnail_file_name: "",
        });
      }

      const file = filesByPage.get(key)!;
      if (isThumbnail) {
        file.thumbnail_file_name = fileName;
      } else if (isOriginal || !file.file_name) {
        file.file_name = fileName;
        file.is_original = isOriginal;
      }
    }

    return groups.map(({ pages, ...group }) => ({
      ...group,
      pages: pages.map((pageIndex) => {
        const file = filesByPage.get(`${group.gid}:${pageIndex}`);
        return (
          file ?? {
            page_index: pageIndex,
            file_name: "",
            is_original: false,
            thumbnail_file_name: "",
          }
        );
      }),
    }));
  }

  private _getExtension(path: string): string {
    return path.split(".").at(-1) || "jpg";
  }

  private _removeFiles(gid: number, pageIndex?: number): boolean {
    const fileNames = ($file.list(favoriteImagePath) ?? []).filter((fileName) => {
      const match = FAVORITE_IMAGE_FILE_NAME_PATTERN.exec(fileName);
      if (!match || Number(match[1]) !== gid) return false;
      return pageIndex === undefined || Number(match[2]) === pageIndex;
    });

    let success = true;
    for (const fileName of fileNames) {
      if (!$file.delete(favoriteImagePath + fileName)) success = false;
    }
    return success;
  }
}

export const favoriteImageManager = new FavoriteImageManager();
