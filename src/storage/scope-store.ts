import { randomUUID } from "node:crypto";
import { appendFile, chmod, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResultCapsule, ScopeRecord, TraceEvent } from "../core/types.js";
import { SCOPE_SCHEMA_VERSION } from "../core/types.js";

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}

function jsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const encoded = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "bigint") return item.toString();
    if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
    if (typeof item === "object" && item !== null) {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
    }
    return item;
  });
  return encoded === undefined ? null : JSON.parse(encoded) as unknown;
}

export class ScopeStore {
  readonly sessionId: string;
  readonly sessionDir: string;
  private readonly sequence = new Map<string, number>();
  private writes: Promise<void> = Promise.resolve();

  constructor(baseDir: string, sessionId: string) {
    this.sessionId = safeSegment(sessionId);
    this.sessionDir = path.join(baseDir, this.sessionId);
  }

  async initialize(): Promise<void> {
    await mkdir(this.sessionDir, { recursive: true, mode: 0o700 });
    await chmod(this.sessionDir, 0o700);
    await Promise.all([
      mkdir(path.join(this.sessionDir, "scopes"), { recursive: true, mode: 0o700 }),
      mkdir(path.join(this.sessionDir, "traces"), { recursive: true, mode: 0o700 }),
      mkdir(path.join(this.sessionDir, "blobs"), { recursive: true, mode: 0o700 }),
      mkdir(path.join(this.sessionDir, "results"), { recursive: true, mode: 0o700 }),
      mkdir(path.join(this.sessionDir, "scratch"), { recursive: true, mode: 0o700 }),
    ]);
    await this.restoreTraceSequences();
    await writeJsonAtomic(path.join(this.sessionDir, "manifest.json"), {
      schemaVersion: SCOPE_SCHEMA_VERSION,
      sessionId: this.sessionId,
    });
  }

  scopePath(scopeId: string): string {
    return path.join(this.sessionDir, "scopes", `${safeSegment(scopeId)}.json`);
  }

  tracePath(scopeId: string): string {
    return path.join(this.sessionDir, "traces", `${safeSegment(scopeId)}.jsonl`);
  }

  resultPath(scopeId: string): string {
    return path.join(this.sessionDir, "results", `${safeSegment(scopeId)}.json`);
  }

  scratchPath(scopeId: string): string {
    return path.join(this.sessionDir, "scratch", safeSegment(scopeId));
  }

  async removeScratch(scopeId: string): Promise<void> {
    await rm(this.scratchPath(scopeId), { recursive: true, force: true });
  }

  traceRef(scopeId: string): string {
    return `trace://${this.sessionId}/${safeSegment(scopeId)}`;
  }

  resultRef(scopeId: string): string {
    return `result://${this.sessionId}/${safeSegment(scopeId)}`;
  }

  async saveScope(record: ScopeRecord): Promise<void> {
    await writeJsonAtomic(this.scopePath(record.id), record);
  }

  async readScope(scopeId: string): Promise<ScopeRecord | undefined> {
    try {
      return JSON.parse(await readFile(this.scopePath(scopeId), "utf8")) as ScopeRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async listScopes(): Promise<ScopeRecord[]> {
    const dir = path.join(this.sessionDir, "scopes");
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    const records = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(dir, name), "utf8")) as ScopeRecord));
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async appendTrace(scopeId: string, type: string, data: unknown): Promise<TraceEvent> {
    const sequence = (this.sequence.get(scopeId) ?? 0) + 1;
    this.sequence.set(scopeId, sequence);
    const event: TraceEvent = {
      schemaVersion: SCOPE_SCHEMA_VERSION,
      id: randomUUID(),
      sequence,
      scopeId,
      timestamp: new Date().toISOString(),
      type,
      data: jsonSafe(data),
    };
    this.writes = this.writes.then(() => appendFile(this.tracePath(scopeId), `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 }));
    await this.writes;
    return event;
  }

  async readTrace(scopeId: string): Promise<TraceEvent[]> {
    await this.flush();
    try {
      const content = await readFile(this.tracePath(scopeId), "utf8");
      return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as TraceEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async copyBlob(scopeId: string, sourcePath: string, label: string): Promise<string> {
    const name = `${safeSegment(scopeId)}-${Date.now()}-${safeSegment(label)}`;
    const destination = path.join(this.sessionDir, "blobs", name);
    await copyFile(sourcePath, destination);
    await chmod(destination, 0o600);
    return `blob://${this.sessionId}/${name}`;
  }

  async saveEvidenceBlob(scopeId: string, contents: Buffer): Promise<string> {
    const name = `${safeSegment(scopeId)}-${randomUUID()}.log`;
    await writeFile(path.join(this.sessionDir, "blobs", name), contents, { flag: "wx", mode: 0o600 });
    return `blob://${this.sessionId}/${name}`;
  }

  async readEvidenceBlob(scopeId: string, ref: string): Promise<string | undefined> {
    const prefix = `blob://${this.sessionId}/`;
    if (!ref.startsWith(prefix)) return undefined;
    const name = ref.slice(prefix.length);
    if (!name.startsWith(`${safeSegment(scopeId)}-`) || !/^[A-Za-z0-9._-]+$/.test(name)) return undefined;
    try {
      return await readFile(path.join(this.sessionDir, "blobs", name), "utf8");
    } catch {
      // Optional full output: callers explicitly report unavailability and retain the excerpt.
      return undefined;
    }
  }

  async saveResult(capsule: ResultCapsule): Promise<string> {
    await writeJsonAtomic(this.resultPath(capsule.scopeId), capsule);
    return this.resultRef(capsule.scopeId);
  }

  async readResult(scopeId: string): Promise<ResultCapsule | undefined> {
    try {
      return JSON.parse(await readFile(this.resultPath(scopeId), "utf8")) as ResultCapsule;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async flush(): Promise<void> {
    await this.writes;
  }

  private async restoreTraceSequences(): Promise<void> {
    const tracesDir = path.join(this.sessionDir, "traces");
    for (const name of await readdir(tracesDir)) {
      if (!name.endsWith(".jsonl")) continue;
      const content = await readFile(path.join(tracesDir, name), "utf8");
      const lastLine = content.trimEnd().split("\n").at(-1);
      if (!lastLine) continue;
      const event = JSON.parse(lastLine) as Partial<TraceEvent>;
      if (typeof event.scopeId === "string" && typeof event.sequence === "number") {
        this.sequence.set(event.scopeId, event.sequence);
      }
    }
  }
}
