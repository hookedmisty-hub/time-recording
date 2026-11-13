-- Each account owns its entities. A revision prevents stale devices overwriting changes.
create table public.journal_entities (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 entity_type text not null check (entity_type in ('record','category','project','deliverable','goal','todo','rewards','order')),
 entity_id text not null check (length(entity_id) between 1 and 200),
 payload jsonb not null,
 revision bigint not null default 1,
 deleted boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key (user_id, entity_type, entity_id)
);
alter table public.journal_entities enable row level security;
create policy journal_owner on public.journal_entities
 for select to authenticated using (user_id = (select auth.uid()));
grant select on public.journal_entities to authenticated;
revoke all on public.journal_entities from anon;
revoke insert, update, delete on public.journal_entities from authenticated;

-- The only write entry point checks the expected revision inside the transaction.
create function public.save_journal_entity(
 p_type text, p_id text, p_payload jsonb, p_revision bigint, p_deleted boolean default false
) returns public.journal_entities
language plpgsql security definer set search_path = '' as $$
declare result public.journal_entities;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_revision = 0 then
  insert into public.journal_entities(user_id, entity_type, entity_id, payload, deleted)
  values(auth.uid(), p_type, p_id, p_payload, p_deleted)
  on conflict do nothing returning * into result;
 else
  update public.journal_entities
  set payload = p_payload, deleted = p_deleted, revision = revision + 1, updated_at = now()
  where user_id = auth.uid() and entity_type = p_type and entity_id = p_id and revision = p_revision
  returning * into result;
 end if;
 if result.user_id is null then raise exception 'SYNC_CONFLICT' using errcode = '40001'; end if;
 return result;
end;
$$;
revoke all on function public.save_journal_entity(text,text,jsonb,bigint,boolean) from public, anon;
grant execute on function public.save_journal_entity(text,text,jsonb,bigint,boolean) to authenticated;
