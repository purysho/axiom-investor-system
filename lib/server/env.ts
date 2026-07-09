/**
 * Fail-closed configuration check. Imported by middleware so a misconfigured
 * production deployment errors on the very first request rather than quietly
 * running with the publicly-known dev signing key.
 */
export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "[Axiom] SESSION_SECRET is missing or shorter than 16 characters. Refusing to serve: " +
      "the fallback signing key is published in this repo, so session cookies could be forged. " +
      "Set SESSION_SECRET in your host's environment and redeploy.",
    );
  }
  if (s === "axiom-dev-secret-not-for-production") {
    throw new Error("[Axiom] SESSION_SECRET is set to the dev placeholder. Generate a real random secret.");
  }
}
