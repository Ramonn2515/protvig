import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const cors={"Access-Control-Allow-Origin":"https://protvig.pages.dev","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return reply({error:"Método não permitido"},405);
 try{
  const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return reply({error:"Não autorizado"},401);
  const client=createClient(url,anon);
  const {data:session,error:sessionError}=await client.auth.getUser(token);
  if(sessionError||!session.user)return reply({error:"Sessão inválida"},401);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const {data:actor,error:actorError}=await admin.from("profiles").select("role").eq("id",session.user.id).single();
  if(actorError||actor?.role!=="admin")return reply({error:"Acesso negado"},403);
  const body=await req.json();
  const action=String(body.action||"list");
  if(action==="list"){
   const {data:profiles,error:pError}=await admin.from("profiles").select("id").eq("role","client");
   if(pError)return reply({error:"Falha ao consultar clientes"},500);
   const {data:names,error:nError}=await admin.from("client_usernames").select("user_id,username");
   const {data:links,error:lError}=await admin.from("memberships").select("user_id,market_id");
   if(nError||lError)return reply({error:"Falha ao consultar vínculos"},500);
   const nameMap=new Map((names||[]).map(x=>[x.user_id,x.username]));
   const users=[];
   for(const p of profiles||[]){
    const {data:authUser,error:uError}=await admin.auth.admin.getUserById(p.id);
    if(uError)continue;
    const u=authUser.user;
    users.push({id:p.id,username:nameMap.get(p.id)||null,email:nameMap.has(p.id)?null:u.email||null,marketIds:(links||[]).filter(x=>x.user_id===p.id).map(x=>x.market_id),disabled:!!u.banned_until&&new Date(u.banned_until).getTime()>Date.now()});
   }
   return reply({clients:users});
  }
  const id=String(body.userId||"");
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return reply({error:"Cliente inválido"},400);
  const {data:target,error:targetError}=await admin.from("profiles").select("role").eq("id",id).single();
  if(targetError||target?.role!=="client")return reply({error:"Cliente não encontrado"},404);
  if(action==="delete"){
   if(body.confirmation!=="EXCLUIR")return reply({error:"Confirmação de exclusão inválida"},400);
   const {error:deleteError}=await admin.auth.admin.deleteUser(id);
   if(deleteError)return reply({error:"Não foi possível excluir a conta. Verifique se há vínculos que impedem a exclusão: "+deleteError.message},409);
   const {error:membersError}=await admin.from("memberships").delete().eq("user_id",id);
   const {error:namesError}=await admin.from("client_usernames").delete().eq("user_id",id);
   const {error:profileError}=await admin.from("profiles").delete().eq("id",id);
   if(membersError||namesError||profileError)return reply({success:true,warning:"Conta de acesso excluída. Alguns vínculos residuais precisam de revisão administrativa."});
   return reply({success:true});
  }
  if(action==="password"){
   const password=String(body.password||"");
   if(password.length<8||password.length>256)return reply({error:"Senha deve ter pelo menos 8 caracteres"},400);
   const {error}=await admin.auth.admin.updateUserById(id,{password});
   return error?reply({error:"Não foi possível alterar a senha"},500):reply({success:true});
  }
  if(action==="status"){
   if(typeof body.disabled!=="boolean")return reply({error:"Estado inválido"},400);
   const {error}=await admin.auth.admin.updateUserById(id,{ban_duration:body.disabled?"876000h":"none"});
   return error?reply({error:"Não foi possível alterar o acesso"},500):reply({success:true});
  }
  if(action==="markets"){
   const ids=body.marketIds;
   if(!Array.isArray(ids)||!ids.length||!ids.every((n:unknown)=>Number.isSafeInteger(n)&&n>0))return reply({error:"Selecione pelo menos um mercado válido"},400);
   const unique=[...new Set(ids)];
   const {data:valid,error:validError}=await admin.from("markets").select("id").in("id",unique);
   if(validError||valid?.length!==unique.length)return reply({error:"Mercado inválido"},400);
   const {data:previous,error:readError}=await admin.from("memberships").select("market_id").eq("user_id",id);
   if(readError)return reply({error:"Não foi possível consultar os mercados"},500);
   const existing=new Set((previous||[]).map(x=>x.market_id));
   const requested=new Set(unique);
   const added=unique.filter(n=>!existing.has(n));
   const removed=[...existing].filter(n=>!requested.has(n));
   if(added.length){const {error}=await admin.from("memberships").insert(added.map(market_id=>({user_id:id,market_id})));if(error)return reply({error:"Não foi possível adicionar mercados"},500);}
   if(removed.length){const {error}=await admin.from("memberships").delete().eq("user_id",id).in("market_id",removed);if(error)return reply({error:"Não foi possível remover mercados"},500);}
   return reply({success:true});
  }
  return reply({error:"Operação inválida"},400);
 }catch{return reply({error:"Não foi possível processar a solicitação"},500);}
});
