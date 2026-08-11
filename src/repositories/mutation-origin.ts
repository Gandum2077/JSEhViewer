export const MutationOrigin = {
  user: "user",
  localMaintenance: "localMaintenance",
  remote: "remote",
  upstreamMirror: "upstreamMirror",
  migrationSeed: "migrationSeed",
} as const;

export type MutationOrigin = (typeof MutationOrigin)[keyof typeof MutationOrigin];

export function requireMutationOrigin(origin: MutationOrigin): void {
  if (!Object.values(MutationOrigin).includes(origin)) {
    throw new Error("必须明确指定有效的数据变更来源");
  }
}
