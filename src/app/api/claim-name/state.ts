// In-memory rate limiting map for name claims: IP -> timestamps[]
export const rateLimitMap = new Map<string, number[]>();
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const MAX_CLAIMS_PER_WINDOW = 5;

// In-memory claimed names store: canonicalName -> { userId: string, claimedAt: number }
export const claimedNames = new Map<string, { userId: string; claimedAt: number }>();

export function _resetClaimNameState() {
  rateLimitMap.clear();
  claimedNames.clear();
}
