import { describe, expect, it } from "vitest";
import { getSkillsStatus } from "./index.js";

describe("skills package", () => {
  it("exposes a phase 1 placeholder", () => {
    expect(getSkillsStatus()).toBe("skills package placeholder");
  });
});
