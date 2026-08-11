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

-- Inicialización única: Yunier es el superadmin global.
insert into public.super_admin_users (singleton, user_id)
values (true, 'f6b013fe-f1a9-494c-a081-4fcc47df4913')
on conflict (singleton) do update set user_id = excluded.user_id;
