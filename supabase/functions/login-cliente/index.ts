import { createClient } from "npm:@supabase/supabase-js@2";
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "https://protvig.pages.dev",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido" }, 405);
  try {
    const body = await req.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const invalid = { error: "Usuário ou senha inválidos" };
    if (!/^[a-z][a-z0-9._-]{3,31}$/.test(username) || !password || password.length > 256)
      return reply(invalid, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: match, error: lookupError } = await admin.from("client_usernames").select("user_id").eq("username", username).maybeSingle();
    if (lookupError) return reply({ error: "Serviço indisponível" }, 503);
    if (!match) return reply(invalid, 401);
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", match.user_id).single();
    if (profileError || profile?.role !== "client") return reply(invalid, 401);
    const { data: account, error: accountError } = await admin.auth.admin.getUserById(match.user_id);
    if (accountError || !account.user?.email) return reply(invalid, 401);
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signed, error: signError } = await auth.auth.signInWithPassword({ email: account.user.email, password });
    if (signError || !signed.session || signed.user?.id !== match.user_id) return reply(invalid, 401);
    return reply({ access_token: signed.session.access_token, refresh_token: signed.session.refresh_token });
  } catch {
    return reply({ error: "Não foi possível processar a solicitação" }, 500);
  }
});
