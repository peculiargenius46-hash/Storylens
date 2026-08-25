import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Uses the SERVICE ROLE key, which bypasses Row Level Security entirely.
 * NEVER import this into a Client Component or expose it to the browser.
 * Only for trusted server code: API routes, webhooks, the public share page.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
