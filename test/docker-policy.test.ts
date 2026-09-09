import { expect, it } from "vitest";
import { dockerPolicy } from "../src/runtime/docker-policy.js";

it("keeps network opt-in while giving builds practical resource defaults", () => {
  expect(dockerPolicy({})).toMatchObject({ network: "none", memory: "2g", cpus: 2, pidsLimit: 256, workspaceSize: "1g", tmpSize: "1g" });
  expect(dockerPolicy({ PI_SCOPES_DOCKER_NETWORK: "bridge" }).warning).toContain("host/LAN");
});
it.each([{ PI_SCOPES_DOCKER_NETWORK: "host" }, { PI_SCOPES_DOCKER_MEMORY: "--privileged" }, { PI_SCOPES_DOCKER_CPUS: "NaN" }, { PI_SCOPES_DOCKER_PIDS: "0" }, { PI_SCOPES_DOCKER_TMP: "" }])("rejects invalid owner policy %j", (env) => {
  expect(() => dockerPolicy(env)).toThrow();
});
it("accepts explicit resource sizes without treating defaults as ceilings", () => {
  expect(dockerPolicy({ PI_SCOPES_DOCKER_MEMORY: "8g", PI_SCOPES_DOCKER_WORKSPACE: "4g", PI_SCOPES_DOCKER_TMP: "2g", PI_SCOPES_DOCKER_CPUS: "4", PI_SCOPES_DOCKER_PIDS: "512" })).toMatchObject({ memory: "8g", workspaceSize: "4g", tmpSize: "2g", cpus: 4, pidsLimit: 512 });
});
