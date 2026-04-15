/**
 * SF Error Types — Typed error hierarchy for diagnostics and crash recovery.
 *
 * All SF-specific errors extend SFError, which carries a stable `code`
 * string suitable for programmatic matching. Error codes are defined as
 * constants so callers can switch on them without string-matching.
 */

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const SF_STALE_STATE = "SF_STALE_STATE";
export const SF_LOCK_HELD = "SF_LOCK_HELD";
export const SF_ARTIFACT_MISSING = "SF_ARTIFACT_MISSING";
export const SF_GIT_ERROR = "SF_GIT_ERROR";
export const SF_MERGE_CONFLICT = "SF_MERGE_CONFLICT";
export const SF_PARSE_ERROR = "SF_PARSE_ERROR";
export const SF_IO_ERROR = "SF_IO_ERROR";

// ─── Base Error ───────────────────────────────────────────────────────────────

export class SFError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SFError";
    this.code = code;
  }
}
