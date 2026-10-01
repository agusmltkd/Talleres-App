-- =====================================================================
--  Talleres de tacógrafo · esquema de base de datos para Supabase
--  Ejecútalo una sola vez en: Supabase → SQL Editor → New query → Run
-- =====================================================================


-- ---------------------------------------------------------------------
-- Perfiles: una fila por cada usuario que entra en la aplicación
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text,
  nombre    text not null default '',
  rol       text not null default 'comercial' check (rol in ('admin', 'comercial')),
  color     text not null default '#0d6b72',
  activo    boolean not null default true,
  creado    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Talleres
-- ---------------------------------------------------------------------
create table if not exists public.talleres (
  id              text primary key,
  nombre          text not null,
  cif             text,
  direccion       text,
  cp              text,
  poblacion       text,
  provincia       text,
  provc           text,              -- código INE de provincia, o PT / AD
  ccaa            text,
  pais            text not null default 'ES',
  lat             double precision,
  lon             double precision,
  precision       text not null default 'cp' check (precision in ('exacta', 'manual', 'cp', 'zona', 'loc')),
  redes           text[] not null default '{}',
  origen          text not null default 'manual' check (origen in ('reg', 'ipq', 'kmz', 'manual', 'import')),
  en_registro     boolean not null default false,
  tarjetas        integer not null default 0,
  tarjeta_hasta   date,
  estado          text not null default '' check (estado in ('', 'cliente', 'potencial', 'competencia', 'descartado')),
  comercial_id    uuid references public.perfiles(id) on delete set null,
  telefono        text,
  email           text,
  web             text,
  notas           text not null default '',
  ultima_visita   date,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id) on delete set null
);
create index if not exists talleres_comercial_idx on public.talleres (comercial_id);
create index if not exists talleres_provc_idx on public.talleres (provc);

create table if not exists public.contactos (
  id        uuid primary key default gen_random_uuid(),
  taller_id text not null references public.talleres(id) on delete cascade,
  nombre    text not null,
  cargo     text,
  telefono  text,
  email     text,
  notas     text,
  creado    timestamptz not null default now()
);
create index if not exists contactos_taller_idx on public.contactos (taller_id);

create table if not exists public.visitas (
  id           uuid primary key default gen_random_uuid(),
  taller_id    text not null references public.talleres(id) on delete cascade,
  comercial_id uuid references public.perfiles(id) on delete set null,
  fecha        date not null,
  hora         time,
  tipo         text not null default 'visita' check (tipo in ('visita', 'llamada', 'email', 'otro')),
  estado       text not null default 'hecha' check (estado in ('planificada', 'hecha', 'cancelada')),
  resumen      text not null default '',
  proximo_paso text not null default '',
  creado       timestamptz not null default now(),
  creado_por   uuid references public.perfiles(id) on delete set null
);
create index if not exists visitas_taller_idx on public.visitas (taller_id);
create index if not exists visitas_fecha_idx on public.visitas (fecha);

create table if not exists public.ventas (
  id           uuid primary key default gen_random_uuid(),
  taller_id    text not null references public.talleres(id) on delete cascade,
  comercial_id uuid references public.perfiles(id) on delete set null,
  fecha        date not null default current_date,
  tipo         text not null default 'presupuesto' check (tipo in ('presupuesto', 'pedido')),
  estado       text not null default 'abierto' check (estado in ('abierto', 'ganado', 'perdido')),
  concepto     text not null default '',
  importe      numeric(12, 2) not null default 0,
  notas        text,
  creado       timestamptz not null default now(),
  creado_por   uuid references public.perfiles(id) on delete set null
);
create index if not exists ventas_taller_idx on public.ventas (taller_id);

create table if not exists public.equipos (
  id               uuid primary key default gen_random_uuid(),
  taller_id        text not null references public.talleres(id) on delete cascade,
  tipo             text not null,
  marca            text,
  modelo           text,
  n_serie          text,
  fecha_venta      date,
  proxima_revision date,
  notas            text,
  creado           timestamptz not null default now(),
  creado_por       uuid references public.perfiles(id) on delete set null
);
create index if not exists equipos_taller_idx on public.equipos (taller_id);

-- ---------------------------------------------------------------------
-- Funciones de apoyo para los permisos
-- ---------------------------------------------------------------------
create or replace function public.es_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and rol = 'admin');
$$;

-- Un comercial puede trabajar en sus talleres y en los que no tienen comercial.
create or replace function public.puede_editar_taller(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or (public.es_activo() and exists (
    select 1 from public.talleres where id = t and (comercial_id = auth.uid() or comercial_id is null)));
$$;

-- ---------------------------------------------------------------------
-- Disparadores
-- ---------------------------------------------------------------------
-- Cada usuario nuevo de Supabase Auth recibe su perfil (rol comercial).
create or replace function public.nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (new.id, new.email, initcap(replace(split_part(new.email, '@', 1), '.', ' ')))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.nuevo_usuario();

-- Los comerciales no pueden cambiarse el rol ni activarse a sí mismos.
create or replace function public.perfiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() es nulo en el editor SQL de Supabase: ahí no se aplica
  if auth.uid() is not null and not public.es_admin() then
    new.rol := old.rol;
    new.activo := old.activo;
    new.email := old.email;
  end if;
  return new;
end;
$$;
drop trigger if exists perfiles_guard on public.perfiles;
create trigger perfiles_guard before update on public.perfiles
  for each row execute function public.perfiles_guard();

-- Los comerciales solo pueden "quedarse" un taller libre, no reasignarlo,
-- y no tocan los datos que vienen del registro oficial.
create or replace function public.talleres_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.actualizado := now();
  new.actualizado_por := auth.uid();
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.es_admin() then
    if new.comercial_id is distinct from old.comercial_id
       and not (old.comercial_id is null and new.comercial_id = auth.uid())
       and not (old.comercial_id = auth.uid() and new.comercial_id is null) then
      new.comercial_id := old.comercial_id;
    end if;
    new.id := old.id;
    new.origen := old.origen;
    new.en_registro := old.en_registro;
    new.tarjetas := old.tarjetas;
    new.tarjeta_hasta := old.tarjeta_hasta;
    new.cif := old.cif;
  end if;
  return new;
end;
$$;
drop trigger if exists talleres_guard on public.talleres;
create trigger talleres_guard before insert or update on public.talleres
  for each row execute function public.talleres_guard();

-- La fecha de última visita del taller se calcula sola.
create or replace function public.actualizar_ultima_visita() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  t := coalesce(new.taller_id, old.taller_id);
  update public.talleres
     set ultima_visita = (select max(fecha) from public.visitas where taller_id = t and estado = 'hecha')
   where id = t;
  if tg_op = 'UPDATE' and old.taller_id is distinct from new.taller_id then
    update public.talleres
       set ultima_visita = (select max(fecha) from public.visitas where taller_id = old.taller_id and estado = 'hecha')
     where id = old.taller_id;
  end if;
  return null;
end;
$$;
drop trigger if exists visitas_ultima on public.visitas;
create trigger visitas_ultima after insert or update or delete on public.visitas
  for each row execute function public.actualizar_ultima_visita();

-- Quien crea un registro queda anotado.
create or replace function public.anotar_autor() returns trigger
language plpgsql set search_path = public as $$
begin
  new.creado_por := auth.uid();
  return new;
end;
$$;
drop trigger if exists visitas_autor on public.visitas;
create trigger visitas_autor before insert on public.visitas for each row execute function public.anotar_autor();
drop trigger if exists ventas_autor on public.ventas;
create trigger ventas_autor before insert on public.ventas for each row execute function public.anotar_autor();
drop trigger if exists equipos_autor on public.equipos;
create trigger equipos_autor before insert on public.equipos for each row execute function public.anotar_autor();

-- ---------------------------------------------------------------------
-- Seguridad por filas (RLS)
-- ---------------------------------------------------------------------
alter table public.perfiles  enable row level security;
alter table public.talleres  enable row level security;
alter table public.contactos enable row level security;
alter table public.visitas   enable row level security;
alter table public.ventas    enable row level security;
alter table public.equipos   enable row level security;

-- Nadie sin sesión ve nada.
revoke all on public.perfiles, public.talleres, public.contactos, public.visitas, public.ventas, public.equipos from anon;
grant select, insert, update, delete on public.perfiles, public.talleres, public.contactos, public.visitas, public.ventas, public.equipos to authenticated;

-- perfiles
drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_activo());
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin()) with check (id = auth.uid() or public.es_admin());

-- talleres
drop policy if exists talleres_leer on public.talleres;
create policy talleres_leer on public.talleres for select to authenticated using (public.es_activo());
drop policy if exists talleres_crear on public.talleres;
create policy talleres_crear on public.talleres for insert to authenticated
  with check (public.es_admin() or (public.es_activo() and origen = 'manual' and (comercial_id = auth.uid() or comercial_id is null)));
drop policy if exists talleres_editar on public.talleres;
create policy talleres_editar on public.talleres for update to authenticated
  using (public.es_admin() or (public.es_activo() and (comercial_id = auth.uid() or comercial_id is null)))
  with check (public.es_admin() or (public.es_activo() and (comercial_id = auth.uid() or comercial_id is null)));
drop policy if exists talleres_borrar on public.talleres;
create policy talleres_borrar on public.talleres for delete to authenticated using (public.es_admin());

-- contactos, ventas y equipos: se leen todos; se escriben en los talleres propios o libres
do $$
declare t text;
begin
  foreach t in array array['contactos', 'ventas', 'equipos'] loop
    execute format('drop policy if exists %1$s_leer on public.%1$s', t);
    execute format('create policy %1$s_leer on public.%1$s for select to authenticated using (public.es_activo())', t);
    execute format('drop policy if exists %1$s_crear on public.%1$s', t);
    execute format('create policy %1$s_crear on public.%1$s for insert to authenticated with check (public.puede_editar_taller(taller_id))', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_editar on public.%1$s for update to authenticated using (public.puede_editar_taller(taller_id)) with check (public.puede_editar_taller(taller_id))', t);
    execute format('drop policy if exists %1$s_borrar on public.%1$s', t);
    execute format('create policy %1$s_borrar on public.%1$s for delete to authenticated using (public.puede_editar_taller(taller_id))', t);
  end loop;
end $$;

-- visitas: además, cada comercial gestiona siempre las suyas
drop policy if exists visitas_leer on public.visitas;
create policy visitas_leer on public.visitas for select to authenticated using (public.es_activo());
drop policy if exists visitas_crear on public.visitas;
create policy visitas_crear on public.visitas for insert to authenticated
  with check (public.es_admin() or (public.es_activo() and (comercial_id = auth.uid() or public.puede_editar_taller(taller_id))));
drop policy if exists visitas_editar on public.visitas;
create policy visitas_editar on public.visitas for update to authenticated
  using (public.es_admin() or (public.es_activo() and (comercial_id = auth.uid() or creado_por = auth.uid())))
  with check (public.es_admin() or (public.es_activo() and (comercial_id = auth.uid() or creado_por = auth.uid())));
drop policy if exists visitas_borrar on public.visitas;
create policy visitas_borrar on public.visitas for delete to authenticated
  using (public.es_admin() or (public.es_activo() and (comercial_id = auth.uid() or creado_por = auth.uid())));

-- Las funciones de permisos solo las usan usuarios con sesión.
revoke execute on function public.es_activo(), public.es_admin(), public.puede_editar_taller(text) from public, anon;
grant execute on function public.es_activo(), public.es_admin(), public.puede_editar_taller(text) to authenticated;
-- Las funciones de los disparadores no se pueden llamar desde fuera.
revoke execute on function public.nuevo_usuario(), public.perfiles_guard(), public.talleres_guard(), public.actualizar_ultima_visita(), public.anotar_autor() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Tiempo real: los cambios de un comercial aparecen al momento a los demás
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.talleres; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.visitas;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.ventas;   exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.equipos;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.perfiles; exception when duplicate_object then null; end;
  end if;
end $$;

-- =====================================================================
--  Después de crear el primer usuario (el de tu padre) en
--  Authentication → Users, conviértelo en administrador con:
--
--    update public.perfiles set rol = 'admin', nombre = 'Su nombre'
--    where email = 'correo@empresa.com';
-- =====================================================================
