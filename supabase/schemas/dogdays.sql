create schema if not exists dogdays;

create table dogdays.throwaway (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  note text not null default ''
);
alter table dogdays.throwaway enable row level security;
create policy throwaway_owner on dogdays.throwaway for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
grant usage on schema dogdays to authenticated, anon;
grant select, insert, update, delete on dogdays.throwaway to authenticated;
