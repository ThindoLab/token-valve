import { describe, expect, it } from "vitest";
import { getDashboardStatus } from "./index.js";

describe("dashboard package", () => {
  it("exposes a phase 1 placeholder", () => {
    expect(getDashboardStatus()).toBe("dashboard package placeholder");
  });
});
