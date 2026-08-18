-- Operaciones atómicas usadas por hipotecas-api. El historial remoto precede
-- a este repositorio: aplicar este fichero con `supabase db query --linked`,
-- nunca con `supabase db push`.

create or replace function public.generate_agency_invitation_code(
  p_expires_at timestamptz default null,
  p_max_uses integer default 1
)
returns public.agency_invitation_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_code text;
  v_result public.agency_invitation_codes%rowtype;
  v_attempt integer;
begin
  select agency_id into v_agency_id
  from public.agency_users
  where user_id = auth.uid()
    and role in ('agent', 'admin');

  if v_agency_id is null then
    raise exception 'No puedes generar códigos para esta inmobiliaria.' using errcode = '42501';
  end if;
  if p_max_uses not between 1 and 10000 then
    raise exception 'El límite de usos debe estar entre 1 y 10.000.' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'La fecha de caducidad debe ser futura.' using errcode = '22023';
  end if;

  for v_attempt in 1..5 loop
    v_code := 'CASA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.agency_invitation_codes (
        agency_id,
        code,
        expires_at,
        max_uses,
        created_by
      )
      values (v_agency_id, v_code, p_expires_at, p_max_uses, auth.uid())
      returning * into v_result;
      exit;
    exception
      when unique_violation then
        if v_attempt = 5 then raise; end if;
    end;
  end loop;

  insert into public.agency_audit_log (agency_id, actor_id, action, subject_type, subject_id)
  values (
    v_agency_id,
    auth.uid(),
    'invitation_code_generated',
    'invitation_code',
    v_result.id
  );

  return v_result;
end;
$$;

create or replace function public.redeem_agency_invitation_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.agency_invitation_codes%rowtype;
  v_agency public.real_estate_agencies%rowtype;
  v_linked_agency_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;
  if upper(trim(coalesce(p_code, ''))) !~ '^CASA-[A-Z0-9]{4,12}$' then
    raise exception 'El código no es válido.' using errcode = 'P0001';
  end if;

  select * into v_invitation
  from public.agency_invitation_codes
  where code = upper(trim(p_code))
  for update;
  if not found then
    raise exception 'El código no existe.' using errcode = 'P0001';
  end if;

  select * into v_agency
  from public.real_estate_agencies
  where id = v_invitation.agency_id
    and active;
  if not found then
    raise exception 'La inmobiliaria no está disponible.' using errcode = 'P0001';
  end if;

  select agency_id into v_linked_agency_id
  from public.client_agency_links
  where client_id = auth.uid();

  -- Hace idempotente una repetición del mismo canje, por ejemplo tras perderse
  -- la respuesta HTTP. No vuelve a consumir usos ni duplica la auditoría.
  if v_linked_agency_id = v_invitation.agency_id then
    return jsonb_build_object(
      'agency',
      jsonb_build_object('id', v_agency.id, 'name', v_agency.name, 'brand', v_agency.brand)
    );
  end if;

  if v_invitation.status <> 'active' then
    raise exception 'El código ya no está activo.' using errcode = 'P0001';
  end if;
  if v_invitation.expires_at is not null and v_invitation.expires_at <= now() then
    raise exception 'El código ha caducado.' using errcode = 'P0001';
  end if;
  if v_invitation.uses_count >= v_invitation.max_uses then
    raise exception 'El código ya se ha utilizado.' using errcode = 'P0001';
  end if;

  insert into public.client_agency_links (client_id, agency_id)
  values (auth.uid(), v_invitation.agency_id)
  on conflict (client_id) do update
    set agency_id = excluded.agency_id,
        linked_at = now();

  update public.agency_invitation_codes
  set
    uses_count = uses_count + 1,
    status = case
      when uses_count + 1 >= max_uses then 'used'::public.invitation_code_status
      else 'active'::public.invitation_code_status
    end
  where id = v_invitation.id;

  insert into public.agency_audit_log (agency_id, actor_id, action, subject_type, subject_id)
  values (
    v_invitation.agency_id,
    auth.uid(),
    'invitation_code_redeemed',
    'invitation_code',
    v_invitation.id
  );

  return jsonb_build_object(
    'agency',
    jsonb_build_object('id', v_agency.id, 'name', v_agency.name, 'brand', v_agency.brand)
  );
end;
$$;

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
