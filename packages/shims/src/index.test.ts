import path from "node:path";
import { describe, expect, it } from "vitest";
import { type ProcessRunInput, type ProcessRunner } from "@tokenvalve/core";
import { findRealBinary, main, runShim, SUPPORTED_SHIMS } from "./index.js";

const TOKEN = "ghp_shim_secret_value_1234567890";

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    return {
      stdout: `ok ${input.command} ${input.args.join(" ")} ${input.env.GH_TOKEN ?? ""}`,
      stderr: `warning ${input.env.GH_TOKEN ?? ""}`,
      exitCode: 0
    };
  }
}

function fakeExists(existing: string[]): (candidate: string) => boolean {
  const normalized = new Set(existing.map((entry) => path.resolve(entry)));
  return (candidate) => normalized.has(path.resolve(candidate));
}

describe("findRealBinary", () => {
  it("finds the real binary after the shim path", () => {
    const result = findRealBinary({
      shimName: "gh",
      currentShimPath: "/tmp/tokenvalve-bin/gh",
      pathValue: ["/tmp/tokenvalve-bin", "/usr/local/bin"].join(path.delimiter),
      exists: fakeExists(["/tmp/tokenvalve-bin/gh", "/usr/local/bin/gh"]),
      realpath: (candidate) => path.resolve(candidate)
    });

    expect(result).toBe("/usr/local/bin/gh");
  });

  it("returns null for unsupported shim names", () => {
    expect(findRealBinary({
      shimName: "node",
      pathValue: "/usr/local/bin",
      exists: fakeExists(["/usr/local/bin/node"])
    })).toBeNull();
  });
});

describe("runShim", () => {
  it("supports gh, supabase, and vercel shims", () => {
    expect(SUPPORTED_SHIMS).toEqual(["gh", "supabase", "vercel"]);
  });

  it("forwards to the real binary with args array and child-only env", async () => {
    const runner = new FakeProcessRunner();
    const before = process.env.GH_TOKEN;
    const result = await runShim({
      shimName: "gh",
      args: ["repo", "view"],
      currentShimPath: "/tmp/tokenvalve-bin/gh",
      pathValue: ["/tmp/tokenvalve-bin", "/usr/local/bin"].join(path.delimiter),
      injectedEnv: { GH_TOKEN: TOKEN },
      knownSecrets: [TOKEN],
      exists: fakeExists(["/tmp/tokenvalve-bin/gh", "/usr/local/bin/gh"]),
      realpath: (candidate) => path.resolve(candidate),
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      command: "/usr/local/bin/gh",
      args: ["repo", "view"],
      exitCode: 0
    });
    expect(runner.calls[0]).toMatchObject({
      command: "/usr/local/bin/gh",
      args: ["repo", "view"],
      env: { GH_TOKEN: TOKEN }
    });
    expect(process.env.GH_TOKEN).toBe(before);
    expect(result.stdout).not.toContain(TOKEN);
    expect(result.stderr).not.toContain(TOKEN);
  });

  it("refuses recursion when only the shim itself is on PATH", async () => {
    const runner = new FakeProcessRunner();
    const result = await runShim({
      shimName: "gh",
      args: ["repo", "view"],
      currentShimPath: "/tmp/tokenvalve-bin/gh",
      pathValue: "/tmp/tokenvalve-bin",
      exists: fakeExists(["/tmp/tokenvalve-bin/gh"]),
      realpath: (candidate) => path.resolve(candidate),
      runner
    });

    expect(result).toMatchObject({
      executed: false,
      exitCode: 1
    });
    expect(result.stderr).toContain("Real binary for gh was not found");
    expect(runner.calls).toEqual([]);
  });

  it("forwards supabase and vercel without shell strings", async () => {
    const runner = new FakeProcessRunner();
    await runShim({
      shimName: "supabase",
      args: ["projects", "list"],
      currentShimPath: "/tmp/tokenvalve-bin/supabase",
      pathValue: ["/tmp/tokenvalve-bin", "/opt/bin"].join(path.delimiter),
      exists: fakeExists(["/tmp/tokenvalve-bin/supabase", "/opt/bin/supabase"]),
      realpath: (candidate) => path.resolve(candidate),
      runner
    });
    await runShim({
      shimName: "vercel",
      args: ["deploy"],
      currentShimPath: "/tmp/tokenvalve-bin/vercel",
      pathValue: ["/tmp/tokenvalve-bin", "/opt/bin"].join(path.delimiter),
      exists: fakeExists(["/tmp/tokenvalve-bin/vercel", "/opt/bin/vercel"]),
      realpath: (candidate) => path.resolve(candidate),
      runner
    });

    expect(runner.calls.map((call) => [call.command, call.args])).toEqual([
      ["/opt/bin/supabase", ["projects", "list"]],
      ["/opt/bin/vercel", ["deploy"]]
    ]);
  });
});

describe("main", () => {
  it("infers the shim name from argv[1] and writes redacted output", async () => {
    const runner = new FakeProcessRunner();
    const out: string[] = [];
    const err: string[] = [];
    const exitCode = await main({
      argv: ["node", "/tmp/tokenvalve-bin/gh", "api", "user"],
      env: { PATH: ["/tmp/tokenvalve-bin", "/usr/local/bin"].join(path.delimiter) },
      currentShimPath: "/tmp/tokenvalve-bin/gh",
      exists: fakeExists(["/tmp/tokenvalve-bin/gh", "/usr/local/bin/gh"]),
      realpath: (candidate) => path.resolve(candidate),
      runner,
      writeOut: (value) => out.push(value),
      writeErr: (value) => err.push(value)
    });

    expect(exitCode).toBe(0);
    expect(runner.calls[0]?.args).toEqual(["api", "user"]);
    expect(out.join("")).toContain("ok");
    expect(err.join("")).toContain("warning");
  });
});
