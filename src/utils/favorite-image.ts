import {
  DBFavoriteImageGroup,
  DBFavoriteImageItem,
  FavoriteImageFile,
  FavoriteImageGroupWithFiles,
  FavoriteImageGroupQueryOptions,
} from "../types";
import { dbManager } from "./database";
import { favoriteImagePath, favoriteImageTempPath } from "./glv";
import { archiveRepository } from "../repositories";

const FAVORITE_IMAGE_FILE_NAME_PATTERN = /^(\d+)_(\d+)(_original|_thumbnail)?\.([^.]+)$/i;
type FavoriteImageFileSource = "favorite" | "temporary";

class FavoriteImageManager {
  add(
    gid: number,
    pageIndex: number,
    imagePath?: string,
    thumbnailPath?: string,
    isOriginal = false,
    favoritedAt: string = new Date().toISOString(),
  ): boolean {
    if (this._getAvailablePageFile(favoriteImageTempPath, gid, pageIndex)) {
      return this.restoreFromTemporary(gid, pageIndex, favoritedAt);
    }

    if (!imagePath || !thumbnailPath || !$file.exists(imagePath) || !$file.exists(thumbnailPath)) return false;
    if (!$file.exists(favoriteImagePath) && !$file.mkdir(favoriteImagePath)) return false;
    if (!this._removeFiles(favoriteImagePath, gid, pageIndex)) return false;

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
        ON CONFLICT(gid, page_index) DO UPDATE SET favorited_at = excluded.favorited_at`,
        [gid, pageIndex, favoritedAt],
      );
      this._removeFiles(favoriteImageTempPath, gid, pageIndex);
      return true;
    } catch (error) {
      $file.delete(imageDestination);
      $file.delete(thumbnailDestination);
      console.error(error);
      return false;
    }
  }

  remove(gid: number, pageIndex: number): boolean {
    return this.moveToTemporary(gid, pageIndex);
  }

  removeByGid(gid: number): boolean {
    if (!this._removeFiles(favoriteImagePath, gid)) return false;
    if (!this._removeFiles(favoriteImageTempPath, gid)) return false;
    dbManager.update("DELETE FROM favorite_images WHERE gid = ?", [gid]);
    return true;
  }

  moveToTemporary(gid: number, pageIndex: number): boolean {
    const fileNames = this._getPageFileNames(favoriteImagePath, gid, pageIndex);
    const movedFileNames: string[] = [];

    if (fileNames.length > 0) {
      if (!$file.exists(favoriteImageTempPath) && !$file.mkdir(favoriteImageTempPath)) return false;

      for (const fileName of fileNames) {
        const destination = favoriteImageTempPath + fileName;
        if ($file.exists(destination) && !$file.delete(destination)) {
          this._rollbackMoves(movedFileNames, favoriteImageTempPath, favoriteImagePath);
          return false;
        }
        if (!$file.move({ src: favoriteImagePath + fileName, dst: destination })) {
          this._rollbackMoves(movedFileNames, favoriteImageTempPath, favoriteImagePath);
          return false;
        }
        movedFileNames.push(fileName);
      }
    }

    try {
      dbManager.update("DELETE FROM favorite_images WHERE gid = ? AND page_index = ?", [gid, pageIndex]);
      return true;
    } catch (error) {
      this._rollbackMoves(movedFileNames, favoriteImageTempPath, favoriteImagePath);
      console.error(error);
      return false;
    }
  }

  restoreFromTemporary(gid: number, pageIndex: number, favoritedAt = new Date().toISOString()): boolean {
    const fileNames = this._getPageFileNames(favoriteImageTempPath, gid, pageIndex);
    if (!this._getAvailablePageFile(favoriteImageTempPath, gid, pageIndex)) return false;
    if (!$file.exists(favoriteImagePath) && !$file.mkdir(favoriteImagePath)) return false;
    if (!this._removeFiles(favoriteImagePath, gid, pageIndex)) return false;

    const movedFileNames: string[] = [];
    for (const fileName of fileNames) {
      if (!$file.move({ src: favoriteImageTempPath + fileName, dst: favoriteImagePath + fileName })) {
        this._rollbackMoves(movedFileNames, favoriteImagePath, favoriteImageTempPath);
        return false;
      }
      movedFileNames.push(fileName);
    }

    try {
      dbManager.update(
        `INSERT INTO favorite_images (gid, page_index, favorited_at)
         VALUES (?, ?, ?)
         ON CONFLICT(gid, page_index) DO UPDATE SET favorited_at = excluded.favorited_at`,
        [gid, pageIndex, favoritedAt],
      );
      return true;
    } catch (error) {
      this._rollbackMoves(movedFileNames, favoriteImagePath, favoriteImageTempPath);
      console.error(error);
      return false;
    }
  }

  clearTemporaryFiles() {
    if ($file.exists(favoriteImageTempPath)) $file.delete(favoriteImageTempPath);
  }

  getFile(gid: number, pageIndex: number, source: FavoriteImageFileSource = "favorite"): FavoriteImageFile | undefined {
    return this._getPageFile(source === "favorite" ? favoriteImagePath : favoriteImageTempPath, gid, pageIndex);
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
        json_group_array(f.page_index) AS pages
      FROM favorite_images f
      GROUP BY f.gid
      ORDER BY ${sort === "favorited_at" ? "latest_favorited_at" : "f.gid"} ${order === "desc" ? "DESC" : "ASC"};
    `) as { gid: number; latest_favorited_at: string; pages: string }[];
    const metadataByGid = archiveRepository.getMetadataByGids(rows.map((row) => row.gid));

    return rows.map((row) => {
      const metadata = metadataByGid.get(row.gid);
      return {
        gid: row.gid,
        token: metadata?.token ?? "",
        length: metadata?.length ?? 0,
        latest_favorited_at: row.latest_favorited_at,
        title: metadata?.title ?? "",
        pages: (JSON.parse(row.pages) as number[]).sort((a, b) => a - b),
      };
    });
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

  private _removeFiles(path: string, gid: number, pageIndex?: number): boolean {
    const fileNames = this._getPageFileNames(path, gid, pageIndex);

    let success = true;
    for (const fileName of fileNames) {
      if (!$file.delete(path + fileName)) success = false;
    }
    return success;
  }

  private _getAvailablePageFile(path: string, gid: number, pageIndex: number): FavoriteImageFile | undefined {
    const file = this._getPageFile(path, gid, pageIndex);
    if (!file?.file_name || !file.thumbnail_file_name) return undefined;
    return file;
  }

  private _getPageFile(path: string, gid: number, pageIndex: number): FavoriteImageFile | undefined {
    let file: FavoriteImageFile | undefined;
    for (const fileName of this._getPageFileNames(path, gid, pageIndex)) {
      const match = FAVORITE_IMAGE_FILE_NAME_PATTERN.exec(fileName);
      if (!match) continue;

      const suffix = match[3]?.toLowerCase();
      const isOriginal = suffix === "_original";
      const isThumbnail = suffix === "_thumbnail";

      if (!file) {
        file = {
          page_index: pageIndex,
          file_name: "",
          is_original: false,
          thumbnail_file_name: "",
        };
      }

      if (isThumbnail) {
        file.thumbnail_file_name = fileName;
      } else if (isOriginal || !file.file_name) {
        file.file_name = fileName;
        file.is_original = isOriginal;
      }
    }
    return file;
  }

  private _getPageFileNames(path: string, gid: number, pageIndex?: number): string[] {
    return ($file.list(path) ?? []).filter((fileName) => {
      const match = FAVORITE_IMAGE_FILE_NAME_PATTERN.exec(fileName);
      if (!match || Number(match[1]) !== gid) return false;
      return pageIndex === undefined || Number(match[2]) === pageIndex;
    });
  }

  private _rollbackMoves(fileNames: string[], sourcePath: string, destinationPath: string) {
    for (const fileName of fileNames) {
      const source = sourcePath + fileName;
      if ($file.exists(source) && !$file.move({ src: source, dst: destinationPath + fileName })) {
        console.error(`Failed to roll back favorite image file: ${source}`);
      }
    }
  }
}

export const favoriteImageManager = new FavoriteImageManager();
