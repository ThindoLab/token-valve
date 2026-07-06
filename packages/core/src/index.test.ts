import { describe, expect, it } from "vitest";
import { getCoreHealth, tokenValveCorePackage } from "./index.js";

describe("core health", () => {
  it("reports the project skeleton health", () => {
    expect(getCoreHealth()).toEqual({
      packageName: tokenValveCorePackage,
      status: "ok",
      message: "project skeleton is runnable"
    });
  });
});
