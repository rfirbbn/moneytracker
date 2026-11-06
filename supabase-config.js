// ===== MoneyTrack - Supabase connection =====
// The URL and the publishable key are meant to be public (safe in front-end code).
// NEVER put the "secret" / "service_role" key in this file.

const SUPABASE_URL = "https://eifewsjoikueoudppqkx.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tb9bo9JtBOywyYICWJUsYg_2BeeeB0T";

// (named "db" because the library itself already uses the name "supabase")
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
