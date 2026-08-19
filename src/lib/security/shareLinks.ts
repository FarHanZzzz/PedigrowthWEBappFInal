import { createHash, randomBytes } from 'crypto';

export interface ShareLinkPolicy {
  expiresHours: number;
  maxAccesses: number | null;
}

export interface NormalizedShareLinkPolicy {
  expiresHours: number;
  maxAccesses: number | null;
}

export function generateShareToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeSharePolicy(policy?: Partial<ShareLinkPolicy>): NormalizedShareLinkPolicy {
  const expiresHoursRaw = Number(policy?.expiresHours ?? 72);
  const maxAccessesRaw = policy?.maxAccesses;

  const expiresHours = Number.isFinite(expiresHoursRaw)
    ? Math.min(168, Math.max(1, Math.floor(expiresHoursRaw)))
    : 72;

  let maxAccesses: number | null = null;
  if (maxAccessesRaw !== null && maxAccessesRaw !== undefined) {
    const parsed = Number(maxAccessesRaw);
    if (Number.isFinite(parsed)) {
      maxAccesses = Math.min(100, Math.max(1, Math.floor(parsed)));
    }
  }

  return {
    expiresHours,
    maxAccesses,
  };
}

export function computeExpiryDate(expiresHours: number): string {
  return new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();
}
