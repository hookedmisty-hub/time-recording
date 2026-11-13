-- Keep existing clients compatible; new clients receive no ciphertext on save.
create or replace function public.save_encrypted_journal_receipt(
 p_payload jsonb,p_revision bigint,p_legacy_token text default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved public.journal_entities;
begin
 saved:=public.save_encrypted_journal(p_payload,p_revision,p_legacy_token);
 return pg_catalog.jsonb_build_object('revision',saved.revision,'updated_at',saved.updated_at);
end; $$;
revoke all on function public.save_encrypted_journal_receipt(jsonb,bigint,text) from public,anon;
grant execute on function public.save_encrypted_journal_receipt(jsonb,bigint,text) to authenticated;
notify pgrst,'reload schema';
