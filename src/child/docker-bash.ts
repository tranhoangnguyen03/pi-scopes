import { Type } from "typebox";
import { truncateTail, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ScopeStore } from "../storage/scope-store.js";
import type { DockerRuntime } from "../runtime/docker.js";

const parameters = Type.Object({
  command: Type.String({ description: "Bash command inside the isolated project copy" }),
  timeout: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 300, description: "Command seconds; default 300, additionally bounded by the scope timeout" })),
});

export function dockerBash(runtime: DockerRuntime, cwd: string, store: ScopeStore, scopeId: string, onFailure: (error: string) => void): ToolDefinition<typeof parameters> {
  let remaining = 8 * 1024 * 1024;
  return {
    name: "bash", label: "Isolated Bash",
    executionMode: "sequential",
    description: "Run Bash inside an isolated copy, network off. Use shell commands for all file/search/edit work. Returns exit status (nonzero means command failure) and a bounded output tail. Captured output is retained for parent scope inspect/read. Files disappear at scope end; the harness captures a bounded workspace text patch automatically. Return other needed evidence as command output. No host paths or automatic promotion.",
    promptSnippet: "Run commands and file operations inside the isolated project copy",
    parameters,
    async execute(_id, args, signal, onUpdate) {
      const chunks: Buffer[] = [];
      let capturedBytes = 0;
      let exitCode: number | null = null;
      let failure: string | undefined;
      let announced = false;
      try {
        ({ exitCode } = await runtime.exec(args.command, cwd, {
          ...(signal ? { signal } : {}), ...(args.timeout !== undefined ? { timeout: args.timeout } : {}),
          onData(data) {
            const accepted = data.subarray(0, remaining);
            chunks.push(Buffer.from(accepted));
            capturedBytes += accepted.length;
            remaining -= accepted.length;
            if (!announced) {
              announced = true;
              onUpdate?.({ content: [{ type: "text", text: "Isolated command running" }], details: {} });
            }
            // ponytail: fixed 8 MiB scope output allowance; expose owner tuning if real tasks need more.
            if (accepted.length < data.length) throw new Error("Scope captured-output allowance exhausted (8 MiB)");
          },
        }));
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        onFailure(failure);
      }
      const output = Buffer.concat(chunks);
      const blobRef = await store.saveEvidenceBlob(scopeId, output);
      const tail = truncateTail(output.toString("utf8"), { maxBytes: 6000, maxLines: 200 });
      const status = failure ? `Execution stopped: ${failure}` : `Exit code: ${exitCode}`;
      return {
        content: [{ type: "text", text: `${status}\n${tail.content || "(no output)"}${tail.truncated ? "\n[Output tail shown; full captured output retained for scope inspect/read.]" : ""}` }],
        details: { blobRef, exitCode, capturedBytes, ...(failure ? { error: failure } : {}) },
        ...(failure ? { terminate: true } : {}),
      };
    },
  };
}
