import { beforeEach, describe, expect, it } from "vitest";
import { getRequest, listPending, markFulfilled, openDb, recordRequest, type PythiaDb } from "../src/persist";

let db: PythiaDb;

beforeEach(() => {
  db = openDb(":memory:");
});

describe("persist", () => {
  it("records and reads back a request", () => {
    recordRequest(db, 42n, "0xC0", 1, 3, "prompt-hash", Date.now());

    const request = getRequest(db, 42n);

    expect(request?.consumer).toBe("0xC0");
    expect(request?.status).toBe("pending");
  });

  it("markFulfilled moves status to fulfilled and stores cid + txHash", () => {
    recordRequest(db, 1n, "0xC0", 1, 3, "h", Date.now());
    markFulfilled(db, 1n, 0, "bafyTEST", "0xTX");

    const request = getRequest(db, 1n);

    expect(request?.status).toBe("fulfilled");
    expect(request?.choice).toBe(0);
    expect(request?.cid).toBe("bafyTEST");
    expect(request?.txHash).toBe("0xTX");
  });

  it("listPending returns only pending rows", () => {
    recordRequest(db, 1n, "0xC0", 1, 3, "h", Date.now());
    recordRequest(db, 2n, "0xC0", 1, 3, "h", Date.now());
    markFulfilled(db, 1n, 0, "bafy", "0xTX");

    expect(listPending(db).map((row) => row.requestId)).toEqual([2n]);
  });
});
