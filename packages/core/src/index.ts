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
