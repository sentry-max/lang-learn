export type AppMode = "cloud" | "offline";

/**
 * Reads VITE_APP_MODE from the environment. "offline" runs the app
 * entirely on local browser storage with no Supabase/network calls and no
 * sign-in required; anything else (including unset) runs the normal
 * cloud-backed mode. See .env.example.
 */
export function getAppMode(): AppMode {
  const raw = (import.meta.env.VITE_APP_MODE ?? "cloud").toLowerCase();
  return raw === "offline" ? "offline" : "cloud";
}
