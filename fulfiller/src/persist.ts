import Database from "better-sqlite3";

export type RequestStatus = "pending" | "fulfilled" | "refunded" | "failed";

export type RequestRow = {
  requestId: bigint;
  consumer: string;
  modelId: number;
  numOfChoices: number;
  promptHash: string;
  status: RequestStatus;
  choice: number | null;
  cid: string | null;
  txHash: string | null;
  createdAt: number;
  updatedAt: number;
};

type RawRequestRow = {
  request_id: string;
  consumer: string;
  model_id: number;
  num_of_choices: number;
  prompt_hash: string;
  status: RequestStatus;
  choice: number | null;
  cid: string | null;
  tx_hash: string | null;
  created_at: number;
  updated_at: number;
};

export type PythiaDb = Database.Database;

export function openDb(path: string): PythiaDb {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      request_id TEXT PRIMARY KEY,
      consumer TEXT NOT NULL,
      model_id INTEGER NOT NULL,
      num_of_choices INTEGER NOT NULL,
      prompt_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      choice INTEGER,
      cid TEXT,
      tx_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
  `);
  return db;
}

export function recordRequest(
  db: PythiaDb,
  requestId: bigint,
  consumer: string,
  modelId: number,
  numOfChoices: number,
  promptHash: string,
  ts: number
): void {
  db.prepare(
    `
    INSERT OR IGNORE INTO requests
      (request_id, consumer, model_id, num_of_choices, prompt_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `
  ).run(requestId.toString(), consumer, modelId, numOfChoices, promptHash, ts, ts);
}

export function getRequest(db: PythiaDb, requestId: bigint): RequestRow | undefined {
  const row = db.prepare("SELECT * FROM requests WHERE request_id = ?").get(requestId.toString()) as
    | RawRequestRow
    | undefined;
  return row ? mapRow(row) : undefined;
}

export function listPending(db: PythiaDb): RequestRow[] {
  const rows = db.prepare("SELECT * FROM requests WHERE status = 'pending' ORDER BY created_at ASC").all() as RawRequestRow[];
  return rows.map(mapRow);
}

export function markFulfilled(db: PythiaDb, requestId: bigint, choice: number, cid: string, txHash: string): void {
  db.prepare(
    `
    UPDATE requests
    SET status = 'fulfilled', choice = ?, cid = ?, tx_hash = ?, updated_at = ?
    WHERE request_id = ?
  `
  ).run(choice, cid, txHash, Date.now(), requestId.toString());
}

export function markRefunded(db: PythiaDb, requestId: bigint, txHash: string): void {
  db.prepare(
    `
    UPDATE requests
    SET status = 'refunded', tx_hash = ?, updated_at = ?
    WHERE request_id = ?
  `
  ).run(txHash, Date.now(), requestId.toString());
}

export function markFailed(db: PythiaDb, requestId: bigint): void {
  db.prepare(
    `
    UPDATE requests
    SET status = 'failed', updated_at = ?
    WHERE request_id = ?
  `
  ).run(Date.now(), requestId.toString());
}

function mapRow(row: RawRequestRow): RequestRow {
  return {
    requestId: BigInt(row.request_id),
    consumer: row.consumer,
    modelId: row.model_id,
    numOfChoices: row.num_of_choices,
    promptHash: row.prompt_hash,
    status: row.status,
    choice: row.choice,
    cid: row.cid,
    txHash: row.tx_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
