# Pizarra de Gestión de Tareas

Kanban simple para un equipo fijo de 4 personas (1 Jefe + 3 Colaboradores).
Costo total: **$0**. Sin tarjeta de crédito, sin planes de prueba.

Stack: HTML + CSS + JavaScript vanilla + [Alpine.js](https://alpinejs.dev) (CDN) +
[Supabase](https://supabase.com) (Postgres gratis, CDN) + GitHub Pages (hosting estático).

---

## 1. Crear el proyecto en Supabase

1. Andá a [supabase.com](https://supabase.com) y creá una cuenta (gratis, sin tarjeta).
2. `New project` → elegí un nombre, una contraseña de base de datos (guardala) y la región más cercana.
3. Esperá 1-2 minutos a que se aprovisione el proyecto.

## 2. Copiar las credenciales a `config.js`

1. En el panel de Supabase: `Project Settings` → `API`.
2. Copiá el **Project URL** y la **anon public key**.
3. Abrí `config.js` en este proyecto y reemplazá:

```js
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU-ANON-KEY-AQUI';
```

> La `anon key` es pública por diseño (viaja al navegador de cada usuario), no es un secreto.
> Nunca copies la `service_role key` acá.

## 3. Crear las tablas

1. En Supabase: `SQL Editor` → `New query`.
2. Pegá **todo** el contenido de [`sql/setup.sql`](sql/setup.sql) y ejecutá (`Run`).
3. Esto crea las tablas `usuarios`, `tareas`, `notas`, `log`, `etiquetas`, la función
   `marcar_atrasadas()`, las políticas de RLS, y siembra un usuario `Jefe` con PIN `1234`.

## 4. Personalizar las etiquetas

Editá el array `ETIQUETAS` en `config.js` con las categorías que use tu equipo
(por ejemplo `'Ventas'`, `'Soporte'`, `'Facturación'`...). Si agregás o sacás
etiquetas, actualizá también la tabla `etiquetas` en Supabase (`Table Editor` →
`etiquetas`) para mantenerlas sincronizadas.

## 5. Publicar en GitHub Pages

1. Creá un repositorio nuevo en GitHub (puede ser privado o público).
2. Subí **todos** los archivos de esta carpeta (`index.html`, `config.js`, `app.js`,
   `styles.css`, `manifest.json`, `sw.js`, `sql/`, `README.md`) a la rama `main`.
3. En el repo: `Settings` → `Pages` → en **Build and deployment**, elegí
   `Deploy from a branch`, rama `main`, carpeta `/ (root)` → `Save`.
4. Esperá 1-2 minutos. GitHub te va a mostrar la URL pública
   (algo como `https://tu-usuario.github.io/tu-repo/`).

## 6. Primer ingreso y alta de usuarios

1. Abrí la URL publicada.
2. Ingresá con el PIN inicial **1234** (usuario "Jefe").
3. Andá a la pestaña **Usuarios** → editá al usuario "Jefe" y cambiá su PIN por
   uno que solo vos conozcas (recomendado hacerlo de inmediato).
4. Creá ahí mismo a los 3 colaboradores (`+ Nuevo usuario`), asignándoles nombre,
   rol `Colaborador` y un PIN de 4 a 6 dígitos cada uno.

## 7. Instalar como app en el celular

1. Cada persona abre la URL en su navegador (Chrome en Android, Safari en iPhone).
2. Menú del navegador → **"Añadir a pantalla de inicio"** (o "Instalar app").
3. Queda como un ícono más, se abre en pantalla completa (PWA) y sigue funcionando
   con la misma URL/base de datos que la versión de escritorio.

---

## Cómo usarla

- **Colaborador**: ve solo sus propias tareas en 5 columnas (Pendiente, En ejecución,
  Atrasada, ¿Qué pasó?, Hecha). Puede crear tareas para sí mismo, editarlas, moverlas
  de columna y dejar notas.
- **Jefe**: ve el tablero completo de todo el equipo (con filtros por responsable,
  prioridad y etiqueta), puede crear/editar/borrar/archivar cualquier tarea, gestionar
  usuarios, y revisar el log de actividad y las tareas archivadas.
- **Regla de "¿Qué pasó?"**: si una tarea cae en esa columna, no se puede mover a otro
  estado hasta agregar una nota nueva explicando qué pasó.
- **Archivado automático**: las tareas marcadas como "Hecha" se archivan solas a los
  15 días (configurable en `config.js` con `DIAS_ARCHIVO`).
- **Atrasadas automáticas**: al abrir la app, cualquier tarea vigente cuya fecha límite
  ya pasó se marca sola como "Atrasada".

---

## Seguridad: qué hay que saber

Esta app usa un login propio por PIN contra la tabla `usuarios`, **no** el sistema de
autenticación de Supabase. Por eso las políticas de Row Level Security (RLS) no pueden
filtrar por usuario real (`auth.uid()`): están abiertas para la clave `anon`, y el
control de "quién ve/edita qué" vive en `app.js` (del lado del cliente).

**Trade-off aceptado**: cualquiera que consiga tu `anon key` (visible en `config.js`,
es pública) podría leer o escribir datos directamente contra la API de Supabase sin
pasar por la interfaz. Para un equipo interno de 4 personas con datos de baja
sensibilidad (tareas de trabajo, no datos personales sensibles ni financieros) este
riesgo es razonable a cambio de $0 de costo y cero backend propio.

Como refuerzo mínimo, hay una política SQL que bloquea el `DELETE` de usuarios con
rol `jefe` directamente contra la base, aunque alguien tenga la anon key.

Si en el futuro esto deja de ser aceptable (datos más sensibles, equipo más grande),
la migración natural es a **Supabase Auth** (login con email/password o magic link) +
políticas de RLS basadas en `auth.uid()`.

---

## Troubleshooting

**El proyecto de Supabase está "pausado" / la app no carga datos**
Los proyectos gratis de Supabase se pausan tras ~7 días sin actividad. Solución:
entrá al panel de Supabase, el proyecto se reactiva automáticamente al abrirlo
(puede tardar 1-2 minutos). Después de eso, la app vuelve a funcionar normal.

**Alguien olvidó su PIN**
Como Jefe, andá a la pestaña **Usuarios** → `Editar` en esa persona → escribí un PIN
nuevo → `Guardar`. Si el que se bloqueó es el único Jefe, entrá directo al
`SQL Editor` de Supabase y corré:

```sql
update usuarios set pin = '1234' where rol = 'jefe' and nombre = 'Jefe';
```

(ajustando el `nombre` al que corresponda), y después cambialo desde la app.

**"No se pudo guardar, intentá de nuevo" al crear/editar algo**
Generalmente es la conexión a internet, o que el proyecto de Supabase está pausado
(ver arriba). Revisá la consola del navegador (F12) si el problema persiste.

**La app no aparece como instalable en el celular**
Confirmá que estás accediendo por `https://` (GitHub Pages siempre lo es) y que
`manifest.json` y `sw.js` se subieron correctamente al repositorio.

---

## Estructura de archivos

```
/pizarra-tareas
  ├── index.html          → login por PIN + shell de la SPA
  ├── config.js           → SUPABASE_URL, SUPABASE_ANON_KEY, DIAS_ARCHIVO, ETIQUETAS
  ├── app.js              → lógica principal (Alpine.js + cliente Supabase)
  ├── styles.css          → estilos mobile-first, kanban responsive, dark mode
  ├── sql/setup.sql        → tablas, RLS, función marcar_atrasadas(), seed inicial
  ├── manifest.json        → metadata PWA (iconos SVG inline)
  ├── sw.js                → service worker mínimo para instalación
  └── README.md            → este archivo
```

---

## Checklist post-deploy

- [ ] Tablas creadas (corriste `sql/setup.sql` sin errores)
- [ ] `anon key` y `SUPABASE_URL` configuradas en `config.js`
- [ ] Login con PIN funciona (probaste con `1234`)
- [ ] Nueva tarea se guarda (aparece en la columna "Pendiente")
- [ ] Cambio de estado se refleja (mover una tarjeta entre columnas)
- [ ] Log registra la acción (pestaña "Log" del Jefe muestra la entrada)
- [ ] PWA instalable en móvil ("Añadir a pantalla de inicio" funciona)
