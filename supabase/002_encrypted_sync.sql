-- Atomic encrypted journal commit and retirement of live legacy plaintext rows.
create or replace function public.journal_legacy_token() returns text
language sql security definer set search_path = '' as $$
 select pg_catalog.md5(coalesce(pg_catalog.string_agg(entity_type||':'||pg_catalog.length(entity_id)||':'||entity_id||':'||revision||':'||deleted::text,'|' order by entity_type,entity_id),''))
 from public.journal_entities where user_id=auth.uid() and not(entity_type='order' and entity_id='journal-v2');
$$;
revoke all on function public.journal_legacy_token() from public,anon;
grant execute on function public.journal_legacy_token() to authenticated;
drop function if exists public.save_encrypted_journal(jsonb,bigint);
create or replace function public.save_encrypted_journal(p_payload jsonb,p_revision bigint,p_legacy_token text default null)
returns public.journal_entities
language plpgsql security definer set search_path = '' as $$
declare result public.journal_entities;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 if not exists(select 1 from public.journal_entities where user_id=auth.uid() and entity_type='order' and entity_id='journal-v2' and payload->>'format'='journal-e2ee-v1')
  and p_legacy_token is distinct from public.journal_legacy_token()
 then raise exception 'LEGACY_SYNC_CONFLICT' using errcode='40001'; end if;
 if p_payload->>'format' is distinct from 'journal-e2ee-v1'
  or pg_catalog.jsonb_typeof(p_payload->'keyId') is distinct from 'string'
  or pg_catalog.jsonb_typeof(p_payload->'password') is distinct from 'object'
  or pg_catalog.jsonb_typeof(p_payload->'recovery') is distinct from 'object'
  or pg_catalog.jsonb_typeof(p_payload->'data') is distinct from 'object'
  or p_payload - array['format','keyId','password','recovery','data'] <> '{}'::jsonb
  then raise exception 'Encrypted journal required'; end if;
 if p_revision=0 then
  insert into public.journal_entities(user_id,entity_type,entity_id,payload)
  values(auth.uid(),'order','journal-v2',p_payload)
  on conflict do nothing returning * into result;
 else
  update public.journal_entities set payload=p_payload,revision=revision+1,deleted=false,updated_at=now()
  where user_id=auth.uid() and entity_type='order' and entity_id='journal-v2' and revision=p_revision
  returning * into result;
 end if;
 if result.user_id is null then raise exception 'SYNC_CONFLICT' using errcode='40001'; end if;
 -- Scrub legacy live payloads in the same transaction; old backups may still exist.
 update public.journal_entities set payload='{}'::jsonb,entity_id=pg_catalog.gen_random_uuid()::text,deleted=true,revision=revision+1,updated_at=now()
 where user_id=auth.uid() and not(entity_type='order' and entity_id='journal-v2')
 and (not deleted or payload <> '{}'::jsonb);
 return result;
end; $$;
revoke all on function public.save_encrypted_journal(jsonb,bigint,text) from public,anon;
grant execute on function public.save_encrypted_journal(jsonb,bigint,text) to authenticated;

-- Existing v3.2 clients must not reintroduce plaintext after this account migrates.
create or replace function public.save_journal_entity(
 p_type text,p_id text,p_payload jsonb,p_revision bigint,p_deleted boolean default false
) returns public.journal_entities
language plpgsql security definer set search_path = '' as $$
declare result public.journal_entities;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.journal_entities where user_id=auth.uid() and entity_type='order'
  and entity_id='journal-v2' and payload->>'format'='journal-e2ee-v1')
 then raise exception 'This account requires encrypted sync. Please update your app.'; end if;
 if p_revision=0 then
  insert into public.journal_entities(user_id,entity_type,entity_id,payload,deleted)
  values(auth.uid(),p_type,p_id,p_payload,p_deleted)
  on conflict do nothing returning * into result;
 else
  update public.journal_entities set payload=p_payload,deleted=p_deleted,revision=revision+1,updated_at=now()
  where user_id=auth.uid() and entity_type=p_type and entity_id=p_id and revision=p_revision
  returning * into result;
 end if;
 if result.user_id is null then raise exception 'SYNC_CONFLICT' using errcode='40001'; end if;
 return result;
end; $$;
