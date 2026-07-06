import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { NodeProcessRunner, redactForReturn, type ProcessRunner } from "@tokenvalve/core";

export const tokenValveShimsPackage = "@tokenvalve/shims";

export const SUPPORTED_SHIMS = ["gh", "supabase", "vercel"] as const;

export type SupportedShim = typeof SUPPORTED_SHIMS[number];

export interface FindRealBinaryInput {
  shimName: string;
  pathValue: string;
  currentShimPath?: string;
  exists?: (candidate: string) => boolean;
  realpath?: (candidate: string) => string;
}

export interface ShimRunInput {
  shimName: string;
  args: string[];
  pathValue?: string;
  currentShimPath?: string;
  injectedEnv?: Record<string, string>;
  knownSecrets?: string[];
  runner?: ProcessRunner;
  exists?: (candidate: string) => boolean;
  realpath?: (candidate: string) => string;
}

export interface ShimRunResult {
  shimName: string;
  command?: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  executed: boolean;
}

export interface ShimMainInput {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  currentShimPath?: string;
  runner?: ProcessRunner;
  exists?: (candidate: string) => boolean;
  realpath?: (candidate: string) => string;
  writeOut?: (value: string) => void;
  writeErr?: (value: string) => void;
}

export async function main(input: ShimMainInput = {}): Promise<number> {
  const argv = input.argv ?? process.argv;
  const env = input.env ?? process.env;
  const currentShimPath = input.currentShimPath ?? argv[1];
  const shimName = path.basename(currentShimPath ?? argv[1] ?? "");
  const result = await runShim({
    shimName,
    args: argv.slice(2),
    pathValue: env.PATH,
    currentShimPath,
    injectedEnv: {},
    runner: input.runner,
    exists: input.exists,
    realpath: input.realpath
  });

  if (result.stdout) {
    (input.writeOut ?? process.stdout.write.bind(process.stdout))(result.stdout);
  }
  if (result.stderr) {
    (input.writeErr ?? process.stderr.write.bind(process.stderr))(result.stderr);
  }

  return result.exitCode;
}

export async function runShim(input: ShimRunInput): Promise<ShimRunResult> {
  const supported = normalizeShimName(input.shimName);
  if (!supported) {
    return blockedResult(input.shimName, input.args, `Unsupported TokenValve shim: ${input.shimName}.`);
  }

  const realBinary = findRealBinary({
    shimName: supported,
    pathValue: input.pathValue ?? process.env.PATH ?? "",
    currentShimPath: input.currentShimPath,
    exists: input.exists,
    realpath: input.realpath
  });

  if (!realBinary) {
    return blockedResult(supported, input.args, `Real binary for ${supported} was not found after the TokenValve shim. Check PATH order.`);
  }

  const beforeEnv = snapshotEnv(input.injectedEnv ?? {});
  const processResult = await (input.runner ?? new NodeProcessRunner()).run({
    command: realBinary,
    args: input.args,
    env: input.injectedEnv ?? {}
  });
  assertParentEnvUnchanged(beforeEnv);

  const stdout = redactForReturn(processResult.stdout, { knownSecrets: input.knownSecrets }).text;
  const stderr = redactForReturn(processResult.stderr, { knownSecrets: input.knownSecrets }).text;

  return {
    shimName: supported,
    command: realBinary,
    args: input.args,
    stdout,
    stderr,
    exitCode: processResult.exitCode,
    executed: true
  };
}

export function findRealBinary(input: FindRealBinaryInput): string | null {
  const supported = normalizeShimName(input.shimName);
  if (!supported) {
    return null;
  }

  const exists = input.exists ?? existsSync;
  const realpath = input.realpath ?? defaultRealpath;
  const currentRealpath = input.currentShimPath && exists(input.currentShimPath)
    ? realpath(input.currentShimPath)
    : input.currentShimPath;
  const currentDir = input.currentShimPath ? path.dirname(path.resolve(input.currentShimPath)) : undefined;

  for (const entry of input.pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(entry, supported);
    if (!exists(candidate)) {
      continue;
    }

    const candidateRealpath = realpath(candidate);
    if (currentRealpath && candidateRealpath === currentRealpath) {
      continue;
    }

    if (currentDir && path.resolve(entry) === currentDir) {
      continue;
    }

    return candidate;
  }

  return null;
}

function normalizeShimName(value: string): SupportedShim | null {
  const basename = path.basename(value);
  return SUPPORTED_SHIMS.find((shim) => shim === basename) ?? null;
}

function blockedResult(shimName: string, args: string[], message: string): ShimRunResult {
  return {
    shimName,
    args,
    stdout: "",
    stderr: `${message}\n`,
    exitCode: 1,
    executed: false
  };
}

function defaultRealpath(candidate: string): string {
  try {
    return realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function snapshotEnv(env: Record<string, string>): Record<string, string | undefined> {
  return Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
}

function assertParentEnvUnchanged(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (process.env[key] !== value) {
      throw new Error(`Parent environment was modified by shim execution: ${key}`);
    }
  }
}

if (process.env.TOKENVALVE_SHIM_MAIN === "1") {
  const exitCode = await main();
  process.exitCode = exitCode;
}
