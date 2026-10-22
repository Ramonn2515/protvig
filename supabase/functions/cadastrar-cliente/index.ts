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
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Não autorizado" }, 401);
    const authClient = createClient(url, anonKey);
    const { data: auth, error: authError } = await authClient.auth.getUser(token);
    if (authError || !auth.user) return reply({ error: "Sessão inválida" }, 401);
    const admin = createClient(url, serviceKey);
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError || profile?.role !== "admin") return reply({ error: "Acesso negado" }, 403);

    const body = await req.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const marketIds = body.marketIds;
    if (!/^[a-z][a-z0-9._-]{3,31}$/.test(username) || password.length < 12 ||
        !Array.isArray(marketIds) || marketIds.length === 0 ||
        !marketIds.every((id: unknown) => Number.isSafeInteger(id) && id > 0))
      return reply({ error: "Verifique usuário (4 a 32 caracteres), senha (mínimo 12) e mercados" }, 400);
    const uniqueMarkets = [...new Set(marketIds)];
    const { data: existingMarkets, error: marketError } = await admin.from("markets").select("id").in("id", uniqueMarkets);
    if (marketError || existingMarkets?.length !== uniqueMarkets.length) return reply({ error: "Mercado inválido" }, 400);
    const { data: taken, error: lookupError } = await admin.from("client_usernames").select("user_id").eq("username", username).maybeSingle();
    if (lookupError) return reply({ error: "Erro ao verificar usuário" }, 500);
    if (taken) return reply({ error: "Nome de usuário já utilizado" }, 409);

    // E-mail técnico não é informado nem utilizado pelo cliente. Não habilitar envio de e-mails para este domínio.
    const internalEmail = `client-${crypto.randomUUID()}@protvig.pages.dev`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail, password, email_confirm: true,
    });
    if (createError || !created.user) return reply({ error: createError?.message || "Erro ao criar cliente" }, 400);
    const userId = created.user.id;
    const { error: profileError2 } = await admin.from("profiles").upsert({ id: userId, role: "client" });
    const { error: usernameError } = profileError2 ? { error: profileError2 } : await admin.from("client_usernames").insert({ user_id: userId, username });
    const { error: membershipError } = profileError2 || usernameError ? { error: profileError2 || usernameError } :
      await admin.from("memberships").insert(uniqueMarkets.map(marketId => ({ user_id: userId, market_id: marketId })));
    if (membershipError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
      return reply({ error: cleanupError ? "Cadastro incompleto: verifique o usuário no Supabase" : usernameError?.code === "23505" ? "Nome de usuário já utilizado" : "Não foi possível concluir o cadastro" }, 500);
    }
    return reply({ success: true, userId, username, message: "Cliente cadastrado com sucesso" });
  } catch {
    return reply({ error: "Não foi possível processar a solicitação" }, 500);
  }
});
