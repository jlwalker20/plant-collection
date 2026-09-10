import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The anon key is meant to be public — it ships inside every Supabase web app.
 * It grants nothing on its own: Row Level Security requires a signed-in user
 * for every read and write, and sign-ups are disabled, so only the accounts you
 * created by hand can touch the data.
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const isConfigured = Boolean(supabase);
