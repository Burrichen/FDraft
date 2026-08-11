/**
 * Stable ID generation for locally-created records (see
 * docs/product-spec.md, "LOCAL PROFILES REPLACE REMOTE ACCOUNTS" — "Keep IDs
 * stable because they will be required for backup/export"). A thin wrapper
 * around `crypto.randomUUID()` rather than calling it inline everywhere, so
 * every layer above it (repositories, application services) can be unit
 * tested against a fake without needing a real `crypto` global.
 */
export interface IdGenerator {
  generate(): string;
}

export class RandomUuidIdGenerator implements IdGenerator {
  generate(): string {
    return crypto.randomUUID();
  }
}

export const defaultIdGenerator: IdGenerator = new RandomUuidIdGenerator();
