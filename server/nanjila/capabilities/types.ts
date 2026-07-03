/**
 * Nanjila — capability shared types.
 * Split out so capabilities/index.ts and per-capability handlers avoid
 * circular imports.
 */

export interface UserEntitlement {
  userId:         string | null;
  authenticated:  boolean;
  paid:           boolean;
  admin:          boolean;
  planId:         string | null;
}
