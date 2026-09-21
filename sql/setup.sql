-- ============================================================
-- Pizarra de Gestión de Tareas - Esquema de base de datos
-- Ejecutar completo en Supabase > SQL Editor > New query
-- ============================================================

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLA: etiquetas
-- ============================================================
create table if not exists etiquetas (
    id serial primary key,
    nombre text unique not null
  );

-- ============================================================
-- TABLA: usuarios
-- ============================================================
create table if not exists usuarios (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    rol text not null check (rol in ('jefe', 'colaborador')),
    pin text not null check (pin ~ '^[0-9]{4,6}$'),
    activo boolean not null default true,
    created_at timestamptz not null default now()
  );

-- ============================================================
-- TABLA: tareas
-- ============================================================
create table if not exists tareas (
    id uuid primary key default gen_random_uuid(),
    titulo text not null,
    descripcion text,
    responsable_id uuid references usuarios(id),
    estado text not null default 'pendiente'
      check (estado in ('pendiente', 'en_ejecucion', 'atrasada', 'hecha', 'que_paso')),
    prioridad text not null default 'media'
      check (prioridad in ('alta', 'media', 'baja')),
    fecha_limite date,
    etiqueta text references etiquetas(nombre),
    creado_por uuid references usuarios(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archivada boolean not null default false,
    fecha_hecha timestamptz
  );

-- ============================================================
-- TABLA: notas
-- ============================================================
create table if not exists notas (
    id uuid primary key default gen_random_uuid(),
    tarea_id uuid references tareas(id) on delete cascade,
    usuario_id uuid references usuarios(id),
    texto text not null,
    created_at timestamptz not null default now()
  );

-- ============================================================
-- TABLA: log
-- ============================================================
create table if not exists log (
    id uuid primary key default gen_random_uuid(),
    "timestamp" timestamptz not null default now(),
    usuario_id uuid references usuarios(id),
    accion text not null check (accion in ('crear_tarea', 'cambio_estado')),
    tarea_id uuid references tareas(id) on delete set null,
    detalle text
  );

-- Índices útiles para las consultas más frecuentes
create index if not exists idx_tareas_responsable on tareas(responsable_id);
create index if not exists idx_tareas_estado on tareas(estado);
create index if not exists idx_tareas_archivada on tareas(archivada);
create index if not exists idx_notas_tarea on notas(tarea_id);
create index if not exists idx_log_timestamp on log("timestamp" desc);

-- ============================================================
-- FUNCIÓN: marcar_atrasadas
-- Marca como 'atrasada' toda tarea vigente cuya fecha límite ya pasó.
-- Se invoca desde app.js cada vez que se carga la app.
-- ============================================================
create or replace function marcar_atrasadas()
returns void as $$
begin
  update tareas
  set estado = 'atrasada',
      updated_at = now()
  where fecha_limite < current_date
    and estado in ('pendiente', 'en_ejecucion')
    and archivada = false;
end;
$$ language plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- IMPORTANTE - Trade-off de seguridad:
-- Esta app usa autenticación propia por PIN (no Supabase Auth),
-- por lo que RLS no puede filtrar por auth.uid(). Se habilita RLS
-- en todas las tablas y se define una política abierta para la
-- clave "anon" (lectura y escritura), delegando el control de
-- acceso a la lógica de app.js (qué tareas mostrar, qué botones
-- habilitar según el rol del usuario logueado).
--
-- Esto significa que, técnicamente, cualquiera que obtenga tu
-- anon key (visible en config.js, es pública por diseño) podría
-- leer/escribir datos directamente contra la API de Supabase sin
-- pasar por la app. Para un equipo interno de 4 personas con datos
-- de baja sensibilidad esto es un riesgo aceptable a cambio de
-- $0 de costo y cero backend propio. Si esto cambia, migrar a
-- Supabase Auth + políticas RLS por auth.uid().
-- ============================================================

alter table usuarios enable row level security;
alter table tareas enable row level security;
alter table notas enable row level security;
alter table log enable row level security;
alter table etiquetas enable row level security;

-- Políticas abiertas para anon (lectura y escritura general)
create policy "usuarios_select" on usuarios for select using (true);
create policy "usuarios_insert" on usuarios for insert with check (true);
create policy "usuarios_update" on usuarios for update using (true);

create policy "tareas_select" on tareas for select using (true);
create policy "tareas_insert" on tareas for insert with check (true);
create policy "tareas_update" on tareas for update using (true);
create policy "tareas_delete" on tareas for delete using (true);

create policy "notas_select" on notas for select using (true);
create policy "notas_insert" on notas for insert with check (true);

create policy "log_select" on log for select using (true);
create policy "log_insert" on log for insert with check (true);

create policy "etiquetas_select" on etiquetas for select using (true);
create policy "etiquetas_insert" on etiquetas for insert with check (true);

-- Refuerzo mínimo: impedir el DELETE de usuarios con rol 'jefe'
-- directamente desde SQL/API (la app tampoco debe exponer esa acción,
-- pero esto la bloquea igual aunque alguien la intente vía API REST).
create policy "usuarios_no_delete_jefe" on usuarios for delete
  using (rol <> 'jefe');

-- ============================================================
-- SEED INICIAL
-- ============================================================

-- Etiquetas base (personalizá esta lista según tu equipo)
insert into etiquetas (nombre) values
  ('General'),
  ('Ventas'),
  ('Operaciones'),
  ('Administración'),
  ('Personal')
on conflict (nombre) do nothing;

-- Usuario inicial: Jefe con PIN 1234
-- TODO: cambiar este PIN al primer login desde la pestaña "Usuarios"
insert into usuarios (nombre, rol, pin, activo) values
  ('Jefe', 'jefe', '1234', true)
on conflict do nothing;
