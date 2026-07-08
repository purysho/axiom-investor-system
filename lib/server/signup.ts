export function signupsOpen(): boolean {
  const v = (process.env.SIGNUPS_OPEN ?? "true").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
