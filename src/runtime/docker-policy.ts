import type { DockerPolicy } from "../core/types.js";

export function dockerPolicy(env: NodeJS.ProcessEnv = process.env): DockerPolicy {
  const network = env.PI_SCOPES_DOCKER_NETWORK ?? "none";
  if (network !== "none" && network !== "bridge") throw new Error("PI_SCOPES_DOCKER_NETWORK must be none or bridge (not host); no fallback used.");
  const size = (key: string, fallback: string) => {
    const value = env[key] ?? fallback;
    if (!/^[1-9][0-9]{0,5}[mg]$/.test(value)) throw new Error(`${key} must be a positive integer size ending in m or g`);
    return value;
  };
  const number = (key: string, fallback: number, integer = false) => {
    const value = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isSafeInteger(value))) throw new Error(`${key} must be a positive ${integer ? "integer" : "number"}`);
    return value;
  };
  return { network, memory: size("PI_SCOPES_DOCKER_MEMORY", "2g"), cpus: number("PI_SCOPES_DOCKER_CPUS", 2),
    pidsLimit: number("PI_SCOPES_DOCKER_PIDS", 256, true), workspaceSize: size("PI_SCOPES_DOCKER_WORKSPACE", "1g"), tmpSize: size("PI_SCOPES_DOCKER_TMP", "1g"),
    ...(network === "bridge" ? { warning: "Bridge networking can reach host/LAN/Internet; it is not domain-filtered. No host credentials are forwarded." } : {}) };
}
