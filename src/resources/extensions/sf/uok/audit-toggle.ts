const AUDIT_ENV_KEY = "SF_UOK_AUDIT_ENVELOPE";
const LEGACY_AUDIT_ENV_KEY = "SF_UOK_AUDIT_UNIFIED";

export function setAuditEnvelopeEnabled(enabled: boolean): void {
  process.env[AUDIT_ENV_KEY] = enabled ? "1" : "0";
  process.env[LEGACY_AUDIT_ENV_KEY] = enabled ? "1" : "0";
}

export function isAuditEnvelopeEnabled(): boolean {
  return process.env[AUDIT_ENV_KEY] === "1" || process.env[LEGACY_AUDIT_ENV_KEY] === "1";
}
