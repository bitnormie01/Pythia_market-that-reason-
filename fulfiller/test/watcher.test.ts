import { describe, expect, it, vi } from "vitest";
import { onRequestMade } from "../src/watcher";

describe("onRequestMade", () => {
  it("invokes the callback with parsed event args", async () => {
    const cb = vi.fn();

    await onRequestMade(
      {
        args: {
          requestId: 1n,
          consumer: "0x00000000000000000000000000000000000000c0",
          modelId: 1n,
          prompt: "p",
          numOfChoices: 3,
          feePaid: 10n
        }
      } as any,
      cb
    );

    expect(cb).toHaveBeenCalledWith({
      requestId: 1n,
      consumer: "0x00000000000000000000000000000000000000c0",
      modelId: 1,
      numOfChoices: 3,
      prompt: "p"
    });
  });
});
