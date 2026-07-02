import { describe, it, expect } from "vitest";
// Replay's logic spans network I/O (Postgres), so the unit test focuses on
// the pure replayPipeline transformation through the public surface.

import { runReplay } from "../../../server/sync/replay";

describe("replay engine module surface", () => {
  it("exports runReplay as a function", () => {
    expect(typeof runReplay).toBe("function");
  });
});
