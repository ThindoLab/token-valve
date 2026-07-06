import { describe, expect, it } from "vitest";
import { getMcpServerStatus } from "./index.js";

describe("mcp server package", () => {
  it("exposes a phase 1 placeholder", () => {
    expect(getMcpServerStatus()).toBe("mcp server package placeholder");
  });
});
