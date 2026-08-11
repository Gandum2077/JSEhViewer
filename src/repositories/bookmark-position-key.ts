export const BOOKMARK_POSITION_KEY_WIDTH = 12;
export const BOOKMARK_POSITION_GAP = 1024;

function digitValue(character: string): number {
  const code = character.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 122) return code - 87;
  return -1;
}

export function bookmarkPositionKeyValue(key: string): number {
  if (typeof key !== "string" || !new RegExp(`^[0-9a-z]{${BOOKMARK_POSITION_KEY_WIDTH}}$`, "u").test(key)) {
    throw new Error(`书签 position key 必须是 ${BOOKMARK_POSITION_KEY_WIDTH} 位小写 base36 字符串`);
  }
  let value = 0;
  for (const character of key) {
    value = value * 36 + digitValue(character);
    if (!Number.isSafeInteger(value)) throw new Error("书签 position key 超出 JavaScript 安全整数范围");
  }
  return value;
}

export function formatBookmarkPositionKey(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("书签 position key 数值必须是非负安全整数");
  const key = value.toString(36).padStart(BOOKMARK_POSITION_KEY_WIDTH, "0");
  if (key.length !== BOOKMARK_POSITION_KEY_WIDTH) throw new Error("书签 position key 超出固定宽度");
  return key;
}

export function bookmarkPositionKeyForIndex(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error(`书签位置序号无效：${index}`);
  const value = (index + 1) * BOOKMARK_POSITION_GAP;
  if (!Number.isSafeInteger(value)) throw new Error("书签数量超过 position key 安全范围");
  return formatBookmarkPositionKey(value);
}

export function bookmarkPositionKeyAfter(lastKey: string | undefined): string {
  if (lastKey === undefined) return bookmarkPositionKeyForIndex(0);
  const value = bookmarkPositionKeyValue(lastKey) + BOOKMARK_POSITION_GAP;
  if (!Number.isSafeInteger(value)) throw new Error("书签 position key 已无追加空间，需要先重整排序 key");
  return formatBookmarkPositionKey(value);
}

export function requireBookmarkPositionKey(key: string): string {
  bookmarkPositionKeyValue(key);
  return key;
}
