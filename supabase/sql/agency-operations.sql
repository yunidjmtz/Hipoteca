-- Operaciones atómicas usadas por hipotecas-api. El historial remoto precede
-- a este repositorio: aplicar este fichero con `supabase db query --linked`,
-- nunca con `supabase db push`.

create or replace function public.revoke_agency_invitation_code(p_code_id uuid)
returns public.agency_invitation_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.agency_invitation_codes%rowtype;
  v_result public.agency_invitation_codes%rowtype;
begin
  select * into v_code
  from public.agency_invitation_codes
  where id = p_code_id
  for update;

  if not found then
    raise exception 'El código no existe.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.agency_users
    where user_id = auth.uid()
      and agency_id = v_code.agency_id
      and role in ('agent', 'admin')
  ) then
    raise exception 'No puedes revocar códigos de esta inmobiliaria.' using errcode = '42501';
  end if;

  if v_code.status <> 'active' or v_code.uses_count > 0 then
    raise exception 'Solo se pueden revocar códigos activos que aún no se han usado.' using errcode = 'P0001';
  end if;

  update public.agency_invitation_codes
  set status = 'revoked', revoked_at = now()
  where id = v_code.id
  returning * into v_result;

  insert into public.agency_audit_log (agency_id, actor_id, action, subject_type, subject_id)
  values (v_code.agency_id, auth.uid(), 'invitation_code_revoked', 'invitation_code', v_code.id);

  return v_result;
end;
$$;
