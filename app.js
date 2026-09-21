// ============================================================
// Pizarra de Gestión de Tareas - Lógica principal (Alpine.js)
// Depende de: config.js (constantes), Alpine.js y Supabase JS (CDN)
// ============================================================

// Cliente Supabase (URL y key vienen de config.js, nunca hardcodeadas acá)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------
// Helpers de fecha / formato (funciones globales, usadas también
// directamente desde las expresiones de Alpine en el HTML)
// ------------------------------------------------------------

// Devuelve la diferencia en días (entero) entre hoy y una fecha 'YYYY-MM-DD'
function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(fechaStr + 'T00:00:00');
  return Math.round((limite - hoy) / 86400000);
}

// Texto relativo tipo "vence en 2 días" / "vencida hace 5 días"
function formatFechaRelativa(fechaStr) {
  if (!fechaStr) return 'Sin fecha límite';
  const dias = diasHasta(fechaStr);
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias > 1) return `Vence en ${dias} días`;
  if (dias === -1) return 'Vencida hace 1 día';
  return `Vencida hace ${Math.abs(dias)} días`;
}

function nombreEstado(id) {
  const e = ESTADOS.find((x) => x.id === id);
  return e ? e.nombre : id;
}

function nombrePrioridad(id) {
  const p = PRIORIDADES.find((x) => x.id === id);
  return p ? p.nombre : id;
}

function formatFechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ------------------------------------------------------------
// Componente principal de Alpine
// ------------------------------------------------------------
function app() {
  return {
    // ---------- Estado de sesión ----------
    usuario: null,
    pinInput: '',
    loginError: '',
    loginCargando: false,

    // ---------- Estado general ----------
    cargando: false,
    toast: { visible: false, mensaje: '', tipo: 'info' },
    tabActiva: 'tablero', // tablero | usuarios | log | archivadas

    // ---------- Datos ----------
    tareas: [],
    usuarios: [],
    notasTarea: [],
    logEntradas: [],
    archivadas: [],

    // ---------- Constantes expuestas al template ----------
    ESTADOS,
    PRIORIDADES,
    ETIQUETAS,

    // ---------- Filtros (vista Jefe) ----------
    filtroResponsable: '',
    filtroPrioridad: '',
    filtroEtiqueta: '',
    filtroLogUsuario: '',
    filtroLogAccion: '',

    // ---------- Acordeón kanban (mobile) ----------
    columnasAbiertas: {
      pendiente: true,
      en_ejecucion: true,
      atrasada: true,
      que_paso: true,
      hecha: true,
    },

    // ---------- Modales ----------
    modalNuevaTarea: false,
    nuevaTarea: { titulo: '', descripcion: '', prioridad: 'media', fecha_limite: '', etiqueta: ETIQUETAS[0] || '', responsable_id: '' },
    guardandoNuevaTarea: false,

    tareaSeleccionada: null, // clon editable de la tarea abierta
    modalDetalleAbierto: false,
    guardandoDetalle: false,
    nuevaNotaTexto: '',
    guardandoNota: false,

    modalUsuario: false,
    usuarioForm: { id: null, nombre: '', rol: 'colaborador', pin: '', activo: true },
    guardandoUsuario: false,

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================
    async init() {
      const sesionGuardada = localStorage.getItem('pizarra_usuario');
      if (sesionGuardada) {
        try {
          this.usuario = JSON.parse(sesionGuardada);
        } catch (e) {
          localStorage.removeItem('pizarra_usuario');
        }
      }
      if (this.usuario) {
        await this.cargarTodo();
      }
    },

    // ============================================================
    // LOGIN / LOGOUT
    // ============================================================
    async login() {
      this.loginError = '';
      const pin = this.pinInput.trim();
      if (!/^[0-9]{4,6}$/.test(pin)) {
        this.loginError = 'El PIN debe tener entre 4 y 6 dígitos.';
        return;
      }
      this.loginCargando = true;
      try {
        const { data, error } = await supabaseClient
          .from('usuarios')
          .select('id, nombre, rol')
          .eq('pin', pin)
          .eq('activo', true);

        if (error) throw error;

        if (!data || data.length === 0) {
          this.loginError = 'PIN incorrecto o usuario inactivo.';
          return;
        }
        if (data.length > 1) {
          this.loginError = 'Hay más de un usuario con ese PIN. Avisale al jefe.';
          return;
        }

        this.usuario = data[0];
        localStorage.setItem('pizarra_usuario', JSON.stringify(this.usuario));
        this.pinInput = '';
        await this.cargarTodo();
      } catch (e) {
        this.loginError = 'No se pudo iniciar sesión. Probá de nuevo.';
      } finally {
        this.loginCargando = false;
      }
    },

    logout() {
      localStorage.removeItem('pizarra_usuario');
      this.usuario = null;
      this.tareas = [];
      this.usuarios = [];
      this.logEntradas = [];
      this.archivadas = [];
      this.tabActiva = 'tablero';
    },

    esJefe() {
      return this.usuario && this.usuario.rol === 'jefe';
    },

    // ============================================================
    // CARGA DE DATOS
    // ============================================================
    async cargarTodo() {
      this.cargando = true;
      try {
        await this.marcarAtrasadasRemoto();
        await this.autoArchivarHechas();
        await this.cargarUsuarios();
        await this.cargarTareas();
      } catch (e) {
        this.mostrarToast('No se pudieron cargar los datos. Probá de nuevo.', 'error');
      } finally {
        this.cargando = false;
      }
    },

    // Ejecuta la función SQL que pasa a 'atrasada' las tareas vencidas
    async marcarAtrasadasRemoto() {
      try {
        await supabaseClient.rpc('marcar_atrasadas');
      } catch (e) {
        // No bloquea la carga de la app si falla
      }
    },

    // Archiva automáticamente las tareas 'hecha' con más de DIAS_ARCHIVO días
    async autoArchivarHechas() {
      try {
        const limite = new Date();
        limite.setDate(limite.getDate() - DIAS_ARCHIVO);
        await supabaseClient
          .from('tareas')
          .update({ archivada: true })
          .eq('estado', 'hecha')
          .eq('archivada', false)
          .lt('fecha_hecha', limite.toISOString());
      } catch (e) {
        // No bloquea la carga de la app si falla
      }
    },

    async cargarUsuarios() {
      const { data, error } = await supabaseClient
        .from('usuarios')
        .select('*')
        .order('nombre', { ascending: true });
      if (error) throw error;
      this.usuarios = data || [];
    },

    async cargarTareas() {
      let query = supabaseClient.from('tareas').select('*').eq('archivada', false);
      if (!this.esJefe()) {
        query = query.eq('responsable_id', this.usuario.id);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      this.tareas = data || [];
    },

    async cargarLog() {
      this.cargando = true;
      try {
        const { data, error } = await supabaseClient
          .from('log')
          .select('*, usuarios(nombre)')
          .order('timestamp', { ascending: false })
          .limit(200);
        if (error) throw error;
        this.logEntradas = data || [];
      } catch (e) {
        this.mostrarToast('No se pudo cargar el log.', 'error');
      } finally {
        this.cargando = false;
      }
    },

    async cargarArchivadas() {
      this.cargando = true;
      try {
        const { data, error } = await supabaseClient
          .from('tareas')
          .select('*')
          .eq('archivada', true)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        this.archivadas = data || [];
      } catch (e) {
        this.mostrarToast('No se pudieron cargar las tareas archivadas.', 'error');
      } finally {
        this.cargando = false;
      }
    },

    async cambiarTab(tab) {
      this.tabActiva = tab;
      if (tab === 'log') await this.cargarLog();
      if (tab === 'archivadas') await this.cargarArchivadas();
      if (tab === 'tablero') await this.cargarTareas();
      if (tab === 'usuarios') await this.cargarUsuarios();
    },

    // ============================================================
    // HELPERS DE VISTA
    // ============================================================
    nombreUsuario(id) {
      const u = this.usuarios.find((x) => x.id === id);
      return u ? u.nombre : '—';
    },

    tareasFiltradas() {
      return this.tareas.filter((t) => {
        if (this.filtroResponsable && t.responsable_id !== this.filtroResponsable) return false;
        if (this.filtroPrioridad && t.prioridad !== this.filtroPrioridad) return false;
        if (this.filtroEtiqueta && t.etiqueta !== this.filtroEtiqueta) return false;
        return true;
      });
    },

    tareasPorEstado(estadoId) {
      return this.tareasFiltradas().filter((t) => t.estado === estadoId);
    },

    logFiltrado() {
      return this.logEntradas.filter((l) => {
        if (this.filtroLogUsuario && l.usuario_id !== this.filtroLogUsuario) return false;
        if (this.filtroLogAccion && l.accion !== this.filtroLogAccion) return false;
        return true;
      });
    },

    toggleColumna(estadoId) {
      this.columnasAbiertas[estadoId] = !this.columnasAbiertas[estadoId];
    },

    mostrarToast(mensaje, tipo = 'info') {
      this.toast = { visible: true, mensaje, tipo };
      setTimeout(() => {
        this.toast.visible = false;
      }, 3500);
    },

    // ============================================================
    // NUEVA TAREA
    // ============================================================
    abrirModalNuevaTarea() {
      this.nuevaTarea = {
        titulo: '',
        descripcion: '',
        prioridad: 'media',
        fecha_limite: '',
        etiqueta: ETIQUETAS[0] || '',
        responsable_id: this.esJefe() ? '' : this.usuario.id,
      };
      this.modalNuevaTarea = true;
    },

    cerrarModalNuevaTarea() {
      this.modalNuevaTarea = false;
    },

    async guardarNuevaTarea() {
      if (!this.nuevaTarea.titulo || !this.nuevaTarea.titulo.trim()) {
        this.mostrarToast('El título es obligatorio.', 'error');
        return;
      }
      const responsableId = this.esJefe() ? this.nuevaTarea.responsable_id : this.usuario.id;
      if (!responsableId) {
        this.mostrarToast('Elegí un responsable para la tarea.', 'error');
        return;
      }

      this.guardandoNuevaTarea = true;
      try {
        const payload = {
          titulo: this.nuevaTarea.titulo.trim(),
          descripcion: this.nuevaTarea.descripcion || null,
          prioridad: this.nuevaTarea.prioridad,
          fecha_limite: this.nuevaTarea.fecha_limite || null,
          etiqueta: this.nuevaTarea.etiqueta || null,
          responsable_id: responsableId,
          creado_por: this.usuario.id,
          estado: 'pendiente',
        };
        const { data, error } = await supabaseClient.from('tareas').insert(payload).select().single();
        if (error) throw error;

        await this.registrarLog('crear_tarea', data.id, `${this.usuario.nombre} creó la tarea "${data.titulo}"`);

        this.modalNuevaTarea = false;
        await this.cargarTareas();
        this.mostrarToast('Tarea creada correctamente.', 'exito');
      } catch (e) {
        this.mostrarToast('No se pudo guardar, intentá de nuevo.', 'error');
      } finally {
        this.guardandoNuevaTarea = false;
      }
    },

    // ============================================================
    // DETALLE / EDICIÓN DE TAREA
    // ============================================================
    async abrirDetalle(tarea) {
      this.tareaSeleccionada = { ...tarea };
      this.nuevaNotaTexto = '';
      this.modalDetalleAbierto = true;
      await this.cargarNotas(tarea.id);
    },

    cerrarModalDetalle() {
      this.modalDetalleAbierto = false;
      this.tareaSeleccionada = null;
      this.notasTarea = [];
    },

    puedeEditarTarea(tarea) {
      if (!tarea) return false;
      return this.esJefe() || tarea.responsable_id === this.usuario.id;
    },

    async cargarNotas(tareaId) {
      try {
        const { data, error } = await supabaseClient
          .from('notas')
          .select('*, usuarios(nombre)')
          .eq('tarea_id', tareaId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        this.notasTarea = data || [];
      } catch (e) {
        this.mostrarToast('No se pudieron cargar las notas.', 'error');
      }
    },

    // La tarea está bloqueada para cambiar de estado si está en 'que_paso'
    // y no se agregó ninguna nota nueva desde que entró a ese estado.
    puedeCambiarEstado() {
      const t = this.tareaSeleccionada;
      if (!t) return false;
      if (t.estado !== 'que_paso') return true;
      return this.notasTarea.some((n) => new Date(n.created_at) > new Date(t.updated_at));
    },

    async guardarEdicionTarea() {
      const t = this.tareaSeleccionada;
      if (!t.titulo || !t.titulo.trim()) {
        this.mostrarToast('El título es obligatorio.', 'error');
        return;
      }
      this.guardandoDetalle = true;
      try {
        const payload = {
          titulo: t.titulo.trim(),
          descripcion: t.descripcion || null,
          prioridad: t.prioridad,
          fecha_limite: t.fecha_limite || null,
          etiqueta: t.etiqueta || null,
          updated_at: new Date().toISOString(),
        };
        if (this.esJefe()) {
          payload.responsable_id = t.responsable_id;
        }
        const { error } = await supabaseClient.from('tareas').update(payload).eq('id', t.id);
        if (error) throw error;

        this.cerrarModalDetalle();
        await this.cargarTareas();
        this.mostrarToast('Cambios guardados.', 'exito');
      } catch (e) {
        this.mostrarToast('No se pudo guardar, intentá de nuevo.', 'error');
      } finally {
        this.guardandoDetalle = false;
      }
    },

    async cambiarEstado(nuevoEstado) {
      const t = this.tareaSeleccionada;
      if (!t || t.estado === nuevoEstado) return;

      if (!this.puedeCambiarEstado()) {
        this.mostrarToast('Agregá una nota antes de cambiar de estado.', 'error');
        return;
      }

      this.guardandoDetalle = true;
      try {
        const estadoAnterior = t.estado;
        const payload = { estado: nuevoEstado, updated_at: new Date().toISOString() };
        if (nuevoEstado === 'hecha') {
          payload.fecha_hecha = new Date().toISOString();
        } else if (estadoAnterior === 'hecha') {
          payload.fecha_hecha = null;
        }

        const { error } = await supabaseClient.from('tareas').update(payload).eq('id', t.id);
        if (error) throw error;

        await this.registrarLog(
          'cambio_estado',
          t.id,
          `${this.usuario.nombre} movió "${t.titulo}" de ${nombreEstado(estadoAnterior)} a ${nombreEstado(nuevoEstado)}`
        );

        t.estado = nuevoEstado;
        t.updated_at = payload.updated_at;
        await this.cargarTareas();
        this.mostrarToast(`Tarea movida a "${nombreEstado(nuevoEstado)}".`, 'exito');
      } catch (e) {
        this.mostrarToast('No se pudo cambiar el estado, intentá de nuevo.', 'error');
      } finally {
        this.guardandoDetalle = false;
      }
    },

    async agregarNota() {
      const texto = this.nuevaNotaTexto.trim();
      if (!texto) return;
      this.guardandoNota = true;
      try {
        const { error } = await supabaseClient.from('notas').insert({
          tarea_id: this.tareaSeleccionada.id,
          usuario_id: this.usuario.id,
          texto,
        });
        if (error) throw error;
        this.nuevaNotaTexto = '';
        await this.cargarNotas(this.tareaSeleccionada.id);
      } catch (e) {
        this.mostrarToast('No se pudo guardar la nota, intentá de nuevo.', 'error');
      } finally {
        this.guardandoNota = false;
      }
    },

    async archivarTareaManual() {
      if (!this.esJefe() || !this.tareaSeleccionada) return;
      try {
        const { error } = await supabaseClient
          .from('tareas')
          .update({ archivada: true })
          .eq('id', this.tareaSeleccionada.id);
        if (error) throw error;
        this.cerrarModalDetalle();
        await this.cargarTareas();
        this.mostrarToast('Tarea archivada.', 'exito');
      } catch (e) {
        this.mostrarToast('No se pudo archivar la tarea.', 'error');
      }
    },

    async eliminarTarea() {
      if (!this.esJefe() || !this.tareaSeleccionada) return;
      if (!confirm('¿Seguro que querés eliminar esta tarea? No se puede deshacer.')) return;
      try {
        const { error } = await supabaseClient.from('tareas').delete().eq('id', this.tareaSeleccionada.id);
        if (error) throw error;
        this.cerrarModalDetalle();
        await this.cargarTareas();
        this.mostrarToast('Tarea eliminada.', 'exito');
      } catch (e) {
        this.mostrarToast('No se pudo eliminar la tarea.', 'error');
      }
    },

    async desarchivar(tarea) {
      try {
        const { error } = await supabaseClient
          .from('tareas')
          .update({ archivada: false })
          .eq('id', tarea.id);
        if (error) throw error;
        await this.cargarArchivadas();
        this.mostrarToast('Tarea desarchivada.', 'exito');
      } catch (e) {
        this.mostrarToast('No se pudo desarchivar la tarea.', 'error');
      }
    },

    // ============================================================
    // LOG
    // ============================================================
    async registrarLog(accion, tareaId, detalle) {
      try {
        await supabaseClient.from('log').insert({
          usuario_id: this.usuario.id,
          accion,
          tarea_id: tareaId,
          detalle,
        });
      } catch (e) {
        // El log no debe bloquear la operación principal
      }
    },

    // ============================================================
    // USUARIOS (solo Jefe)
    // ============================================================
    cantidadJefesActivos(excluirId = null) {
      return this.usuarios.filter((u) => u.rol === 'jefe' && u.activo && u.id !== excluirId).length;
    },

    abrirNuevoUsuario() {
      this.usuarioForm = { id: null, nombre: '', rol: 'colaborador', pin: '', activo: true };
      this.modalUsuario = true;
    },

    editarUsuario(u) {
      this.usuarioForm = { id: u.id, nombre: u.nombre, rol: u.rol, pin: u.pin, activo: u.activo };
      this.modalUsuario = true;
    },

    cerrarModalUsuario() {
      this.modalUsuario = false;
    },

    async guardarUsuario() {
      const f = this.usuarioForm;
      if (!f.nombre || !f.nombre.trim()) {
        this.mostrarToast('El nombre es obligatorio.', 'error');
        return;
      }
      if (!/^[0-9]{4,6}$/.test(f.pin)) {
        this.mostrarToast('El PIN debe tener entre 4 y 6 dígitos.', 'error');
        return;
      }

      // Si se está degradando o desactivando al último jefe activo, bloquear
      if (f.id) {
        const eraJefeActivo = this.usuarios.some((u) => u.id === f.id && u.rol === 'jefe' && u.activo);
        const dejaDeSerJefeActivo = f.rol !== 'jefe' || f.activo === false;
        if (eraJefeActivo && dejaDeSerJefeActivo && this.cantidadJefesActivos(f.id) === 0) {
          this.mostrarToast('No podés dejar al equipo sin ningún Jefe activo.', 'error');
          return;
        }
      }

      this.guardandoUsuario = true;
      try {
        if (f.id) {
          const { error } = await supabaseClient
            .from('usuarios')
            .update({ nombre: f.nombre.trim(), rol: f.rol, pin: f.pin, activo: f.activo })
            .eq('id', f.id);
          if (error) throw error;
        } else {
          const { error } = await supabaseClient.from('usuarios').insert({
            nombre: f.nombre.trim(),
            rol: f.rol,
            pin: f.pin,
            activo: true,
          });
          if (error) throw error;
        }
        this.modalUsuario = false;
        await this.cargarUsuarios();
        this.mostrarToast('Usuario guardado.', 'exito');
      } catch (e) {
        this.mostrarToast('No se pudo guardar, intentá de nuevo.', 'error');
      } finally {
        this.guardandoUsuario = false;
      }
    },

    async toggleActivoUsuario(u) {
      if (u.rol === 'jefe' && u.activo && this.cantidadJefesActivos(u.id) === 0) {
        this.mostrarToast('No podés desactivar al último Jefe activo.', 'error');
        return;
      }
      try {
        const { error } = await supabaseClient.from('usuarios').update({ activo: !u.activo }).eq('id', u.id);
        if (error) throw error;
        await this.cargarUsuarios();
      } catch (e) {
        this.mostrarToast('No se pudo actualizar el usuario.', 'error');
      }
    },

    async eliminarUsuario(u) {
      if (u.rol === 'jefe') {
        this.mostrarToast('No se puede eliminar a un Jefe. Cambiá su rol o desactivalo primero.', 'error');
        return;
      }
      if (!confirm(`¿Eliminar a ${u.nombre}? Esta acción no se puede deshacer.`)) return;
      try {
        const { error } = await supabaseClient.from('usuarios').delete().eq('id', u.id);
        if (error) throw error;
        await this.cargarUsuarios();
        this.mostrarToast('Usuario eliminado.', 'exito');
      } catch (e) {
        this.mostrarToast('No se pudo eliminar el usuario.', 'error');
      }
    },

    // ---------- Exponer helpers de formato al template ----------
    formatFechaRelativa,
    nombreEstado,
    nombrePrioridad,
    formatFechaHora,
  };
}
