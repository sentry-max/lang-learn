import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getAppMode } from "@infrastructure/config/appMode";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// In offline mode this client is constructed but never called — see
// ServicesContext/AuthContext, which wire up local-storage repositories
// and skip Supabase entirely — so the missing-config warning would just
// be noise.
if (getAppMode() !== "offline" && (!supabaseUrl || !supabaseAnonKey)) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars are missing. Copy .env.example to .env and fill in " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before running the app, " +
      "or set VITE_APP_MODE=offline to run without a backend."
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl ?? "",
  supabaseAnonKey ?? ""
);
