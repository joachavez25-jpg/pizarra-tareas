// ============================================================
// CONFIGURACIÓN DE LA APP - Pizarra de Gestión de Tareas
// ============================================================
// Completá estos dos valores con los de tu proyecto Supabase:
// Project Settings > API > Project URL / anon public key
// ============================================================

const SUPABASE_URL = 'https://advjyfbxtblplwwhdrmt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_p66Z2DIgtnejbaP-4F8z-Q_eVtBxTx1';

// Días que una tarea "hecha" permanece visible antes de archivarse sola
const DIAS_ARCHIVO = 15;

// Etiquetas disponibles para clasificar tareas.
// Personalizá esta lista según tu equipo. Debe coincidir con los
// valores insertados en la tabla `etiquetas` (sql/setup.sql).
const ETIQUETAS = [
  'General',
  'Ventas',
  'Operaciones',
  'Administración',
  'Personal',
];

// Estados posibles de una tarea, en el orden en que se muestran
// las columnas del kanban.
const ESTADOS = [
  { id: 'pendiente', nombre: 'Pendiente' },
  { id: 'en_ejecucion', nombre: 'En ejecución' },
  { id: 'atrasada', nombre: 'Atrasada' },
  { id: 'que_paso', nombre: '¿Qué pasó?' },
  { id: 'hecha', nombre: 'Hecha' },
];

// Prioridades disponibles
const PRIORIDADES = [
  { id: 'alta', nombre: 'Alta' },
  { id: 'media', nombre: 'Media' },
  { id: 'baja', nombre: 'Baja' },
];
