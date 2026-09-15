export const CREDENTIALS_REVISION_KEY = "_credentials_revision";

export interface Credentials {
  version: 1;
  cookie: string;
  webdav: Record<string, { username: string | null; password: string | null }>;
  sync?: { apiUrl: string; masterKey: string };
}

interface CredentialsDocument extends Credentials {
  transaction?: { revision: string; previous: Credentials };
}

export function credentialsPathForDatabase(databasePath: string): string {
  return databasePath.replace(/[^/]+$/, "credentials.json");
}

function validCredentials(value: any): value is Credentials {
  return (
    value &&
    value.version === 1 &&
    typeof value.cookie === "string" &&
    (value.sync === undefined ||
      (value.sync && typeof value.sync.apiUrl === "string" && typeof value.sync.masterKey === "string")) &&
    value.webdav &&
    typeof value.webdav === "object" &&
    !Array.isArray(value.webdav) &&
    Object.values(value.webdav).every(
      (entry: any) =>
        entry &&
        (entry.username === null || typeof entry.username === "string") &&
        (entry.password === null || typeof entry.password === "string"),
    )
  );
}

function readDocument(path: string): CredentialsDocument {
  if (!$file.exists(path)) return { version: 1, cookie: "", webdav: {} };
  try {
    const value = JSON.parse($file.read(path).string ?? "");
    if (!validCredentials(value)) throw new Error();
    const document = value as CredentialsDocument;
    if (
      document.transaction &&
      (typeof document.transaction.revision !== "string" || !validCredentials(document.transaction.previous))
    )
      throw new Error();
    return document;
  } catch {
    // JSON parser errors may quote credentials, so never expose their message.
    throw new Error("credentials.json 无法读取或格式无效，请先恢复凭据文件");
  }
}

function writeDocument(path: string, value: CredentialsDocument): void {
  const data = $data({ string: JSON.stringify(value, null, 2) });
  // NSData writes a temporary file and replaces the destination atomically.
  if (!data.ocValue().invoke("writeToFile:atomically:", $file.absolutePath(path), true)) {
    throw new Error("无法保存 credentials.json");
  }
}

/** The revision must come from the same database as the service definitions. */
export function readCredentials(path: string, committedRevision?: string): Credentials {
  const document = readDocument(path);
  const { transaction, ...current } = document;
  if (!transaction) return current;
  const recovered = transaction.revision === committedRevision ? current : transaction.previous;
  try {
    writeDocument(path, recovered);
  } catch {
    /* The snapshot still permits correct reads; retry cleanup later. */
  }
  return recovered;
}

/** Retain the old file contents until the matching SQLite transaction commits. */
export function prepareCredentialsUpdate(path: string, previous: Credentials, next: Credentials) {
  const revision = $text.uuid;
  writeDocument(path, { ...next, transaction: { revision, previous } });
  return {
    revision,
    rollback: () => writeDocument(path, previous),
    finish: () => {
      // A committed database plus the pending document is recoverable on restart.
      // Failure to remove the recovery snapshot must not report a failed SQL save.
      try {
        writeDocument(path, next);
      } catch {
        /* retry on the next read */
      }
    },
  };
}
