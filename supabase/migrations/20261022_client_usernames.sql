-- ProtVig: preparação para login com nome de usuário.
-- Execute no SQL Editor do projeto Supabase ProtVig antes de ativar o novo formulário.
-- Não altera contas existentes nem remove login por e-mail.
create table if not exists public.client_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint client_usernames_format check (username ~ '^[a-z][a-z0-9._-]{3,31}$'),
  constraint client_usernames_lowercase check (username = lower(username))
);
create unique index if not exists client_usernames_unique_lower on public.client_usernames (lower(username));
alter table public.client_usernames enable row level security;
revoke all on public.client_usernames from anon, authenticated;
-- A tabela é administrada exclusivamente por funções Edge com service_role.
-- Nunca exponha email interno ou service_role ao navegador.
comment on table public.client_usernames is 'Associação privada entre nome de usuário e conta Auth. Acesso apenas por serviço privilegiado.';
