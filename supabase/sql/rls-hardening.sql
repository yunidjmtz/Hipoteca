-- Endurecimiento auditado del esquema inmobiliario remoto.
--
-- El historial remoto precede al repositorio. Revisar y aplicar explícitamente
-- con `supabase db query --linked --file supabase/sql/rls-hardening.sql`;
-- nunca con `supabase db push` ni `migration repair`.

begin;

-- Una cuenta pertenece como máximo a una inmobiliaria, tal como asumen la API
-- y `agentContext(...).maybeSingle()`.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agency_users_user_id_key'
      and conrelid = 'public.agency_users'::regclass
  ) then
    alter table public.agency_users
      add constraint agency_users_user_id_key unique (user_id);
  end if;
end;
$$;

-- Las cotas de la Edge Function también viven en la base para que no puedan
-- eludirse usando directamente la Data API con la clave publicable.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_invitation_codes_limits_check'
      and conrelid = 'public.agency_invitation_codes'::regclass
  ) then
    alter table public.agency_invitation_codes
      add constraint agency_invitation_codes_limits_check check (
        max_uses between 1 and 10000
        and uses_count between 0 and max_uses
        and code ~ '^CASA-[A-Z0-9]{4,12}$'
        and (expires_at is null or expires_at > created_at)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_properties_limits_check'
      and conrelid = 'public.agency_properties'::regclass
  ) then
    alter table public.agency_properties
      add constraint agency_properties_limits_check check (
        price_cents between 1 and 100000000000
        and area_m2 between 1 and 10000
        and bedrooms between 0 and 100
        and bathrooms between 0 and 100
        and (latitude is null or latitude between -90 and 90)
        and (longitude is null or longitude between -180 and 180)
        and length(btrim(title)) between 1 and 300
        and length(btrim(zone)) between 1 and 300
        and length(btrim(description)) between 1 and 10000
        and length(main_image_url) between 1 and 1500000
        and length(listing_url) between 1 and 2048
        and cardinality(gallery_urls) <= 12
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'real_estate_agencies_limits_check'
      and conrelid = 'public.real_estate_agencies'::regclass
  ) then
    alter table public.real_estate_agencies
      add constraint real_estate_agencies_limits_check check (
        length(btrim(name)) between 1 and 200
        and length(btrim(brand)) between 1 and 200
        and length(coalesce(website, '')) <= 2048
        and length(coalesce(address, '')) <= 500
        and length(coalesce(phone, '')) <= 32
        and length(coalesce(contact_email, '')) <= 320
        and length(coalesce(logo_url, '')) <= 1500000
      );
  end if;
end;
$$;

-- Solo una vivienda publicada de la inmobiliaria vinculada puede convertirse
-- en favorito. La función evita recursión entre la política de favoritos y la
-- política que conserva la lectura de favoritos retirados.
create or replace function public.can_add_agency_favorite(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_properties property
    join public.real_estate_agencies agency on agency.id = property.agency_id
    join public.client_agency_links link
      on link.agency_id = property.agency_id
     and link.client_id = auth.uid()
    where property.id = p_property_id
      and property.status = 'published'
      and agency.active
  );
$$;

-- Los códigos solo se modifican mediante las funciones atómicas que dejan
-- auditoría. Un agente conserva lectura de los códigos de su inmobiliaria.
drop policy if exists "agents manage their codes" on public.agency_invitation_codes;
drop policy if exists "agents read their codes" on public.agency_invitation_codes;
create policy "agents read their codes"
  on public.agency_invitation_codes for select
  to authenticated
  using (public.is_agency_member(agency_id));

-- El vínculo se crea o cambia exclusivamente dentro de
-- `redeem_agency_invitation_code`; el cliente puede leerlo y eliminarlo.
drop policy if exists "clients manage their active link" on public.client_agency_links;
create policy "clients read their active link"
  on public.client_agency_links for select
  to authenticated
  using (client_id = auth.uid());
create policy "clients delete their active link"
  on public.client_agency_links for delete
  to authenticated
  using (client_id = auth.uid());

-- Los favoritos no conceden acceso a una vivienda arbitraria por UUID.
drop policy if exists "clients manage their favorites" on public.client_favorites;
create policy "clients read their favorites"
  on public.client_favorites for select
  to authenticated
  using (client_id = auth.uid());
create policy "clients insert valid favorites"
  on public.client_favorites for insert
  to authenticated
  with check (
    client_id = auth.uid()
    and agency_property_id is not null
    and manual_property is null
    and public.can_add_agency_favorite(agency_property_id)
  );
create policy "clients delete their favorites"
  on public.client_favorites for delete
  to authenticated
  using (client_id = auth.uid());

-- Privilegios mínimos usados por la Edge Function. RLS sigue siendo la barrera
-- de filas; los REVOKE evitan operaciones sin política o ajenas al producto.
revoke all privileges on table
  public.real_estate_agencies,
  public.agency_users,
  public.agency_properties,
  public.agency_invitation_codes,
  public.client_agency_links,
  public.client_favorites,
  public.agency_audit_log,
  public.super_admin_users
from anon, authenticated;

grant select on table public.real_estate_agencies to authenticated;
grant select on table public.agency_users to authenticated;
grant select, insert, update on table public.agency_properties to authenticated;
grant select on table public.agency_invitation_codes to authenticated;
grant select, delete on table public.client_agency_links to authenticated;
grant select, insert, delete on table public.client_favorites to authenticated;
grant select on table public.agency_audit_log to authenticated;
grant select on table public.super_admin_users to authenticated;

-- Retira una operación superadmin antigua que ya no usa la API.
drop function if exists public.create_agency_and_assign_agent(text, text, uuid);

revoke execute on function public.is_agency_member(uuid) from public, anon;
revoke execute on function public.can_read_agency_property(uuid) from public, anon;
revoke execute on function public.can_add_agency_favorite(uuid) from public, anon;
revoke execute on function public.redeem_agency_invitation_code(text) from public, anon;
revoke execute on function public.generate_agency_invitation_code(timestamptz, integer) from public, anon;
revoke execute on function public.revoke_agency_invitation_code(uuid) from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.create_agency(text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.update_agency_details(uuid, text, text, boolean, text, text, text, text, text) from public, anon;
revoke execute on function public.delete_agency(uuid) from public, anon;
revoke execute on function public.list_agency_employees(uuid) from public, anon;
revoke execute on function public.assign_agency_employee(uuid, uuid, public.agency_user_role) from public, anon;
revoke execute on function public.update_agency_employee_role(uuid, uuid, public.agency_user_role) from public, anon;
revoke execute on function public.remove_agency_employee(uuid, uuid) from public, anon;

grant execute on function public.is_agency_member(uuid) to authenticated;
grant execute on function public.can_read_agency_property(uuid) to authenticated;
grant execute on function public.can_add_agency_favorite(uuid) to authenticated;
grant execute on function public.redeem_agency_invitation_code(text) to authenticated;
grant execute on function public.generate_agency_invitation_code(timestamptz, integer) to authenticated;
grant execute on function public.revoke_agency_invitation_code(uuid) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.create_agency(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_agency_details(uuid, text, text, boolean, text, text, text, text, text) to authenticated;
grant execute on function public.delete_agency(uuid) to authenticated;
grant execute on function public.list_agency_employees(uuid) to authenticated;
grant execute on function public.assign_agency_employee(uuid, uuid, public.agency_user_role) to authenticated;
grant execute on function public.update_agency_employee_role(uuid, uuid, public.agency_user_role) to authenticated;
grant execute on function public.remove_agency_employee(uuid, uuid) to authenticated;

commit;
