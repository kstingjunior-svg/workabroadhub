import { createClient } from "@supabase/supabase-js";

// 2026-08 SECURITY (RLS audit): the anon key ships in the browser bundle.
// This client is retained ONLY for:
//   • supabase.auth.getSession / onAuthStateChange (used by hooks/use-premium)
//   • supabase.channel(...) realtime subscriptions on RLS-protected tables
//     (my-account.tsx, my-payments.tsx subscribe to payments updates)
//
// DO NOT add any supabase.from(...).insert() / .update() / .delete() calls
// here. All writes to entitlement / role / claim tables MUST go through the
// server so authorization + payment verification runs before the DB mutation.
// Previous helpers (grantAccess, extendOrCreate, hasSubscription, hasAccess,
// trackReferral) were removed because they let any browser directly grant
// themselves paid services by calling supabase.from("user_services").insert.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);
