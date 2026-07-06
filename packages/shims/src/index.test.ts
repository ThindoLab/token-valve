import { describe, expect, it } from "vitest";
import { getShimStatus } from "./index.js";

describe("shims package", () => {
  it("exposes a phase 1 placeholder", () => {
    expect(getShimStatus()).toBe("shims package placeholder");
  });
});
