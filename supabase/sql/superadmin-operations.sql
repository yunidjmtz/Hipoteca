-- Administración interna de inmobiliarias. Este proyecto tiene un único
-- superadmin global: el valor `singleton = true` solo permite una fila.
-- Aplicar con `supabase db query --linked --file`, no con `db push`.

create table if not exists public.super_admin_users (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.super_admin_users enable row level security;

drop policy if exists "superadmin reads own membership" on public.super_admin_users;
create policy "superadmin reads own membership"
  on public.super_admin_users for select
  using (user_id = auth.uid());

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.super_admin_users where user_id = auth.uid()
  );
$$;

drop policy if exists "superadmin manages agencies" on public.real_estate_agencies;
create policy "superadmin manages agencies"
  on public.real_estate_agencies for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "superadmin manages agency users" on public.agency_users;
create policy "superadmin manages agency users"
  on public.agency_users for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create or replace function public.create_agency_and_assign_agent(
  p_name text,
  p_brand text,
  p_agent_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency public.real_estate_agencies%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'No tienes permisos para crear inmobiliarias.' using errcode = '42501';
  end if;

  if length(trim(p_name)) = 0 or length(trim(p_brand)) = 0 then
    raise exception 'Indica el nombre y la marca de la inmobiliaria.' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_agent_user_id) then
    raise exception 'No existe la cuenta del agente.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.agency_users where user_id = p_agent_user_id) then
    raise exception 'Esta cuenta ya está asignada a una inmobiliaria.' using errcode = '23505';
  end if;

  insert into public.real_estate_agencies (name, brand, active)
  values (trim(p_name), trim(p_brand), true)
  returning * into v_agency;

  insert into public.agency_users (user_id, agency_id, role)
  values (p_agent_user_id, v_agency.id, 'agent');

  insert into public.agency_audit_log (agency_id, actor_id, action, subject_type, subject_id)
  values (v_agency.id, auth.uid(), 'agency_created', 'agency', v_agency.id);

  return jsonb_build_object(
    'agency', jsonb_build_object('id', v_agency.id, 'name', v_agency.name, 'brand', v_agency.brand)
  );
end;
$$;

create or replace function public.update_agency_details(
  p_agency_id uuid,
  p_name text,
  p_brand text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency public.real_estate_agencies%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'No tienes permisos para modificar inmobiliarias.' using errcode = '42501';
  end if;
  if length(trim(p_name)) = 0 or length(trim(p_brand)) = 0 then
    raise exception 'Indica el nombre y la marca de la inmobiliaria.' using errcode = '22023';
  end if;

  update public.real_estate_agencies
  set name = trim(p_name), brand = trim(p_brand), active = p_active
  where id = p_agency_id
  returning * into v_agency;
  if not found then raise exception 'La inmobiliaria no existe.' using errcode = 'P0001'; end if;

  insert into public.agency_audit_log (agency_id, actor_id, action, subject_type, subject_id)
  values (v_agency.id, auth.uid(), 'agency_updated', 'agency', v_agency.id);
  return jsonb_build_object('agency', jsonb_build_object('id', v_agency.id, 'name', v_agency.name, 'brand', v_agency.brand, 'active', v_agency.active, 'created_at', v_agency.created_at));
end;
$$;

create or replace function public.list_agency_employees(p_agency_id uuid)
returns table (user_id uuid, email text, role public.agency_user_role, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin() then
    raise exception 'No tienes permisos para consultar empleados.' using errcode = '42501';
  end if;
  return query
    select au.user_id, u.email::text, au.role, au.created_at
    from public.agency_users au
    join auth.users u on u.id = au.user_id
    where au.agency_id = p_agency_id
    order by au.created_at asc;
end;
$$;

create or replace function public.assign_agency_employee(
  p_agency_id uuid,
  p_user_id uuid,
  p_role public.agency_user_role default 'agent'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'No tienes permisos para asignar empleados.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.real_estate_agencies where id = p_agency_id) then
    raise exception 'La inmobiliaria no existe.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No existe la cuenta del empleado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.agency_users where user_id = p_user_id) then
    raise exception 'Esta cuenta ya está asignada a una inmobiliaria.' using errcode = '23505';
  end if;

  insert into public.agency_users (user_id, agency_id, role)
  values (p_user_id, p_agency_id, p_role)
  returning created_at into v_created_at;
  insert into public.agency_audit_log (agency_id, actor_id, action, subject_type, subject_id)
  values (p_agency_id, auth.uid(), 'agency_employee_assigned', 'agency_user', p_user_id);
  return jsonb_build_object('user_id', p_user_id, 'role', p_role, 'created_at', v_created_at);
end;
$$;

create or replace function public.update_agency_employee_role(
  p_agency_id uuid,
  p_user_id uuid,
  p_role public.agency_user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'No tienes permisos para modificar empleados.' using errcode = '42501';
  end if;
  update public.agency_users set role = p_role where agency_id = p_agency_id and user_id = p_user_id;
  if not found then raise exception 'El empleado no pertenece a esta inmobiliaria.' using errcode = 'P0001'; end if;
  insert into public.agency_audit_log (agency_id, actor_id, action, subject_type, subject_id)
  values (p_agency_id, auth.uid(), 'agency_employee_role_updated', 'agency_user', p_user_id);
end;
$$;

create or replace function public.remove_agency_employee(p_agency_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'No tienes permisos para retirar empleados.' using errcode = '42501';
  end if;
  delete from public.agency_users where agency_id = p_agency_id and user_id = p_user_id;
  if not found then raise exception 'El empleado no pertenece a esta inmobiliaria.' using errcode = 'P0001'; end if;
  insert into public.agency_audit_log (agency_id, actor_id, action, subject_type, subject_id)
  values (p_agency_id, auth.uid(), 'agency_employee_removed', 'agency_user', p_user_id);
end;
$$;

create or replace function public.delete_agency(p_agency_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'No tienes permisos para eliminar inmobiliarias.' using errcode = '42501';
  end if;
  -- Los favoritos locales se conservan; se elimina el vínculo de los clientes
  -- para evitar que la restricción `ON DELETE RESTRICT` bloquee la operación.
  delete from public.client_agency_links where agency_id = p_agency_id;
  delete from public.real_estate_agencies where id = p_agency_id;
  if not found then raise exception 'La inmobiliaria no existe.' using errcode = 'P0001'; end if;
end;
$$;

-- Inicialización única: Yunier es el superadmin global.
insert into public.super_admin_users (singleton, user_id)
values (true, 'f6b013fe-f1a9-494c-a081-4fcc47df4913')
on conflict (singleton) do update set user_id = excluded.user_id;
