export const tokenValveCorePackage = "@tokenvalve/core";

export interface HealthCheck {
  packageName: string;
  status: "ok";
  message: string;
}

export function getCoreHealth(): HealthCheck {
  return {
    packageName: tokenValveCorePackage,
    status: "ok",
    message: "project skeleton is runnable"
  };
}

export * from "./resolver.js";
export * from "./types.js";
export * from "./redactor.js";
export * from "./audit.js";
export * from "./secret-store.js";
export * from "./init.js";
export * from "./profile-inventory.js";
export * from "./github-runner.js";
export * from "./supabase-runner.js";
export * from "./http-runner.js";
export * from "./ssh-runner.js";
export * from "./vercel-runner.js";
export * from "./human-intent.js";
export * from "./recipe-store.js";
