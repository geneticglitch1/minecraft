import { env } from "./env";

export class ManagedDeploymentError extends Error {
  constructor() {
    super("This deployment is managed by Komodo. Change its reviewed configuration in homelab-infra.");
  }
}

export function assertDeploymentEditable(): void {
  if (env.managed) throw new ManagedDeploymentError();
}
