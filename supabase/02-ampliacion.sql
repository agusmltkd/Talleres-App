-- =====================================================================
--  Wortach Workshops · ampliación (noviembre 2026)
--  Datos de Cursos, uniones taller ↔ centro de Cursos, historial de cambios,
--  ajustes compartidos y fusión de talleres duplicados.
--  Se aplica después de schema.sql. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Copia de Cursos (la envía un gestor de Cursos desde Gestión → Datos de Cursos)
-- Sin DNI, teléfono ni correo de los técnicos.
-- ---------------------------------------------------------------------
create table if not exists public.cursos_centros (
  id        uuid primary key,
  nombre    text not null,
  provincia text,
  contacto  text,
  telefono  text,
  email     text,
  token     uuid,
  creado    timestamptz
);

create table if not exists public.cursos_tecnicos (
  id               uuid primary key,
  centro_id        uuid not null references public.cursos_centros(id) on delete cascade,
  nombre           text not null,
  ultimo_tipo      text,
  ultima_fecha     date,
  renovar_antes    date,
  proximo_curso    date,
  situacion        text not null check (situacion in ('al_dia', 'vence_pronto', 'caducado', 'inscrito', 'sin_formacion')),
  tiene_iniciacion boolean not null default false,
  sin_avisos       boolean not null default false,
  n_cursos         integer not null default 0
);
create index if not exists cursos_tecnicos_centro_idx on public.cursos_tecnicos (centro_id);

-- Qué centro de Cursos es qué taller del mapa. metodo 'descartado' = no es ninguno de los talleres.
create table if not exists public.vinculos_cursos (
  centro_id  uuid primary key references public.cursos_centros(id) on delete cascade,
  taller_id  text references public.talleres(id) on delete cascade,
  metodo     text not null check (metodo in ('auto', 'manual', 'descartado')),
  creado     timestamptz not null default now(),
  creado_por uuid references public.perfiles(id) on delete set null,
  check ((metodo = 'descartado') = (taller_id is null))
);
create index if not exists vinculos_cursos_taller_idx on public.vinculos_cursos (taller_id);

-- Ajustes de la aplicación (última copia de Cursos, revisión del registro aplicada…)
create table if not exists public.ajustes (
  clave           text primary key,
  valor           jsonb not null,
  actualizado     timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id) on delete set null
);

-- Parejas que la dirección ha marcado como «no son el mismo taller»
create table if not exists public.duplicados_ignorados (
  a text not null, b text not null, creado timestamptz not null default now(),
  primary key (a, b)
);

-- ---------------------------------------------------------------------
-- Historial de cambios (se rellena solo con disparadores)
-- ---------------------------------------------------------------------
create table if not exists public.historial (
  id        bigserial primary key,
  fecha     timestamptz not null default now(),
  usuario   uuid references public.perfiles(id) on delete set null,
  tabla     text not null,
  registro  text not null,
  taller_id text,
  accion    text not null check (accion in ('alta', 'cambio', 'baja')),
  antes     jsonb,
  despues   jsonb
);
create index if not exists historial_taller_idx on public.historial (taller_id, fecha desc);
create index if not exists historial_fecha_idx on public.historial (fecha desc);

create or replace function public.anotar_historial() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  d jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  ruido text[] := array['actualizado', 'actualizado_por', 'ultima_visita', 'creado', 'creado_por'];
  k text; a2 jsonb := '{}'; d2 jsonb := '{}';
  tid text; rid text := coalesce(d->>'id', a->>'id');
begin
  tid := case when tg_table_name = 'talleres' then coalesce(d->>'id', a->>'id') else coalesce(d->>'taller_id', a->>'taller_id') end;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(d) loop
      if not (k = any(ruido)) and (a->k) is distinct from (d->k) then
        a2 := a2 || jsonb_build_object(k, a->k); d2 := d2 || jsonb_build_object(k, d->k);
      end if;
    end loop;
    if d2 = '{}'::jsonb then return null; end if;
    a := a2; d := d2;
  end if;
  insert into public.historial (usuario, tabla, registro, taller_id, accion, antes, despues)
  values (auth.uid(), tg_table_name, rid, tid,
          case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end, a, d);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['talleres', 'visitas', 'ventas', 'equipos', 'contactos'] loop
    execute format('drop trigger if exists %1$s_historial on public.%1$s', t);
    execute format('create trigger %1$s_historial after insert or update or delete on public.%1$s for each row execute function public.anotar_historial()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
alter table public.cursos_centros       enable row level security;
alter table public.cursos_tecnicos      enable row level security;
alter table public.vinculos_cursos      enable row level security;
alter table public.ajustes              enable row level security;
alter table public.duplicados_ignorados enable row level security;
alter table public.historial            enable row level security;

revoke all on public.cursos_centros, public.cursos_tecnicos, public.vinculos_cursos, public.ajustes, public.duplicados_ignorados, public.historial from anon;
grant select on public.cursos_centros, public.cursos_tecnicos, public.historial to authenticated;
grant select, insert, update, delete on public.vinculos_cursos, public.ajustes, public.duplicados_ignorados to authenticated;
grant usage on sequence public.historial_id_seq to authenticated;

-- Un comercial ve los centros de Cursos unidos a sus talleres; la dirección, todos.
create or replace function public.puede_ver_centro(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or (public.es_activo() and exists (
    select 1 from public.vinculos_cursos v join public.talleres t on t.id = v.taller_id
    where v.centro_id = c and t.comercial_id = auth.uid()));
$$;
revoke execute on function public.puede_ver_centro(uuid) from public, anon;
grant execute on function public.puede_ver_centro(uuid) to authenticated;

drop policy if exists cursos_centros_leer on public.cursos_centros;
create policy cursos_centros_leer on public.cursos_centros for select to authenticated using (public.puede_ver_centro(id));
drop policy if exists cursos_tecnicos_leer on public.cursos_tecnicos;
create policy cursos_tecnicos_leer on public.cursos_tecnicos for select to authenticated using (public.puede_ver_centro(centro_id));

drop policy if exists vinculos_leer on public.vinculos_cursos;
create policy vinculos_leer on public.vinculos_cursos for select to authenticated using (public.es_admin() or (public.es_activo() and taller_id is not null and public.puede_editar_taller(taller_id)));
drop policy if exists vinculos_escribir on public.vinculos_cursos;
create policy vinculos_escribir on public.vinculos_cursos for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists ajustes_leer on public.ajustes;
create policy ajustes_leer on public.ajustes for select to authenticated using (public.es_activo());
drop policy if exists ajustes_escribir on public.ajustes;
create policy ajustes_escribir on public.ajustes for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists dup_ign on public.duplicados_ignorados;
create policy dup_ign on public.duplicados_ignorados for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists historial_leer on public.historial;
create policy historial_leer on public.historial for select to authenticated
  using (public.es_admin() or (public.es_activo() and (usuario = auth.uid() or (taller_id is not null and public.puede_editar_taller(taller_id)))));

-- ---------------------------------------------------------------------
-- Cargar la copia de Cursos (solo la dirección). Sustituye la copia anterior entera.
-- ---------------------------------------------------------------------
create or replace function public.cargar_cursos(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_c int; n_t int;
begin
  if not public.es_admin() then raise exception 'Solo la dirección puede cargar los datos de Cursos'; end if;
  create temp table _c on commit drop as
    select (x->>'id')::uuid id, x->>'nombre' nombre, x->>'provincia' provincia, x->>'contacto' contacto,
           x->>'telefono' telefono, x->>'email' email, (x->>'token')::uuid token, (x->>'creado')::timestamptz creado
    from jsonb_array_elements(p->'centros') x;
  insert into public.cursos_centros select * from _c
    on conflict (id) do update set nombre = excluded.nombre, provincia = excluded.provincia, contacto = excluded.contacto,
      telefono = excluded.telefono, email = excluded.email, token = excluded.token, creado = excluded.creado;
  delete from public.cursos_centros where id not in (select id from _c);
  get diagnostics n_c = row_count;
  delete from public.cursos_tecnicos where true;
  insert into public.cursos_tecnicos (id, centro_id, nombre, ultimo_tipo, ultima_fecha, renovar_antes, proximo_curso, situacion, tiene_iniciacion, sin_avisos, n_cursos)
    select (x->>'id')::uuid, (x->>'centro_id')::uuid, x->>'nombre', x->>'ultimo_tipo', (x->>'ultima_fecha')::date, (x->>'renovar_antes')::date,
           (x->>'proximo_curso')::date, x->>'situacion', coalesce((x->>'tiene_iniciacion')::boolean, false),
           coalesce((x->>'sin_avisos')::boolean, false), coalesce((x->>'n_cursos')::int, 0)
    from jsonb_array_elements(p->'tecnicos') x
    where (x->>'centro_id')::uuid in (select id from _c);
  get diagnostics n_t = row_count;
  insert into public.ajustes (clave, valor, actualizado, actualizado_por)
    values ('cursos_sync', jsonb_build_object('fecha', now(), 'generado', p->'generado', 'centros', (select count(*) from _c), 'tecnicos', n_t), now(), auth.uid())
    on conflict (clave) do update set valor = excluded.valor, actualizado = now(), actualizado_por = auth.uid();
  return jsonb_build_object('centros', (select count(*) from _c), 'tecnicos', n_t, 'centros_borrados', n_c);
end $$;
revoke execute on function public.cargar_cursos(jsonb) from public, anon;
grant execute on function public.cargar_cursos(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Unir dos talleres duplicados (solo la dirección): todo pasa al que se queda.
-- ---------------------------------------------------------------------
create or replace function public.unir_talleres(p_origen text, p_destino text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.talleres; d public.talleres;
begin
  if not public.es_admin() then raise exception 'Solo la dirección puede unir talleres'; end if;
  if p_origen = p_destino then raise exception 'Es el mismo taller'; end if;
  select * into o from public.talleres where id = p_origen;
  select * into d from public.talleres where id = p_destino;
  if o.id is null or d.id is null then raise exception 'No encuentro uno de los dos talleres'; end if;
  update public.visitas   set taller_id = p_destino where taller_id = p_origen;
  update public.ventas    set taller_id = p_destino where taller_id = p_origen;
  update public.equipos   set taller_id = p_destino where taller_id = p_origen;
  update public.contactos set taller_id = p_destino where taller_id = p_origen;
  update public.vinculos_cursos set taller_id = p_destino where taller_id = p_origen;
  update public.talleres set
    telefono     = coalesce(nullif(d.telefono, ''), o.telefono),
    email        = coalesce(nullif(d.email, ''), o.email),
    web          = coalesce(nullif(d.web, ''), o.web),
    cif          = coalesce(nullif(d.cif, ''), o.cif),
    notas        = trim(both e'\n' from concat_ws(e'\n', nullif(d.notas, ''), nullif(o.notas, ''))),
    estado       = coalesce(nullif(d.estado, ''), o.estado),
    comercial_id = coalesce(d.comercial_id, o.comercial_id),
    redes        = (select coalesce(array_agg(distinct r), '{}') from unnest(d.redes || o.redes) r),
    lat          = case when d.precision in ('exacta', 'manual') or o.precision not in ('exacta', 'manual') then d.lat else o.lat end,
    lon          = case when d.precision in ('exacta', 'manual') or o.precision not in ('exacta', 'manual') then d.lon else o.lon end,
    precision    = case when d.precision in ('exacta', 'manual') or o.precision not in ('exacta', 'manual') then d.precision else o.precision end
  where id = p_destino;
  delete from public.talleres where id = p_origen;
  delete from public.duplicados_ignorados where p_origen in (a, b);
  update public.talleres set ultima_visita = (select max(fecha) from public.visitas where taller_id = p_destino and estado = 'hecha') where id = p_destino;
end $$;
revoke execute on function public.unir_talleres(text, text) from public, anon;
grant execute on function public.unir_talleres(text, text) to authenticated;

revoke execute on function public.anotar_historial() from public, anon, authenticated;

-- Tiempo real para las uniones con Cursos y los ajustes
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.vinculos_cursos; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.ajustes; exception when duplicate_object then null; end;
  end if;
end $$;

-- Resultado rápido de la visita
alter table public.visitas add column if not exists resultado text not null default ''
  check (resultado in ('', 'interesado', 'presupuesto', 'pedido', 'sin_interes', 'no_estaba', 'otro'));

-- ---------------------------------------------------------------------
-- Kilómetros: punto de partida de cada comercial y correcciones por día
-- ---------------------------------------------------------------------
alter table public.perfiles add column if not exists base jsonb;
create table if not exists public.desplazamientos (
  id           uuid primary key default gen_random_uuid(),
  comercial_id uuid not null references public.perfiles(id) on delete cascade,
  fecha        date not null,
  km           numeric(7, 1) not null check (km >= 0 and km < 5000),
  nota         text not null default '',
  creado       timestamptz not null default now(),
  unique (comercial_id, fecha)
);
alter table public.desplazamientos enable row level security;
revoke all on public.desplazamientos from anon;
grant select, insert, update, delete on public.desplazamientos to authenticated;
drop policy if exists desplazamientos_propios on public.desplazamientos;
create policy desplazamientos_propios on public.desplazamientos for all to authenticated
  using (public.es_admin() or (public.es_activo() and comercial_id = auth.uid()))
  with check (public.es_admin() or (public.es_activo() and comercial_id = auth.uid()));
