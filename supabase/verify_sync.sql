-- Synthetic accounts and payloads exist only inside this rolled-back transaction.
begin;
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); begin
 insert into auth.users(id) values(a),(b);
 perform set_config('time_recording_test.a',a::text,true);
 perform set_config('time_recording_test.b',b::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('time_recording_test.a'),true);
select public.save_journal_entity('record','synthetic-test','{"title":"synthetic plaintext"}',0,false);
do $$ begin
 begin
  perform public.save_encrypted_journal('{"format":"journal-e2ee-v1","keyId":"synthetic-test","password":{},"recovery":{},"data":{}}',0,'stale-token');
  raise exception 'stale legacy migration accepted';
 exception when serialization_failure then null;
 end;
end $$;
select public.save_encrypted_journal('{"format":"journal-e2ee-v1","keyId":"synthetic-test","password":{},"recovery":{},"data":{}}',0,public.journal_legacy_token());
do $$ begin
 if (select count(*) from public.journal_entities where entity_id='journal-v2')<>1 then raise exception 'own-read failed'; end if;
 if exists(select 1 from public.journal_entities where entity_id='synthetic-test' and (payload<>'{}'::jsonb or not deleted)) then raise exception 'plaintext retirement failed'; end if;
 if exists(select 1 from public.journal_entities where entity_id='synthetic-test') then raise exception 'legacy identifying ID retained'; end if;
 if (select count(*) from public.journal_entities where deleted and payload='{}'::jsonb)<>1 then raise exception 'retired row missing'; end if;
 begin
  perform public.save_encrypted_journal('{"format":"journal-e2ee-v1","keyId":"synthetic-test","password":{},"recovery":{},"data":{}}',0);
  raise exception 'stale write accepted';
 exception when serialization_failure then null;
 end;
 begin
  perform public.save_journal_entity('record','downgrade','{}',0,false);
  raise exception 'plaintext downgrade accepted';
 exception when raise_exception then
  if SQLERRM not like 'This account requires encrypted sync%' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('time_recording_test.b'),true);
do $$ begin
 if exists(select 1 from public.journal_entities) then raise exception 'cross-user read leaked'; end if;
 begin
  perform public.save_encrypted_journal('{"format":"journal-e2ee-v1","keyId":"synthetic-test","password":{},"recovery":{},"data":{}}',1);
  raise exception 'cross-user write accepted';
 exception when serialization_failure then null;
 end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('time_recording_test.a'),true);
do $$ declare receipt jsonb; begin
 receipt:=public.save_encrypted_journal_receipt('{"format":"journal-e2ee-v1","keyId":"synthetic-test","password":{},"recovery":{},"data":{}}',1);
 if receipt - array['revision','updated_at'] <> '{}'::jsonb or receipt->>'revision'<>'2' or receipt->>'updated_at' is null then raise exception 'metadata-only receipt failed'; end if;
 begin
  perform public.save_encrypted_journal_receipt('{"format":"journal-e2ee-v1","keyId":"synthetic-test","password":{},"recovery":{},"data":{}}',1);
  raise exception 'stale receipt write accepted';
 exception when serialization_failure then null;
 end;
end $$;
set local role anon;
do $$ begin
 begin
  perform public.save_encrypted_journal_receipt('{}',0);
  raise exception 'anonymous write accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
select 'PASS: metadata-only receipt, account isolation, anonymous denial, revision conflict, plaintext retirement, downgrade prevention; all test data rolled back' as result;
