export type SqlValue = string | number | boolean | null;
export type SqlRow = Record<string, any>;
const MIGRATION_ASSET_PATH = "assets/migrations/";

export function readMigrationAsset(fileName: string): string {
  const path = MIGRATION_ASSET_PATH + fileName;
  const data = $file.read(path);
  const text = data?.string;
  if (!text) throw new Error(`无法读取迁移文件: ${path}`);
  return text;
}

/** Split a SQLite script without breaking quoted strings or SQL comments. */
export function splitSqlScript(script: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "'" | '"' | "`" | null = null;
  let bracketQuoted = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < script.length; i += 1) {
    const char = script[i];
    const next = script[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (char === quote) {
        if (next === quote) {
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (bracketQuoted) {
      if (char === "]") bracketQuoted = false;
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "[") {
      bracketQuoted = true;
      continue;
    }
    if (char === ";") {
      const statement = script.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }

  const tail = script.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

export function stripLeadingSqlComments(sql: string): string {
  let remaining = sql.trimStart();
  while (remaining.startsWith("--") || remaining.startsWith("/*")) {
    if (remaining.startsWith("--")) {
      const lineEnd = remaining.indexOf("\n");
      return lineEnd < 0 ? "" : stripLeadingSqlComments(remaining.slice(lineEnd + 1));
    }
    const commentEnd = remaining.indexOf("*/", 2);
    if (commentEnd < 0) return "";
    remaining = remaining.slice(commentEnd + 2).trimStart();
  }
  return remaining;
}

function describeNativeError(error: any): string {
  if (!error) return "未知 SQLite 错误";
  return String(error.localizedDescription ?? error.description ?? error);
}

export function update(db: SqliteTypes.SqliteInstance, sql: string, args?: SqlValue[]): void {
  const result = db.update(args ? { sql, args } : sql);
  if (!result.result) throw new Error(`${describeNativeError(result.error)}\nSQL: ${sql}`);
}

export function query(db: SqliteTypes.SqliteInstance, sql: string, args?: SqlValue[]): SqlRow[] {
  const rows: SqlRow[] = [];
  let queryError: any = null;
  db.query(args ? { sql, args } : sql, (result, error) => {
    if (error || result === null) {
      queryError = error ?? new Error("SQLite 查询未返回结果集");
      return;
    }
    while (result.next()) {
      const row: SqlRow = {};
      for (let index = 0; index < result.columnCount; index += 1) {
        row[result.nameForIndex(index)] = result.get(index);
      }
      rows.push(row);
    }
    result.close();
  });
  if (queryError) throw new Error(`${describeNativeError(queryError)}\nSQL: ${sql}`);
  return rows;
}

export function executeScript(
  db: SqliteTypes.SqliteInstance,
  fileName: string,
  beforeStatement?: (index: number, total: number, statement: string) => void,
): void {
  const statements = splitSqlScript(readMigrationAsset(fileName));
  statements.forEach((statement, index) => {
    beforeStatement?.(index + 1, statements.length, stripLeadingSqlComments(statement));
    update(db, statement);
  });
}

export function scalarNumber(db: SqliteTypes.SqliteInstance, sql: string, args?: SqlValue[]): number {
  const rows = query(db, sql, args);
  const value = rows[0] && Object.values(rows[0])[0];
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`查询未返回有效数字: ${sql}`);
  return number;
}
