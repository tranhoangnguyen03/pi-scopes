import { chmod, mkdir, rm } from "node:fs/promises";

export interface ScratchLease {
  path: string;
  dispose(): Promise<void>;
}

export async function acquireScratch(scratchPath: string): Promise<ScratchLease> {
  await mkdir(scratchPath, { recursive: false, mode: 0o700 });
  await chmod(scratchPath, 0o700);
  let disposed = false;
  return {
    path: scratchPath,
    async dispose() {
      if (disposed) return;
      disposed = true;
      await rm(scratchPath, { recursive: true, force: true });
    },
  };
}
