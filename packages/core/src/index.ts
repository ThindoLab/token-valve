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
