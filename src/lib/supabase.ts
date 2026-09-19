import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Returns true if real Supabase credentials have been configured in .env.local
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("your-project-ref") &&
    !supabaseAnonKey.includes("your-supabase-anon-key")
);

// Fallback to placeholder to prevent client initialization crash when credentials are not yet supplied
const clientUrl = isSupabaseConfigured ? supabaseUrl : "https://placeholder-project.supabase.co";
const clientKey = isSupabaseConfigured ? supabaseAnonKey : "placeholder-anon-key";

export const supabase = createClient(clientUrl, clientKey);
