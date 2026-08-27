import { randomBytes } from "node:crypto";

export interface KeyProvider {
  wrap(dataKey: Uint8Array, projectId: string): Promise<string>;
  unwrap(wrappedKey: string, projectId: string): Promise<Uint8Array>;
}

export interface ProjectKeyMaterial {
  dataKey: Uint8Array;
  wrappedKey: string;
}

export async function createProjectKeyMaterial(
  provider: KeyProvider,
  projectId: string,
): Promise<ProjectKeyMaterial> {
  const dataKey = new Uint8Array(randomBytes(32));
  const wrappedKey = await provider.wrap(dataKey, projectId);
  return { dataKey, wrappedKey };
}
