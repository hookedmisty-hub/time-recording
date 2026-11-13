-- Additive migration: existing accounts remain v1 until their next encrypted write.
-- Run after 001, 002 and 003. No plaintext content or entity paths are stored here.
begin;
create table if not exists public.journal_delta_items (
 user_id uuid not null references auth.users(id) on delete cascade,
 token text collate "C" not null check(token ~ '^[A-Za-z0-9_-]{43}$'),
 payload jsonb not null,
 revision bigint not null check(revision>0),
 primary key(user_id,token)
);
create index if not exists journal_delta_revision on public.journal_delta_items(user_id,revision);
alter table public.journal_delta_items enable row level security;
revoke all on public.journal_delta_items from public,anon,authenticated;

-- Stop obsolete clients from replacing the delta index with a full legacy bundle.
create or replace function public.guard_journal_delta_format() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.entity_type='order' and old.entity_id='journal-v2' and old.payload->>'syncFormat'='journal-delta-v1'
 and new.payload->>'syncFormat' is distinct from 'journal-delta-v1'
 then raise exception 'This account uses incremental encrypted sync. Please update your app.'; end if;
 return new;
end; $$;
drop trigger if exists guard_journal_delta_format on public.journal_entities;
create trigger guard_journal_delta_format before update on public.journal_entities
 for each row execute function public.guard_journal_delta_format();

create or replace function public.journal_delta_capability() returns integer
language sql security invoker set search_path='' as $$ select 1; $$;
revoke all on function public.journal_delta_capability() from public,anon;
grant execute on function public.journal_delta_capability() to authenticated;

create or replace function public.read_journal_delta(p_revision bigint,p_since bigint default 0,p_after text default '',p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path='' as $$
declare head public.journal_entities; rows jsonb; more boolean; last_token text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_since is null or p_since<0 or p_limit is null or p_limit<1 or p_limit>200 or p_after is null then raise exception 'Invalid cursor'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into head from public.journal_entities where user_id=auth.uid() and entity_type='order' and entity_id='journal-v2';
 if head.revision is distinct from p_revision or head.deleted or p_since>p_revision or head.payload->>'syncFormat' is distinct from 'journal-delta-v1'
 then raise exception 'SYNC_CONFLICT' using errcode='40001'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('token',s.token,'payload',s.payload,'revision',s.revision) order by s.token collate "C"),'[]'::jsonb),max(s.token collate "C") into rows,last_token
 from (select token,payload,revision from public.journal_delta_items
  where user_id=auth.uid() and revision>p_since and token>p_after collate "C" order by token collate "C" limit p_limit) s;
 select exists(select 1 from public.journal_delta_items where user_id=auth.uid() and revision>p_since and token>last_token collate "C") into more;
 return jsonb_build_object('revision',head.revision,'items',rows,'more',more);
end; $$;
revoke all on function public.read_journal_delta(bigint,bigint,text,integer) from public,anon;
grant execute on function public.read_journal_delta(bigint,bigint,text,integer) to authenticated;

create or replace function public.save_journal_delta(p_payload jsonb,p_revision bigint,p_changes jsonb,p_legacy_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare head public.journal_entities; result public.journal_entities; change jsonb; migrating boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into head from public.journal_entities where user_id=auth.uid() and entity_type='order' and entity_id='journal-v2';
 if p_revision is null or p_revision<0 or coalesce(head.revision,0)<>p_revision or coalesce(head.deleted,false)
 then raise exception 'SYNC_CONFLICT' using errcode='40001'; end if;
 migrating=head.payload->>'syncFormat' is distinct from 'journal-delta-v1';
 if head.payload->>'format' is distinct from 'journal-e2ee-v1' and p_legacy_token is distinct from public.journal_legacy_token()
 then raise exception 'LEGACY_SYNC_CONFLICT' using errcode='40001'; end if;
 if p_payload is null or p_payload->>'format' is distinct from 'journal-e2ee-v1' or p_payload->>'syncFormat' is distinct from 'journal-delta-v1'
 or jsonb_typeof(p_payload->'keyId') is distinct from 'string'
 or jsonb_typeof(p_payload->'password') is distinct from 'object'
 or jsonb_typeof(p_payload->'recovery') is distinct from 'object'
 or jsonb_typeof(p_payload->'data') is distinct from 'object'
 or p_payload-array['format','syncFormat','keyId','password','recovery','data']<>'{}'::jsonb
 or jsonb_typeof(p_changes) is distinct from 'array'
 then raise exception 'Invalid encrypted delta'; end if;
 if head.payload->>'format'='journal-e2ee-v1' and p_payload->>'keyId' is distinct from head.payload->>'keyId'
 then raise exception 'Encryption key changed'; end if;
 if (select count(*) from jsonb_array_elements(p_changes))<>(select count(distinct value->>'token') from jsonb_array_elements(p_changes))
 then raise exception 'Duplicate delta token'; end if;
 if migrating then delete from public.journal_delta_items where user_id=auth.uid(); end if;
 for change in select value from jsonb_array_elements(p_changes) loop
  if change->>'token' is null or change->>'token'!~'^[A-Za-z0-9_-]{43}$' or jsonb_typeof(change->'payload') is distinct from 'object'
   or jsonb_typeof(change->'payload'->'iv') is distinct from 'string' or jsonb_typeof(change->'payload'->'box') is distinct from 'string'
   or change-array['token','payload']<>'{}'::jsonb or (change->'payload')-array['iv','box']<>'{}'::jsonb
  then raise exception 'Invalid encrypted item'; end if;
  insert into public.journal_delta_items(user_id,token,payload,revision) values(auth.uid(),change->>'token',change->'payload',p_revision+1)
  on conflict(user_id,token) do update set payload=excluded.payload,revision=excluded.revision;
 end loop;
 if head.user_id is null then
  insert into public.journal_entities(user_id,entity_type,entity_id,payload,revision) values(auth.uid(),'order','journal-v2',p_payload,1) returning * into result;
 else
  update public.journal_entities set payload=p_payload,revision=p_revision+1,updated_at=now() where user_id=auth.uid() and entity_type='order' and entity_id='journal-v2' returning * into result;
 end if;
 if migrating then
  update public.journal_entities set payload='{}'::jsonb,entity_id=pg_catalog.gen_random_uuid()::text,deleted=true,revision=revision+1,updated_at=now()
   where user_id=auth.uid() and not(entity_type='order' and entity_id='journal-v2') and (not deleted or payload<>'{}'::jsonb);
 end if;
 return jsonb_build_object('revision',result.revision,'updated_at',result.updated_at);
end; $$;
revoke all on function public.save_journal_delta(jsonb,bigint,jsonb,text) from public,anon;
grant execute on function public.save_journal_delta(jsonb,bigint,jsonb,text) to authenticated;
commit;
