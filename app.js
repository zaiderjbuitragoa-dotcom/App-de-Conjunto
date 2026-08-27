/**
 * app.js — Toda la lógica del frontend. Se comunica con el
 * backend de Apps Script exclusivamente por fetch().
 *
 * ⚠️ IMPORTANTE: reemplaza API_URL por la URL de tu implementación
 * de Apps Script (termina en /exec). La obtienes al hacer
 * Implementar → Nueva implementación → Aplicación web.
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbwY0oXQ3OVMg7n5zRepan7yKECqyrPo2TlTcT-V_5FkLQ8Y_ZSOh0q5wDSXpPd8lEBeCQ/exec';

let SESION = null;

function mostrarCargando(v) {
  document.getElementById('cargando').classList.toggle('oculto', !v);
}

// Helper central para llamar al backend. Usamos Content-Type
// text/plain a propósito: evita que el navegador dispare una
// petición OPTIONS de preflight (Apps Script no la responde bien),
// así que la petición POST llega directa.
async function llamarAPI(action, payload) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, payload: payload || {} })
  });
  if (!resp.ok) throw new Error('Error de red: ' + resp.status);
  return resp.json();
}

function hacerLogin() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) return;
  mostrarCargando(true);
  llamarAPI('login', { email: email })
    .then(function (resp) {
      mostrarCargando(false);
      if (!resp.ok) {
        document.getElementById('login-error').innerText = resp.mensaje;
        return;
      }
      SESION = resp;
      document.getElementById('vista-login').classList.add('oculto');
      if (resp.rol === 'Residente') iniciarResidente();
      else if (resp.rol === 'Vigilancia') iniciarVigilancia();
      else if (resp.rol === 'Administrador') iniciarAdmin();
      else alert('Rol no reconocido: ' + resp.rol);
    })
    .catch(function (err) {
      mostrarCargando(false);
      document.getElementById('login-error').innerText = 'Error: ' + err.message;
    });
}

function cerrarSesion() {
  SESION = null;
  location.reload();
}

/* ---------------- REGISTRO ---------------- */
function mostrarRegistro() {
  document.getElementById('vista-login').classList.add('oculto');
  document.getElementById('vista-registro').classList.remove('oculto');
}

function mostrarLogin() {
  document.getElementById('vista-registro').classList.add('oculto');
  document.getElementById('vista-login').classList.remove('oculto');
}

function registrarUsuarioUI() {
  const datos = {
    nombres: document.getElementById('reg-nombres').value.trim(),
    apellidos: document.getElementById('reg-apellidos').value.trim(),
    tipoDocumento: document.getElementById('reg-tipo-doc').value,
    numeroDocumento: document.getElementById('reg-num-doc').value.trim(),
    telefono: document.getElementById('reg-telefono').value.trim(),
    email: document.getElementById('reg-email').value.trim(),
    numeroTorre: document.getElementById('reg-torre').value.trim(),
    numeroApto: document.getElementById('reg-apto').value.trim(),
    tipoRol: document.getElementById('reg-tipo-rol').value,
    autorizacionDatos: document.getElementById('reg-autorizacion').checked
  };

  if (!datos.nombres || !datos.apellidos || !datos.numeroDocumento || !datos.email || !datos.numeroTorre || !datos.numeroApto) {
    document.getElementById('reg-resultado').innerHTML = '<span style="color:var(--rojo)">Completa todos los campos.</span>';
    return;
  }
  if (!datos.autorizacionDatos) {
    document.getElementById('reg-resultado').innerHTML = '<span style="color:var(--rojo)">Debes autorizar el tratamiento de datos.</span>';
    return;
  }

  mostrarCargando(true);
  llamarAPI('registrarUsuario', datos).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('reg-resultado');
    if (!r.ok) {
      el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>';
      return;
    }
    el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ ' + r.mensaje + '</span>';
    setTimeout(mostrarLogin, 2500);
  });
}

/* ---------------- RESIDENTE ---------------- */
function iniciarResidente() {
  document.getElementById('vista-residente').classList.remove('oculto');
  document.getElementById('res-nombre').innerText = SESION.nombre;
  cargarEstadoCuenta();
  cargarMisVisitas();
  cargarComunicadosResidente();
  cargarZonasComunesSelect();
}

function mostrarPanelResidente(panel, btn) {
  ['inicio', 'visitas', 'reservas', 'pagos', 'vehiculos'].forEach(function (p) {
    document.getElementById('res-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-residente .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
  if (panel === 'pagos') cargarHistorialPagos();
  if (panel === 'vehiculos') { cargarMisVehiculos(); cargarMisPQRS(); cargarMisSolicitudesPiscina(); cargarMisMultas(); }
  if (panel === 'reservas') cargarMisReservas();
}

function cargarComunicadosResidente() {
  llamarAPI('getComunicadosActivos', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-comunicados-residente');
      const avisos = r.comunicados || [];
      if (!avisos.length) {
        cont.innerHTML = '<p class="sin-anuncios">No hay avisos por ahora.</p>';
        return;
      }
      cont.innerHTML = '';
      avisos.slice(0, 5).forEach(function (a) {
        cont.innerHTML += '<div class="anuncio-item">' +
          '<div class="anuncio-titulo">' + a.Titulo + '</div>' +
          '<div class="anuncio-texto">' + a.Contenido + '</div>' +
          '<div class="anuncio-fecha">' + a.Fecha_Publicacion + (a.Dirigido_A && a.Dirigido_A !== 'Todos' ? ' · ' + a.Dirigido_A : '') + '</div>' +
          '</div>';
      });
    });
}

function cargarEstadoCuenta() {
  llamarAPI('getEstadoCuenta', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const el = document.getElementById('res-semaforo');
      document.getElementById('res-saldo').innerText = r.saldo.toLocaleString('es-CO');
      if (r.estado === 'Mora') {
        el.className = 'semaforo rojo';
        el.innerText = '🔴 Tienes un saldo pendiente';
      } else {
        el.className = 'semaforo verde';
        el.innerText = '🟢 Estás al día';
      }
    });
}

function registrarVisitaUI() {
  const nombre = document.getElementById('visita-nombre').value;
  const doc = document.getElementById('visita-doc').value;
  const fecha = document.getElementById('visita-fecha').value;
  const hora = document.getElementById('visita-hora').value;
  if (!nombre || !doc || !fecha || !hora) { alert('Completa todos los campos'); return; }
  mostrarCargando(true);
  llamarAPI('registrarVisita', {
    idUsuario: SESION.idUsuario, idApto: SESION.idApto,
    nombre: nombre, documento: doc, fecha: fecha, hora: hora
  }).then(function (r) {
    mostrarCargando(false);
    document.getElementById('visita-resultado').innerText = '✅ Código de visita: ' + r.codigo;
    cargarMisVisitas();
  });
}

function cargarMisVisitas() {
  llamarAPI('getMisVisitas', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-mis-visitas');
      const visitas = r.visitas || [];
      cont.innerHTML = visitas.length ? '' : '<p>No tienes visitas registradas.</p>';
      visitas.forEach(function (v) {
        const badge = v.Estado === 'Ingresó' ? 'ingreso' : 'pendiente';
        cont.innerHTML += '<div class="item-lista"><b>' + v.Nombre_Visitante + '</b> — ' + v.Fecha_Programada +
          ' <span class="badge ' + badge + '">' + v.Estado + '</span></div>';
      });
    });
}

function subirComprobanteUI() {
  const valor = document.getElementById('pago-valor').value;
  const periodo = document.getElementById('pago-periodo').value;
  const archivo = document.getElementById('pago-archivo').files[0];
  if (!valor || !periodo || !archivo) { alert('Completa todos los campos'); return; }

  const lector = new FileReader();
  lector.onload = function () {
    const base64 = lector.result.split(',')[1];
    mostrarCargando(true);
    llamarAPI('subirComprobante', {
      idUsuario: SESION.idUsuario, idApto: SESION.idApto,
      valor: valor, periodo: periodo,
      base64: base64, nombreArchivo: archivo.name, mimeType: archivo.type
    }).then(function () {
      mostrarCargando(false);
      document.getElementById('pago-resultado').innerText = '✅ Comprobante enviado, pendiente de validación.';
      cargarHistorialPagos();
    });
  };
  lector.readAsDataURL(archivo);
}

function cargarHistorialPagos() {
  llamarAPI('getEstadoCuenta', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-pagos');
      const historial = r.historialPagos || [];
      cont.innerHTML = historial.length ? '' : '<p>Sin pagos registrados.</p>';
      historial.forEach(function (p) {
        const clase = p.Estado === 'Validado' ? 'validado' : (p.Estado === 'Rechazado' ? 'rechazado' : 'pendiente');
        cont.innerHTML += '<div class="item-lista">$' + Number(p.Valor).toLocaleString('es-CO') + ' — ' + p.Periodo_Pago +
          ' <span class="badge ' + clase + '">' + p.Estado + '</span></div>';
      });
    });
}

function cargarMisVehiculos() {
  llamarAPI('getMisVehiculos', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-vehiculos');
      const vehiculos = r.vehiculos || [];
      cont.innerHTML = vehiculos.length ? '' : '<p>No tienes vehículos registrados.</p>';
      vehiculos.forEach(function (v) {
        const clase = String(v.Autorizado).toLowerCase() === 'si' ? 'autorizado' : 'no-autorizado';
        const textoEstado = String(v.Autorizado).toLowerCase() === 'si' ? 'Autorizado' : 'Pendiente de autorización';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + v.Placa + '</b> — ' + v.Tipo + (v.Marca ? ' · ' + v.Marca : '') +
          ' <span class="badge ' + clase + '">' + textoEstado + '</span>' +
          '<br><button class="secundario" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="eliminarVehiculoUI(\'' + v.ID_Vehiculo + '\')">Eliminar</button>' +
          '</div>';
      });

      // Oculta el formulario de "Agregar" si ya llegó al máximo de 2
      document.getElementById('form-agregar-vehiculo').classList.toggle('oculto', vehiculos.length >= 2);
    });
}

function registrarVehiculoUI() {
  const placa = document.getElementById('veh-placa').value.trim();
  const tipo = document.getElementById('veh-tipo').value;
  const marca = document.getElementById('veh-marca').value.trim();
  const color = document.getElementById('veh-color').value.trim();
  if (!placa) { alert('Ingresa la placa'); return; }

  mostrarCargando(true);
  llamarAPI('registrarVehiculo', {
    idUsuario: SESION.idUsuario, idApto: SESION.idApto, idPersona: SESION.idPersona,
    placa: placa, tipo: tipo, marca: marca, color: color
  }).then(function (r) {
    mostrarCargando(false);
    if (!r.ok) {
      document.getElementById('veh-resultado').innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>';
      return;
    }
    document.getElementById('veh-resultado').innerText = '✅ Vehículo agregado.';
    document.getElementById('veh-placa').value = '';
    document.getElementById('veh-marca').value = '';
    document.getElementById('veh-color').value = '';
    cargarMisVehiculos();
  });
}

function eliminarVehiculoUI(idVehiculo) {
  if (!confirm('¿Eliminar este vehículo?')) return;
  mostrarCargando(true);
  llamarAPI('eliminarVehiculo', { idUsuario: SESION.idUsuario, idApto: SESION.idApto, idVehiculo: idVehiculo })
    .then(function () {
      mostrarCargando(false);
      cargarMisVehiculos();
    });
}

/* ---------------- RESERVAS / ZONAS COMUNES ---------------- */
function cargarZonasComunesSelect() {
  llamarAPI('getZonasComunes', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const select = document.getElementById('reserva-zona');
      const zonas = r.zonas || [];
      select.innerHTML = zonas.length
        ? zonas.map(function (z) { return '<option value="' + z.ID_Zona + '">' + z.Nombre + '</option>'; }).join('')
        : '<option value="">No hay zonas configuradas todavía</option>';
    });
}

function crearReservaUI() {
  const idZona = document.getElementById('reserva-zona').value;
  const fecha = document.getElementById('reserva-fecha').value;
  const horaInicio = document.getElementById('reserva-hora-inicio').value;
  const horaFin = document.getElementById('reserva-hora-fin').value;
  if (!idZona || !fecha || !horaInicio || !horaFin) { alert('Completa todos los campos'); return; }

  mostrarCargando(true);
  llamarAPI('crearReserva', {
    idUsuario: SESION.idUsuario, idApto: SESION.idApto,
    idZona: idZona, fecha: fecha, horaInicio: horaInicio, horaFin: horaFin
  }).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('reserva-resultado');
    if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
    el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Reserva confirmada.</span>';
    cargarMisReservas();
  });
}

function cargarMisReservas() {
  llamarAPI('getMisReservas', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-mis-reservas');
      const reservas = r.reservas || [];
      cont.innerHTML = reservas.length ? '' : '<p>No tienes reservas todavía.</p>';
      reservas.forEach(function (res) {
        const clase = res.Estado === 'Confirmada' ? 'ingreso' : 'rechazado';
        cont.innerHTML += '<div class="item-lista">' + res.Fecha + ' · ' + res.Hora_Inicio + ' - ' + res.Hora_Fin +
          ' <span class="badge ' + clase + '">' + res.Estado + '</span>' +
          (res.Estado === 'Confirmada' ? '<br><button class="secundario" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="cancelarReservaUI(\'' + res.ID_Reserva + '\')">Cancelar</button>' : '') +
          '</div>';
      });
    });
}

function cancelarReservaUI(idReserva) {
  if (!confirm('¿Cancelar esta reserva?')) return;
  mostrarCargando(true);
  llamarAPI('cancelarReserva', { idUsuario: SESION.idUsuario, idApto: SESION.idApto, idReserva: idReserva })
    .then(function () {
      mostrarCargando(false);
      cargarMisReservas();
    });
}

/* ---------------- PQRS (RESIDENTE) ---------------- */
function crearPQRSUI() {
  const tipo = document.getElementById('pqrs-tipo').value;
  const descripcion = document.getElementById('pqrs-descripcion').value.trim();
  if (!descripcion) { alert('Escribe una descripción'); return; }

  mostrarCargando(true);
  llamarAPI('crearPQRS', { idUsuario: SESION.idUsuario, idApto: SESION.idApto, tipo: tipo, descripcion: descripcion })
    .then(function () {
      mostrarCargando(false);
      document.getElementById('pqrs-resultado').innerText = '✅ Solicitud enviada.';
      document.getElementById('pqrs-descripcion').value = '';
      cargarMisPQRS();
    });
}

function cargarMisPQRS() {
  llamarAPI('getMisPQRS', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-mis-pqrs');
      const items = r.pqrs || [];
      cont.innerHTML = items.length ? '' : '<p>No has enviado solicitudes.</p>';
      items.forEach(function (p) {
        const clase = p.Estado === 'Cerrado' ? 'ingreso' : 'pendiente';
        cont.innerHTML += '<div class="item-lista"><b>' + p.Tipo + '</b> — ' + p.Fecha +
          ' <span class="badge ' + clase + '">' + p.Estado + '</span>' +
          '<br>' + p.Descripcion +
          (p.Respuesta ? '<br><span style="color:var(--verde-oscuro); font-size:13px;">Respuesta: ' + p.Respuesta + '</span>' : '') +
          '</div>';
      });
    });
}

/* ---------------- PISCINA (RESIDENTE) ---------------- */
function solicitarPiscinaUI() {
  const fecha = document.getElementById('piscina-fecha').value;
  const acompanantes = document.getElementById('piscina-acompanantes').value || 0;
  const nombres = document.getElementById('piscina-nombres').value.trim();
  if (!fecha) { alert('Elige una fecha'); return; }

  mostrarCargando(true);
  llamarAPI('solicitarPiscina', {
    idUsuario: SESION.idUsuario, idApto: SESION.idApto,
    fecha: fecha, numAcompanantes: acompanantes, nombresAcompanantes: nombres
  }).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('piscina-resultado');
    if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
    el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Solicitud aprobada.</span>';
    cargarMisSolicitudesPiscina();
  });
}

function cargarMisSolicitudesPiscina() {
  llamarAPI('getMisSolicitudesPiscina', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-piscina-residente');
      const items = r.solicitudes || [];
      cont.innerHTML = items.length ? '' : '<p>No tienes solicitudes de piscina.</p>';
      items.forEach(function (p) {
        cont.innerHTML += '<div class="item-lista">' + p.Fecha + ' — ' + p.Num_Acompanantes + ' acompañante(s) ' +
          '<span class="badge ' + (p.Estado === 'Aprobado' ? 'ingreso' : 'pendiente') + '">' + p.Estado + '</span></div>';
      });
    });
}

/* ---------------- MULTAS (RESIDENTE) ---------------- */
function cargarMisMultas() {
  llamarAPI('getMisMultas', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-mis-multas');
      const items = r.multas || [];
      cont.innerHTML = items.length ? '' : '<p>No tienes multas registradas.</p>';
      items.forEach(function (m) {
        const clase = m.Estado === 'Pagada' ? 'ingreso' : (m.Estado === 'Apelada' ? 'pendiente' : 'rechazado');
        cont.innerHTML += '<div class="item-lista">' + m.Motivo + ' — $' + Number(m.Valor).toLocaleString('es-CO') +
          ' <span class="badge ' + clase + '">' + m.Estado + '</span>' +
          (m.Estado === 'Pendiente' ? '<br><button class="secundario" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="apelarMultaUI(\'' + m.ID_Multa + '\')">Apelar</button>' : '') +
          '</div>';
      });
    });
}

function apelarMultaUI(idMulta) {
  if (!confirm('¿Apelar esta multa?')) return;
  mostrarCargando(true);
  llamarAPI('apelarMulta', { idUsuario: SESION.idUsuario, idApto: SESION.idApto, idMulta: idMulta })
    .then(function () {
      mostrarCargando(false);
      cargarMisMultas();
    });
}

/* ---------------- MANTENIMIENTO (RESIDENTE) ---------------- */
function reportarMantenimientoUI() {
  const zona = document.getElementById('mant-zona').value.trim();
  const descripcion = document.getElementById('mant-descripcion').value.trim();
  if (!zona || !descripcion) { alert('Completa todos los campos'); return; }

  mostrarCargando(true);
  llamarAPI('reportarMantenimiento', { idUsuario: SESION.idUsuario, zonaArea: zona, descripcion: descripcion })
    .then(function () {
      mostrarCargando(false);
      document.getElementById('mant-resultado').innerText = '✅ Reporte enviado.';
      document.getElementById('mant-zona').value = '';
      document.getElementById('mant-descripcion').value = '';
    });
}

/* ---------------- SOS (RESIDENTE) ---------------- */
function activarSOSUI() {
  if (!confirm('¿Confirmas que quieres enviar una alerta de emergencia a vigilancia?')) return;
  mostrarCargando(true);
  llamarAPI('activarSOS', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function () {
      mostrarCargando(false);
      alert('🆘 Alerta enviada a vigilancia. Mantén la calma, ya fueron notificados.');
    });
}

/* ---------------- VIGILANCIA ---------------- */
function iniciarVigilancia() {
  document.getElementById('vista-vigilancia').classList.remove('oculto');
  cargarVisitasHoy();
  cargarBannerSOS();
}

function mostrarPanelVigilancia(panel, btn) {
  ['visitas', 'piscina', 'novedades', 'actas'].forEach(function (p) {
    document.getElementById('vig-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-vigilancia .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
  if (panel === 'piscina') cargarPiscinaHoy();
  if (panel === 'actas') cargarUltimasActas();
}

function cargarBannerSOS() {
  llamarAPI('getSOSActivas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('vig-banner-sos');
      const alertas = r.alertas || [];
      if (!alertas.length) { cont.classList.add('oculto'); cont.innerHTML = ''; return; }
      cont.classList.remove('oculto');
      cont.innerHTML = alertas.map(function (a) {
        return '<div class="banner-sos"><span>🆘 Emergencia — Apto ' + a.ID_Apto + '</span>' +
          '<button class="secundario" style="width:auto; padding:8px 14px; background:white;" onclick="atenderSOSUI(\'' + a.ID_Alerta + '\')">Atender</button></div>';
      }).join('');
    });
}

function atenderSOSUI(idAlerta) {
  mostrarCargando(true);
  llamarAPI('atenderSOS', { idUsuario: SESION.idUsuario, idAlerta: idAlerta })
    .then(function () {
      mostrarCargando(false);
      cargarBannerSOS();
    });
}

function cargarVisitasHoy() {
  llamarAPI('getVisitasHoy', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-visitas-hoy');
      const visitas = r.visitas || [];
      cont.innerHTML = visitas.length ? '' : '<p>No hay visitantes esperados hoy.</p>';
      visitas.forEach(function (v) {
        cont.innerHTML += '<div class="item-lista"><b>' + v.Nombre_Visitante + '</b> (' + v.Documento_Visitante + ') — ' +
          v.Hora_Programada + '<br>Apto: ' + v.ID_Apto +
          '<br><button class="verde" style="margin-top:6px;" onclick="marcarIngresoUI(\'' + v.ID_Visita + '\')">✅ Marcar ingreso</button></div>';
      });
    });
}

function buscarYMostrar() {
  const codigo = document.getElementById('buscar-codigo').value.trim();
  if (!codigo) return;
  llamarAPI('buscarVisitaPorCodigo', { idUsuario: SESION.idUsuario, codigo: codigo })
    .then(function (r) {
      const cont = document.getElementById('resultado-busqueda');
      const v = r.visita;
      if (!v) { cont.innerHTML = '<p style="color:var(--rojo)">No encontrado.</p>'; return; }
      cont.innerHTML = '<div class="item-lista"><b>' + v.Nombre_Visitante + '</b> — Apto ' + v.ID_Apto +
        ' — Estado: ' + v.Estado +
        '<br><button class="verde" style="margin-top:6px;" onclick="marcarIngresoUI(\'' + v.ID_Visita + '\')">✅ Marcar ingreso</button></div>';
    });
}

function marcarIngresoUI(idVisita) {
  mostrarCargando(true);
  llamarAPI('marcarIngreso', { idUsuario: SESION.idUsuario, idVisita: idVisita })
    .then(function () {
      mostrarCargando(false);
      cargarVisitasHoy();
      document.getElementById('resultado-busqueda').innerHTML = '✅ Ingreso registrado.';
    });
}

function registrarNovedadUI() {
  const tipo = document.getElementById('nov-tipo').value;
  const desc = document.getElementById('nov-desc').value;
  const prioridad = document.getElementById('nov-prioridad').value;
  if (!tipo || !desc) { alert('Completa todos los campos'); return; }
  mostrarCargando(true);
  llamarAPI('registrarNovedad', {
    idUsuario: SESION.idUsuario, tipo: tipo, descripcion: desc, prioridad: prioridad
  }).then(function () {
    mostrarCargando(false);
    document.getElementById('nov-resultado').innerText = '✅ Novedad registrada.';
    document.getElementById('nov-tipo').value = '';
    document.getElementById('nov-desc').value = '';
  });
}

/* ---------------- PISCINA (VIGILANCIA) ---------------- */
function cargarPiscinaHoy() {
  llamarAPI('getPiscinaHoy', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-piscina-hoy');
      const items = r.solicitudes || [];
      cont.innerHTML = items.length ? '' : '<p>No hay accesos programados para hoy.</p>';
      items.forEach(function (p) {
        cont.innerHTML += '<div class="item-lista">Apto ' + p.ID_Apto + ' — ' + p.Num_Acompanantes + ' acompañante(s)' +
          (p.Hora_Ingreso ? ' <span class="badge ingreso">Ingresó ' + p.Hora_Ingreso + '</span>' :
            '<br><button class="verde" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="marcarIngresoPiscinaUI(\'' + p.ID_Acceso + '\')">✅ Marcar ingreso</button>') +
          '</div>';
      });
    });
}

function marcarIngresoPiscinaUI(idAcceso) {
  mostrarCargando(true);
  llamarAPI('marcarIngresoPiscina', { idUsuario: SESION.idUsuario, idAcceso: idAcceso })
    .then(function () {
      mostrarCargando(false);
      cargarPiscinaHoy();
    });
}

/* ---------------- MANTENIMIENTO (VIGILANCIA) ---------------- */
function reportarMantenimientoVigUI() {
  const zona = document.getElementById('mant-zona-vig').value.trim();
  const descripcion = document.getElementById('mant-descripcion-vig').value.trim();
  if (!zona || !descripcion) { alert('Completa todos los campos'); return; }

  mostrarCargando(true);
  llamarAPI('reportarMantenimiento', { idUsuario: SESION.idUsuario, zonaArea: zona, descripcion: descripcion })
    .then(function () {
      mostrarCargando(false);
      document.getElementById('mant-resultado-vig').innerText = '✅ Reporte enviado.';
      document.getElementById('mant-zona-vig').value = '';
      document.getElementById('mant-descripcion-vig').value = '';
    });
}

/* ---------------- ACTAS DE TURNO (VIGILANCIA) ---------------- */
function crearActaUI() {
  const turno = document.getElementById('acta-turno').value;
  const observaciones = document.getElementById('acta-observaciones').value.trim();
  if (!observaciones) { alert('Escribe las observaciones del turno'); return; }

  mostrarCargando(true);
  llamarAPI('crearActaTurno', { idUsuario: SESION.idUsuario, turno: turno, observaciones: observaciones })
    .then(function () {
      mostrarCargando(false);
      document.getElementById('acta-resultado').innerText = '✅ Turno cerrado correctamente.';
      document.getElementById('acta-observaciones').value = '';
      cargarUltimasActas();
    });
}

function cargarUltimasActas() {
  llamarAPI('getUltimasActas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-actas');
      const actas = r.actas || [];
      cont.innerHTML = actas.length ? '' : '<p>No hay actas registradas.</p>';
      actas.forEach(function (a) {
        cont.innerHTML += '<div class="item-lista"><b>' + a.Turno + '</b> — ' + a.Fecha +
          '<br>' + a.Observaciones + '</div>';
      });
    });
}

/* ---------------- ADMINISTRADOR ---------------- */
function iniciarAdmin() {
  document.getElementById('vista-admin').classList.remove('oculto');
  cargarDashboardAdmin();
}

function mostrarPanelAdmin(panel, btn) {
  ['inicio', 'pagos', 'aprobaciones', 'comunicados', 'pqrs'].forEach(function (p) {
    document.getElementById('admin-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-admin .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
  if (panel === 'pagos') cargarPagosPendientesUI();
  if (panel === 'aprobaciones') cargarUsuariosPendientesUI();
  if (panel === 'comunicados') cargarComunicadosAdmin();
  if (panel === 'pqrs') cargarPQRSAdmin();
}

function cargarDashboardAdmin() {
  llamarAPI('getDashboardAdmin', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const d = r.datos;
      document.getElementById('admin-count-pagos').innerText = d.pagosPendientes;
      document.getElementById('admin-count-novedades').innerText = d.novedadesAbiertas;
      document.getElementById('admin-count-pqrs').innerText = d.pqrsAbiertos;
    });
}

function cargarPagosPendientesUI() {
  llamarAPI('getPagosPendientes', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-pagos-pendientes');
      const pagos = r.pagos || [];
      cont.innerHTML = pagos.length ? '' : '<p>No hay pagos pendientes 🎉</p>';
      pagos.forEach(function (p) {
        cont.innerHTML += '<div class="item-lista">Apto ' + p.ID_Apto + ' — $' + Number(p.Valor).toLocaleString('es-CO') +
          ' (' + p.Periodo_Pago + ')' +
          (p.Comprobante_URL ? ' — <a href="' + p.Comprobante_URL + '" target="_blank">Ver comprobante</a>' : '') +
          '<br><button class="verde" style="margin-top:6px;" onclick="validarPagoUI(\'' + p.ID_Pago + '\', \'Validado\')">✅ Validar</button>' +
          '<button class="rojo" onclick="validarPagoUI(\'' + p.ID_Pago + '\', \'Rechazado\')">❌ Rechazar</button></div>';
      });
    });
  cargarMultasAdmin();
}

/* ---------------- MULTAS (ADMIN) ---------------- */
function crearMultaUI() {
  const idApto = document.getElementById('multa-apto').value.trim();
  const motivo = document.getElementById('multa-motivo').value.trim();
  const valor = document.getElementById('multa-valor').value;
  if (!idApto || !motivo || !valor) { alert('Completa todos los campos'); return; }

  mostrarCargando(true);
  llamarAPI('crearMulta', { idUsuario: SESION.idUsuario, idApto: idApto, motivo: motivo, valor: valor })
    .then(function () {
      mostrarCargando(false);
      document.getElementById('multa-resultado').innerText = '✅ Multa creada.';
      document.getElementById('multa-motivo').value = '';
      document.getElementById('multa-valor').value = '';
      cargarMultasAdmin();
    });
}

function cargarMultasAdmin() {
  llamarAPI('getMultas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-multas-admin');
      const multas = r.multas || [];
      cont.innerHTML = multas.length ? '' : '<p>No hay multas registradas.</p>';
      multas.forEach(function (m) {
        const clase = m.Estado === 'Pagada' ? 'ingreso' : (m.Estado === 'Apelada' ? 'pendiente' : 'rechazado');
        cont.innerHTML += '<div class="item-lista">Apto ' + m.ID_Apto + ' — ' + m.Motivo + ' — $' + Number(m.Valor).toLocaleString('es-CO') +
          ' <span class="badge ' + clase + '">' + m.Estado + '</span>' +
          (m.Estado !== 'Pagada' ? '<br><button class="verde" style="margin-top:6px; width:auto; padding:8px 14px;" onclick="actualizarEstadoMultaUI(\'' + m.ID_Multa + '\', \'Pagada\')">Marcar pagada</button>' : '') +
          '</div>';
      });
    });
}

function actualizarEstadoMultaUI(idMulta, nuevoEstado) {
  mostrarCargando(true);
  llamarAPI('actualizarEstadoMulta', { idUsuario: SESION.idUsuario, idMulta: idMulta, nuevoEstado: nuevoEstado })
    .then(function () {
      mostrarCargando(false);
      cargarMultasAdmin();
    });
}

function validarPagoUI(idPago, estado) {
  mostrarCargando(true);
  llamarAPI('validarPago', { idUsuario: SESION.idUsuario, idPago: idPago, estado: estado })
    .then(function () {
      mostrarCargando(false);
      cargarPagosPendientesUI();
      cargarDashboardAdmin();
    });
}

function cargarUsuariosPendientesUI() {
  llamarAPI('getUsuariosPendientes', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-usuarios-pendientes');
      const usuarios = r.usuarios || [];
      cont.innerHTML = usuarios.length ? '' : '<p>No hay solicitudes pendientes 🎉</p>';
      usuarios.forEach(function (u) {
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + u.Nombre + '</b> — ' + u.Tipo_Rol + ' del apto ' + u.ID_Apto +
          '<br><span style="color:var(--texto-suave); font-size:13px;">' + u.Email + ' · Doc: ' + u.Documento + '</span>' +
          '<br><button class="verde" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="aprobarUsuarioUI(\'' + u.ID_Usuario + '\')">✅ Aprobar</button> ' +
          '<button class="rojo" style="width:auto; padding:8px 14px;" onclick="rechazarUsuarioUI(\'' + u.ID_Usuario + '\')">❌ Rechazar</button>' +
          '</div>';
      });
    });
}

function aprobarUsuarioUI(idUsuarioObjetivo) {
  mostrarCargando(true);
  llamarAPI('aprobarUsuario', { idUsuario: SESION.idUsuario, idUsuarioObjetivo: idUsuarioObjetivo })
    .then(function () {
      mostrarCargando(false);
      cargarUsuariosPendientesUI();
    });
}

function rechazarUsuarioUI(idUsuarioObjetivo) {
  if (!confirm('¿Rechazar y eliminar esta solicitud?')) return;
  mostrarCargando(true);
  llamarAPI('rechazarUsuario', { idUsuario: SESION.idUsuario, idUsuarioObjetivo: idUsuarioObjetivo })
    .then(function () {
      mostrarCargando(false);
      cargarUsuariosPendientesUI();
    });
}

/* ---------------- COMUNICADOS (ADMIN) ---------------- */
function publicarComunicadoUI() {
  const titulo = document.getElementById('com-titulo').value.trim();
  const contenido = document.getElementById('com-contenido').value.trim();
  const expiracion = document.getElementById('com-expiracion').value;
  const dirigidoA = document.getElementById('com-dirigido').value;
  if (!titulo || !contenido) { alert('Completa título y contenido'); return; }

  mostrarCargando(true);
  llamarAPI('publicarComunicado', {
    idUsuario: SESION.idUsuario, titulo: titulo, contenido: contenido,
    fechaExpiracion: expiracion, dirigidoA: dirigidoA
  }).then(function () {
    mostrarCargando(false);
    document.getElementById('com-resultado').innerText = '✅ Aviso publicado.';
    document.getElementById('com-titulo').value = '';
    document.getElementById('com-contenido').value = '';
    cargarComunicadosAdmin();
  });
}

function cargarComunicadosAdmin() {
  llamarAPI('getComunicadosActivos', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-comunicados-admin');
      const avisos = r.comunicados || [];
      cont.innerHTML = avisos.length ? '' : '<p>No hay avisos activos.</p>';
      avisos.forEach(function (a) {
        cont.innerHTML += '<div class="item-lista"><b>' + a.Titulo + '</b><br>' + a.Contenido +
          '<br><span style="color:var(--texto-suave); font-size:12px;">' + a.Fecha_Publicacion + ' · ' + a.Dirigido_A + '</span>' +
          '<br><button class="rojo" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="eliminarComunicadoUI(\'' + a.ID_Comunicado + '\')">Eliminar</button></div>';
      });
    });
}

function eliminarComunicadoUI(idComunicado) {
  if (!confirm('¿Eliminar este aviso?')) return;
  mostrarCargando(true);
  llamarAPI('eliminarComunicado', { idUsuario: SESION.idUsuario, idComunicado: idComunicado })
    .then(function () {
      mostrarCargando(false);
      cargarComunicadosAdmin();
    });
}

/* ---------------- PQRS (ADMIN) ---------------- */
function cargarPQRSAdmin() {
  llamarAPI('getPQRSAbiertos', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-pqrs-admin');
      const items = r.pqrs || [];
      cont.innerHTML = items.length ? '' : '<p>No hay PQRS pendientes 🎉</p>';
      items.forEach(function (p) {
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + p.Tipo + '</b> — Apto ' + p.ID_Apto + ' — ' + p.Fecha +
          '<br>' + p.Descripcion +
          '<br><textarea id="resp-' + p.ID_PQRS + '" placeholder="Escribe tu respuesta..." rows="2" style="margin-top:8px;"></textarea>' +
          '<button class="verde" style="width:auto; padding:8px 14px;" onclick="responderPQRSUI(\'' + p.ID_PQRS + '\')">Responder y cerrar</button>' +
          '</div>';
      });
    });
  cargarMantenimientoAdmin();
}

/* ---------------- MANTENIMIENTO (ADMIN) ---------------- */
function cargarMantenimientoAdmin() {
  llamarAPI('getMantenimientos', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-mantenimiento-admin');
      const items = r.mantenimientos || [];
      cont.innerHTML = items.length ? '' : '<p>No hay reportes de mantenimiento.</p>';
      items.forEach(function (m) {
        const clase = m.Estado === 'Resuelto' ? 'ingreso' : (m.Estado === 'En proceso' ? 'pendiente' : 'rechazado');
        cont.innerHTML += '<div class="item-lista"><b>' + m.Zona_Area + '</b> ' +
          '<span class="badge ' + clase + '">' + m.Estado + '</span>' +
          '<br>' + m.Descripcion + ' — ' + m.Fecha_Reporte +
          (m.Estado !== 'Resuelto' ?
            '<br><button class="secundario" style="margin-top:6px; width:auto; padding:8px 14px;" onclick="actualizarEstadoMantenimientoUI(\'' + m.ID_Mantenimiento + '\', \'En proceso\')">En proceso</button> ' +
            '<button class="verde" style="width:auto; padding:8px 14px;" onclick="actualizarEstadoMantenimientoUI(\'' + m.ID_Mantenimiento + '\', \'Resuelto\')">Marcar resuelto</button>'
            : '') +
          '</div>';
      });
    });
}

function actualizarEstadoMantenimientoUI(idMantenimiento, nuevoEstado) {
  mostrarCargando(true);
  llamarAPI('actualizarEstadoMantenimiento', { idUsuario: SESION.idUsuario, idMantenimiento: idMantenimiento, nuevoEstado: nuevoEstado })
    .then(function () {
      mostrarCargando(false);
      cargarMantenimientoAdmin();
    });
}

function responderPQRSUI(idPQRS) {
  const respuesta = document.getElementById('resp-' + idPQRS).value.trim();
  if (!respuesta) { alert('Escribe una respuesta'); return; }
  mostrarCargando(true);
  llamarAPI('responderPQRS', { idUsuario: SESION.idUsuario, idPQRS: idPQRS, respuesta: respuesta })
    .then(function () {
      mostrarCargando(false);
      cargarPQRSAdmin();
      cargarDashboardAdmin();
    });
}
