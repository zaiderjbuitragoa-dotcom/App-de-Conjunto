/**
 * app.js — Toda la lógica del frontend. Se comunica con el
 * backend de Apps Script exclusivamente por fetch().
 *
 * ⚠️ IMPORTANTE: reemplaza API_URL por la URL de tu implementación
 * de Apps Script (termina en /exec). La obtienes al hacer
 * Implementar → Nueva implementación → Aplicación web.
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbzpm8ZPoPPxwvPdCcvlPKyxxz7UICcGBPK8uSCP5eIq3hqUDzd2E4afhTQTluOKYOTqPA/exec';

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

/* ---------------- AVISOS / COMUNICADOS (compartido entre roles) ---------------- */
function cargarComunicados(contenedorId) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  llamarAPI('getComunicados', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const comunicados = (r.comunicados || []).slice(0, 5);
      if (!comunicados.length) {
        cont.innerHTML = '<h3>📢 Avisos del conjunto</h3><p style="opacity:.8; font-size:13px; margin:0;">No hay avisos por ahora.</p>';
        return;
      }
      let html = '<h3>📢 Avisos del conjunto</h3>';
      comunicados.forEach(function (c) {
        const fecha = c.Fecha_Publicacion ? new Date(c.Fecha_Publicacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '';
        html += '<div class="anuncio-item">' +
          '<div class="titulo">' + c.Titulo + '</div>' +
          '<div>' + c.Contenido + '</div>' +
          (c.Adjunto_URL ? '<img src="' + c.Adjunto_URL + '">' : '') +
          '<div class="fecha">' + fecha + '</div>' +
          '</div>';
      });
      cont.innerHTML = html;
    });
}

/* ---------------- RESIDENTE ---------------- */
function iniciarResidente() {
  document.getElementById('vista-residente').classList.remove('oculto');
  document.getElementById('res-nombre').innerText = SESION.nombre;
  cargarComunicados('res-anuncios');
  cargarEstadoCuenta();
  cargarMisVisitas();
}

function mostrarPanelResidente(panel, btn) {
  ['inicio', 'visitas', 'pagos', 'vehiculos', 'zonas', 'piscina', 'multas', 'pqrs'].forEach(function (p) {
    document.getElementById('res-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-residente .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
  if (panel === 'pagos') cargarHistorialPagos();
  if (panel === 'vehiculos') cargarMisVehiculos();
  if (panel === 'zonas') { cargarZonasComunes(); cargarMisReservas(); }
  if (panel === 'piscina') cargarMisAccesosPiscina();
  if (panel === 'multas') cargarMisMultas();
  if (panel === 'pqrs') cargarMisPQRS();
}

function dispararSOSUI() {
  if (!confirm('¿Confirmas que deseas enviar una alerta de emergencia (SOS)? Se notificará de inmediato a portería y administración.')) return;
  mostrarCargando(true);
  llamarAPI('crearAlertaSOS', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      mostrarCargando(false);
      if (r.ok) alert('🆘 Alerta enviada. Portería ha sido notificada.');
      else alert('No se pudo enviar la alerta: ' + r.mensaje);
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

/* ---------------- ZONAS COMUNES (residente) ---------------- */
function cargarZonasComunes() {
  llamarAPI('getZonasComunes', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const zonas = r.zonas || [];
      const cont = document.getElementById('lista-zonas-comunes');
      cont.innerHTML = zonas.length ? '' : '<p>Aún no hay zonas comunes configuradas.</p>';

      const select = document.getElementById('reserva-zona');
      select.innerHTML = '';

      zonas.forEach(function (z) {
        const requiereAprobacion = String(z.Requiere_Aprobacion).trim().toLowerCase() === 'si';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>🌳 ' + z.Nombre + '</b>' +
          (z.Capacidad ? '<br><span style="color:var(--texto-suave); font-size:13px;">👥 Capacidad: ' + z.Capacidad + '</span>' : '') +
          (z.Horario_Disponible ? '<br><span style="color:var(--texto-suave); font-size:13px;">🕒 ' + z.Horario_Disponible + '</span>' : '') +
          (z.Costo ? '<br><span style="color:var(--texto-suave); font-size:13px;">💲 Costo: $' + z.Costo + '</span>' : '') +
          (requiereAprobacion ? ' <span class="badge pendiente">Requiere aprobación</span>' : ' <span class="badge autorizado">Reserva directa</span>') +
          '</div>';

        const opt = document.createElement('option');
        opt.value = z.ID_Zona;
        opt.textContent = z.Nombre;
        select.appendChild(opt);
      });

      document.getElementById('form-reservar-zona').classList.toggle('oculto', !select.options.length);
    });
}

function reservarZonaUI() {
  const idZona = document.getElementById('reserva-zona').value;
  const fecha = document.getElementById('reserva-fecha').value;
  const horaInicio = document.getElementById('reserva-hora-inicio').value;
  const horaFin = document.getElementById('reserva-hora-fin').value;
  if (!idZona || !fecha || !horaInicio || !horaFin) { alert('Completa todos los campos'); return; }

  mostrarCargando(true);
  llamarAPI('reservarZonaComun', {
    idUsuario: SESION.idUsuario, idApto: SESION.idApto,
    idZona: idZona, fecha: fecha, horaInicio: horaInicio, horaFin: horaFin
  }).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('reserva-resultado');
    if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
    el.innerHTML = r.requiereAprobacion
      ? '<span style="color:var(--amarillo)">⏳ Reserva enviada, pendiente de aprobación del administrador.</span>'
      : '<span style="color:var(--verde-oscuro)">✅ Reserva confirmada.</span>';
    cargarMisReservas();
  });
}

function cargarMisReservas() {
  llamarAPI('getMisReservas', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-mis-reservas');
      const reservas = r.reservas || [];
      cont.innerHTML = reservas.length ? '' : '<p>No tienes reservas.</p>';
      reservas.forEach(function (res) {
        const clase = res.Estado === 'Confirmada' ? 'validado' : (res.Estado === 'Cancelada' ? 'rechazado' : 'pendiente');
        cont.innerHTML += '<div class="item-lista"><b>' + res.Nombre_Zona + '</b> — ' + res.Fecha + ' (' + res.Hora_Inicio + ' - ' + res.Hora_Fin + ')' +
          ' <span class="badge ' + clase + '">' + res.Estado + '</span>' +
          (res.Estado === 'Confirmada' ? '<br><button class="rojo" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="cancelarReservaUI(\'' + res.ID_Reserva + '\')">Cancelar</button>' : '') +
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

function reportarMantenimientoUI() {
  const zonaArea = document.getElementById('mant-zona').value.trim();
  const descripcion = document.getElementById('mant-desc').value.trim();
  if (!zonaArea || !descripcion) { alert('Completa la zona y la descripción'); return; }

  mostrarCargando(true);
  llamarAPI('reportarMantenimiento', { idUsuario: SESION.idUsuario, zonaArea: zonaArea, descripcion: descripcion })
    .then(function (r) {
      mostrarCargando(false);
      const el = document.getElementById('mant-resultado');
      if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
      el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Reporte enviado. Gracias por avisarnos.</span>';
      document.getElementById('mant-zona').value = '';
      document.getElementById('mant-desc').value = '';
    });
}

/* ---------------- PISCINA (residente) ---------------- */
function registrarAccesoPiscinaUI() {
  const fecha = document.getElementById('piscina-fecha').value;
  const numAcompanantes = document.getElementById('piscina-acompanantes').value;
  const nombresAcompanantes = document.getElementById('piscina-nombres').value.trim();
  if (!fecha) { alert('Selecciona la fecha'); return; }

  mostrarCargando(true);
  llamarAPI('registrarAccesoPiscina', {
    idUsuario: SESION.idUsuario, idApto: SESION.idApto,
    fecha: fecha, numAcompanantes: numAcompanantes, nombresAcompanantes: nombresAcompanantes
  }).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('piscina-resultado');
    if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
    el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Acceso solicitado.</span>';
    document.getElementById('piscina-acompanantes').value = '';
    document.getElementById('piscina-nombres').value = '';
    cargarMisAccesosPiscina();
  });
}

function cargarMisAccesosPiscina() {
  llamarAPI('getMisAccesosPiscina', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-mis-accesos-piscina');
      const accesos = r.accesos || [];
      cont.innerHTML = accesos.length ? '' : '<p>No has solicitado accesos a la piscina.</p>';
      accesos.forEach(function (a) {
        const clase = a.Estado === 'Ingresó' ? 'validado' : 'pendiente';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + a.Fecha + '</b> <span class="badge ' + clase + '">' + a.Estado + '</span>' +
          (a.Num_Acompanantes ? '<br><span style="font-size:13px; color:var(--texto-suave);">👥 ' + a.Num_Acompanantes + ' acompañante(s)</span>' : '') +
          '</div>';
      });
    });
}

/* ---------------- MULTAS (residente) ---------------- */
function cargarMisMultas() {
  llamarAPI('getMisMultas', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-mis-multas');
      const multas = r.multas || [];
      cont.innerHTML = multas.length ? '' : '<p>No tienes multas registradas.</p>';
      multas.forEach(function (m) {
        const clase = m.Estado === 'Pagada' ? 'validado' : (m.Estado === 'Anulada' ? 'rechazado' : 'pendiente');
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + m.Motivo + '</b> <span class="badge ' + clase + '">' + m.Estado + '</span>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">💲 $' + m.Valor + ' — ' + m.Fecha + '</span>' +
          (m.Evidencia_URL ? '<br><a href="' + m.Evidencia_URL + '" target="_blank" style="font-size:13px; color:var(--verde-oscuro);">Ver evidencia</a>' : '') +
          '</div>';
      });
    });
}

/* ---------------- PQRS (residente) ---------------- */
function crearPQRSUI() {
  const tipo = document.getElementById('pqrs-tipo').value;
  const descripcion = document.getElementById('pqrs-descripcion').value.trim();
  if (!descripcion) { alert('Describe tu solicitud'); return; }

  mostrarCargando(true);
  llamarAPI('crearPQRS', { idUsuario: SESION.idUsuario, idApto: SESION.idApto, tipo: tipo, descripcion: descripcion })
    .then(function (r) {
      mostrarCargando(false);
      const el = document.getElementById('pqrs-resultado');
      if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
      el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Enviado. Te responderemos pronto.</span>';
      document.getElementById('pqrs-descripcion').value = '';
      cargarMisPQRS();
    });
}

function cargarMisPQRS() {
  llamarAPI('getMisPQRS', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const cont = document.getElementById('lista-mis-pqrs');
      const pqrs = r.pqrs || [];
      cont.innerHTML = pqrs.length ? '' : '<p>No has radicado ninguna PQRS.</p>';
      pqrs.forEach(function (p) {
        const clase = p.Estado === 'Cerrado' ? 'validado' : 'pendiente';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + p.Tipo + '</b> <span class="badge ' + clase + '">' + p.Estado + '</span>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + p.Descripcion + '</span>' +
          '<br><span style="font-size:12px; color:var(--texto-suave);">' + p.Fecha + '</span>' +
          (p.Respuesta ? '<br><div style="margin-top:6px; padding:8px 10px; background:var(--verde-claro); border-radius:8px; font-size:13px;"><b>Respuesta:</b> ' + p.Respuesta + '</div>' : '') +
          '</div>';
      });
    });
}

/* ---------------- VIGILANCIA ---------------- */
function iniciarVigilancia() {
  document.getElementById('vista-vigilancia').classList.remove('oculto');
  cargarComunicados('vig-anuncios');
  cargarVisitasHoy();
}

function mostrarPanelVigilancia(panel, btn) {
  ['visitas', 'novedades', 'piscina', 'sos', 'actas'].forEach(function (p) {
    document.getElementById('vig-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-vigilancia .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
  if (panel === 'piscina') cargarPiscinaHoy();
  if (panel === 'sos') cargarAlertasSOSVigilancia();
  if (panel === 'actas') cargarActasVigilancia();
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

function reportarMantenimientoVigilanciaUI() {
  const zonaArea = document.getElementById('mant-v-zona').value.trim();
  const descripcion = document.getElementById('mant-v-desc').value.trim();
  if (!zonaArea || !descripcion) { alert('Completa la zona y la descripción'); return; }

  mostrarCargando(true);
  llamarAPI('reportarMantenimiento', { idUsuario: SESION.idUsuario, zonaArea: zonaArea, descripcion: descripcion })
    .then(function (r) {
      mostrarCargando(false);
      const el = document.getElementById('mant-v-resultado');
      if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
      el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Reporte enviado.</span>';
      document.getElementById('mant-v-zona').value = '';
      document.getElementById('mant-v-desc').value = '';
    });
}

/* ---------------- PISCINA (vigilancia) ---------------- */
function cargarPiscinaHoy() {
  llamarAPI('getAccesosPiscinaHoy', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-piscina-hoy');
      const accesos = r.accesos || [];
      cont.innerHTML = accesos.length ? '' : '<p>No hay accesos a la piscina programados para hoy.</p>';
      accesos.forEach(function (a) {
        cont.innerHTML += '<div class="item-lista"><b>Apto ' + a.ID_Apto + '</b>' +
          (a.Num_Acompanantes ? ' — 👥 ' + a.Num_Acompanantes + ' acompañante(s)' : '') +
          (a.Nombres_Acompanantes ? '<br><span style="font-size:13px; color:var(--texto-suave);">' + a.Nombres_Acompanantes + '</span>' : '') +
          '<br><button class="verde" style="margin-top:6px;" onclick="marcarIngresoPiscinaUI(\'' + a.ID_Acceso + '\')">✅ Marcar ingreso</button></div>';
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

/* ---------------- SOS (vigilancia) ---------------- */
function cargarAlertasSOSVigilancia() {
  llamarAPI('getAlertasActivas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-alertas-sos');
      const alertas = r.alertas || [];
      cont.innerHTML = alertas.length ? '' : '<p>No hay alertas activas. 👍</p>';
      alertas.forEach(function (a) {
        const fecha = a.Fecha_Hora ? new Date(a.Fecha_Hora).toLocaleString('es-CO') : '';
        cont.innerHTML += '<div class="alerta-sos-item"><b>🆘 Apto ' + a.ID_Apto + '</b>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + fecha + '</span>' +
          '<br><button class="rojo" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="atenderAlertaUI(\'' + a.ID_Alerta + '\')">Marcar como atendida</button></div>';
      });
    });
}

function atenderAlertaUI(idAlerta) {
  mostrarCargando(true);
  llamarAPI('atenderAlertaSOS', { idUsuario: SESION.idUsuario, idAlerta: idAlerta })
    .then(function () {
      mostrarCargando(false);
      cargarAlertasSOSVigilancia();
    });
}

/* ---------------- ACTAS DE VIGILANCIA ---------------- */
function crearActaUI() {
  const datos = {
    idUsuario: SESION.idUsuario,
    turno: document.getElementById('acta-turno').value,
    guardiaEntrega: document.getElementById('acta-guardia-entrega').value.trim(),
    guardiaRecibe: document.getElementById('acta-guardia-recibe').value.trim(),
    observaciones: document.getElementById('acta-observaciones').value.trim()
  };
  if (!datos.guardiaEntrega) { alert('Ingresa el nombre de quien entrega el turno'); return; }

  mostrarCargando(true);
  llamarAPI('crearActaVigilancia', datos).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('acta-resultado');
    if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
    el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Acta registrada.</span>';
    document.getElementById('acta-guardia-entrega').value = '';
    document.getElementById('acta-guardia-recibe').value = '';
    document.getElementById('acta-observaciones').value = '';
    cargarActasVigilancia();
  });
}

function cargarActasVigilancia() {
  llamarAPI('getActasVigilancia', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-actas');
      const actas = (r.actas || []).slice(0, 10);
      cont.innerHTML = actas.length ? '' : '<p>No hay actas registradas.</p>';
      actas.forEach(function (a) {
        cont.innerHTML += '<div class="item-lista"><b>' + a.Turno + '</b> — ' + a.Fecha +
          '<br><span style="font-size:13px; color:var(--texto-suave);">Entrega: ' + a.Guardia_Entrega + (a.Guardia_Recibe ? ' → Recibe: ' + a.Guardia_Recibe : '') + '</span>' +
          (a.Observaciones ? '<br><span style="font-size:13px; color:var(--texto-suave);">' + a.Observaciones + '</span>' : '') +
          '</div>';
      });
    });
}

/* ---------------- ADMINISTRADOR ---------------- */
function iniciarAdmin() {
  document.getElementById('vista-admin').classList.remove('oculto');
  cargarDashboardAdmin();
}

function mostrarPanelAdmin(panel, btn) {
  ['inicio', 'pagos', 'aprobaciones', 'anuncios', 'zonas', 'guardas', 'multas', 'pqrs', 'mantenimiento', 'sos'].forEach(function (p) {
    document.getElementById('admin-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-admin .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
  if (panel === 'pagos') cargarPagosPendientesUI();
  if (panel === 'aprobaciones') cargarUsuariosPendientesUI();
  if (panel === 'anuncios') cargarComunicadosAdmin();
  if (panel === 'zonas') { cargarZonasAdmin(); cargarReservasPendientesAdmin(); }
  if (panel === 'guardas') { cargarGuardias(); cargarActasAdmin(); }
  if (panel === 'multas') { cargarApartamentosSelect(); cargarMultasAdmin(); }
  if (panel === 'pqrs') cargarPQRSAdmin();
  if (panel === 'mantenimiento') cargarMantenimientoAdmin();
  if (panel === 'sos') cargarAlertasSOSAdmin();
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

/* ---------------- ADMIN · COMUNICADOS ---------------- */
function publicarComunicadoUI() {
  const titulo = document.getElementById('an-titulo').value.trim();
  const contenido = document.getElementById('an-contenido').value.trim();
  const dirigidoA = document.getElementById('an-dirigido').value;
  const fechaExpiracion = document.getElementById('an-expiracion').value;
  const archivo = document.getElementById('an-imagen').files[0];
  if (!titulo || !contenido) { alert('Completa el título y el mensaje'); return; }

  function enviar(base64, nombreArchivo, mimeType) {
    mostrarCargando(true);
    llamarAPI('crearComunicado', {
      idUsuario: SESION.idUsuario, titulo: titulo, contenido: contenido,
      dirigidoA: dirigidoA, fechaExpiracion: fechaExpiracion,
      base64: base64 || '', nombreArchivo: nombreArchivo || '', mimeType: mimeType || ''
    }).then(function (r) {
      mostrarCargando(false);
      const el = document.getElementById('an-resultado');
      if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
      el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Comunicado publicado.</span>';
      document.getElementById('an-titulo').value = '';
      document.getElementById('an-contenido').value = '';
      document.getElementById('an-expiracion').value = '';
      document.getElementById('an-imagen').value = '';
      cargarComunicadosAdmin();
    });
  }

  if (archivo) {
    const lector = new FileReader();
    lector.onload = function () {
      enviar(lector.result.split(',')[1], archivo.name, archivo.type);
    };
    lector.readAsDataURL(archivo);
  } else {
    enviar();
  }
}

function cargarComunicadosAdmin() {
  llamarAPI('getTodosComunicados', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-comunicados-admin');
      const comunicados = r.comunicados || [];
      cont.innerHTML = comunicados.length ? '' : '<p>No hay comunicados publicados todavía.</p>';
      const hoy = new Date().setHours(0, 0, 0, 0);
      comunicados.forEach(function (c) {
        const vigente = !c.Fecha_Expiracion || new Date(c.Fecha_Expiracion).setHours(0, 0, 0, 0) >= hoy;
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + c.Titulo + '</b> <span class="badge ' + (vigente ? 'autorizado' : 'no-autorizado') + '">' + (vigente ? 'Publicado' : 'Vencido') + '</span>' +
          ' <span class="badge pendiente">' + (c.Dirigido_A || 'Todos') + '</span>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + c.Contenido + '</span>' +
          (c.Adjunto_URL ? '<img class="miniatura-aviso" src="' + c.Adjunto_URL + '">' : '') +
          (vigente ? '<br><button class="rojo" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="retirarComunicadoUI(\'' + c.ID_Comunicado + '\')">Retirar</button>' : '') +
          '</div>';
      });
    });
}

function retirarComunicadoUI(idComunicado) {
  if (!confirm('¿Retirar este comunicado? Dejará de verse para residentes y vigilancia.')) return;
  mostrarCargando(true);
  llamarAPI('retirarComunicado', { idUsuario: SESION.idUsuario, idComunicado: idComunicado })
    .then(function () {
      mostrarCargando(false);
      cargarComunicadosAdmin();
    });
}

/* ---------------- ADMIN · ZONAS COMUNES ---------------- */
function cargarZonasAdmin() {
  llamarAPI('getZonasComunes', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-zonas-admin');
      const zonas = r.zonas || [];
      cont.innerHTML = zonas.length ? '' : '<p>No hay zonas comunes registradas.</p>';
      zonas.forEach(function (z) {
        const requiereAprobacion = String(z.Requiere_Aprobacion).trim().toLowerCase() === 'si';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>🌳 ' + z.Nombre + '</b>' +
          (requiereAprobacion ? ' <span class="badge pendiente">Requiere aprobación</span>' : ' <span class="badge autorizado">Reserva directa</span>') +
          (z.Capacidad ? '<br><span style="font-size:13px; color:var(--texto-suave);">👥 Capacidad: ' + z.Capacidad + '</span>' : '') +
          (z.Horario_Disponible ? '<br><span style="font-size:13px; color:var(--texto-suave);">🕒 ' + z.Horario_Disponible + '</span>' : '') +
          (z.Costo ? '<br><span style="font-size:13px; color:var(--texto-suave);">💲 Costo: $' + z.Costo + '</span>' : '') +
          '</div>';
      });
    });
}

function crearZonaUI() {
  const datos = {
    idUsuario: SESION.idUsuario,
    nombre: document.getElementById('zc-nombre').value.trim(),
    capacidad: document.getElementById('zc-capacidad').value.trim(),
    costo: document.getElementById('zc-costo').value.trim(),
    horario: document.getElementById('zc-horario').value.trim(),
    requiereAprobacion: document.getElementById('zc-requiere-aprobacion').checked
  };
  if (!datos.nombre) { alert('Ingresa el nombre de la zona'); return; }

  mostrarCargando(true);
  llamarAPI('crearZonaComun', datos).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('zc-resultado');
    if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
    el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Zona creada.</span>';
    ['zc-nombre', 'zc-capacidad', 'zc-costo', 'zc-horario'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('zc-requiere-aprobacion').checked = false;
    cargarZonasAdmin();
  });
}

/* ---------------- ADMIN · RESERVAS PENDIENTES DE APROBACIÓN ---------------- */
function cargarReservasPendientesAdmin() {
  llamarAPI('getReservasPendientes', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-reservas-pendientes');
      const reservas = r.reservas || [];
      cont.innerHTML = reservas.length ? '' : '<p>No hay reservas pendientes.</p>';
      reservas.forEach(function (res) {
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + res.Nombre_Zona + '</b> — Apto ' + res.ID_Apto + '<br>' +
          res.Fecha + ' (' + res.Hora_Inicio + ' - ' + res.Hora_Fin + ')' +
          '<br><button style="margin-top:8px; width:auto; padding:8px 14px;" onclick="resolverReservaUI(\'' + res.ID_Reserva + '\', \'Confirmada\')">Aprobar</button> ' +
          '<button class="rojo" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="resolverReservaUI(\'' + res.ID_Reserva + '\', \'Rechazada\')">Rechazar</button>' +
          '</div>';
      });
    });
}

function resolverReservaUI(idReserva, nuevoEstado) {
  mostrarCargando(true);
  llamarAPI('resolverReserva', { idUsuario: SESION.idUsuario, idReserva: idReserva, nuevoEstado: nuevoEstado })
    .then(function () {
      mostrarCargando(false);
      cargarReservasPendientesAdmin();
    });
}

/* ---------------- ADMIN · GUARDAS DE SEGURIDAD ---------------- */
function cargarGuardias() {
  llamarAPI('getGuardias', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-guardias');
      const guardias = r.guardias || [];
      cont.innerHTML = guardias.length ? '' : '<p>No hay guardias registrados aún.</p>';
      guardias.forEach(function (g) {
        const activo = String(g.Activo).trim().toLowerCase() === 'si';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + g.Nombre + '</b> <span class="badge ' + (activo ? 'autorizado' : 'no-autorizado') + '">' + (activo ? 'Activo' : 'Inactivo') + '</span>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + g.Email + '</span>' +
          '<br><button class="secundario" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="toggleGuardiaUI(\'' + g.ID_Usuario + '\')">' + (activo ? 'Desactivar' : 'Activar') + '</button>' +
          '</div>';
      });
    });
}

function crearGuardiaUI() {
  const datos = {
    idUsuario: SESION.idUsuario,
    nombres: document.getElementById('gu-nombres').value.trim(),
    apellidos: document.getElementById('gu-apellidos').value.trim(),
    email: document.getElementById('gu-email').value.trim(),
    telefono: document.getElementById('gu-telefono').value.trim(),
    numeroDocumento: document.getElementById('gu-documento').value.trim()
  };
  if (!datos.nombres || !datos.apellidos || !datos.email) { alert('Completa nombre, apellido y correo'); return; }

  mostrarCargando(true);
  llamarAPI('crearUsuarioVigilancia', datos).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('gu-resultado');
    el.innerHTML = r.ok
      ? '<span style="color:var(--verde-oscuro)">✅ ' + r.mensaje + '</span>'
      : '<span style="color:var(--rojo)">❌ ' + r.mensaje + '</span>';
    if (r.ok) {
      ['gu-nombres', 'gu-apellidos', 'gu-email', 'gu-telefono', 'gu-documento'].forEach(function (id) {
        document.getElementById(id).value = '';
      });
      cargarGuardias();
    }
  });
}

function toggleGuardiaUI(idUsuarioObjetivo) {
  mostrarCargando(true);
  llamarAPI('desactivarGuardia', { idUsuario: SESION.idUsuario, idUsuarioObjetivo: idUsuarioObjetivo })
    .then(function () {
      mostrarCargando(false);
      cargarGuardias();
    });
}

/* ---------------- ADMIN · ACTAS DE VIGILANCIA (solo lectura) ---------------- */
function cargarActasAdmin() {
  llamarAPI('getActasVigilancia', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-actas-admin');
      const actas = (r.actas || []).slice(0, 15);
      cont.innerHTML = actas.length ? '' : '<p>No hay actas registradas todavía.</p>';
      actas.forEach(function (a) {
        cont.innerHTML += '<div class="item-lista"><b>' + a.Turno + '</b> — ' + a.Fecha +
          '<br><span style="font-size:13px; color:var(--texto-suave);">Entrega: ' + a.Guardia_Entrega + (a.Guardia_Recibe ? ' → Recibe: ' + a.Guardia_Recibe : '') + '</span>' +
          (a.Observaciones ? '<br><span style="font-size:13px; color:var(--texto-suave);">' + a.Observaciones + '</span>' : '') +
          '</div>';
      });
    });
}

/* ---------------- ADMIN · MULTAS ---------------- */
function cargarApartamentosSelect() {
  const select = document.getElementById('mu-apto');
  if (select.options.length) return; // ya está cargado, evita repetir la llamada
  llamarAPI('getApartamentos', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const apartamentos = r.apartamentos || [];
      select.innerHTML = '';
      apartamentos.forEach(function (a) {
        const opt = document.createElement('option');
        opt.value = a.ID_Apto;
        opt.textContent = a.ID_Apto + (a.Numero ? ' (Apto ' + a.Numero + ')' : '');
        select.appendChild(opt);
      });
    });
}

function crearMultaUI() {
  const idApto = document.getElementById('mu-apto').value;
  const motivo = document.getElementById('mu-motivo').value.trim();
  const valor = document.getElementById('mu-valor').value;
  const archivo = document.getElementById('mu-evidencia').files[0];
  if (!idApto || !motivo || !valor) { alert('Completa el apartamento, el motivo y el valor'); return; }

  function enviar(base64, nombreArchivo, mimeType) {
    mostrarCargando(true);
    llamarAPI('crearMulta', {
      idUsuario: SESION.idUsuario, idApto: idApto, motivo: motivo, valor: valor,
      base64: base64 || '', nombreArchivo: nombreArchivo || '', mimeType: mimeType || ''
    }).then(function (r) {
      mostrarCargando(false);
      const el = document.getElementById('mu-resultado');
      if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
      el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Multa registrada.</span>';
      document.getElementById('mu-motivo').value = '';
      document.getElementById('mu-valor').value = '';
      document.getElementById('mu-evidencia').value = '';
      cargarMultasAdmin();
    });
  }

  if (archivo) {
    const lector = new FileReader();
    lector.onload = function () { enviar(lector.result.split(',')[1], archivo.name, archivo.type); };
    lector.readAsDataURL(archivo);
  } else {
    enviar();
  }
}

function cargarMultasAdmin() {
  llamarAPI('getTodasMultas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-multas-admin');
      const multas = r.multas || [];
      cont.innerHTML = multas.length ? '' : '<p>No hay multas registradas.</p>';
      multas.forEach(function (m) {
        const clase = m.Estado === 'Pagada' ? 'validado' : (m.Estado === 'Anulada' ? 'rechazado' : 'pendiente');
        cont.innerHTML += '<div class="item-lista">' +
          '<b>Apto ' + m.ID_Apto + '</b> <span class="badge ' + clase + '">' + m.Estado + '</span>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + m.Motivo + ' — $' + m.Valor + ' — ' + m.Fecha + '</span>' +
          (m.Evidencia_URL ? '<br><a href="' + m.Evidencia_URL + '" target="_blank" style="font-size:13px; color:var(--verde-oscuro);">Ver evidencia</a>' : '') +
          (m.Estado === 'Pendiente'
            ? '<br><button class="verde" style="margin-top:6px; width:auto; padding:8px 14px;" onclick="actualizarEstadoMultaUI(\'' + m.ID_Multa + '\', \'Pagada\')">Marcar pagada</button> ' +
              '<button class="rojo" style="margin-top:6px; width:auto; padding:8px 14px;" onclick="actualizarEstadoMultaUI(\'' + m.ID_Multa + '\', \'Anulada\')">Anular</button>'
            : '') +
          '</div>';
      });
    });
}

function actualizarEstadoMultaUI(idMulta, estado) {
  mostrarCargando(true);
  llamarAPI('actualizarEstadoMulta', { idUsuario: SESION.idUsuario, idMulta: idMulta, estado: estado })
    .then(function () {
      mostrarCargando(false);
      cargarMultasAdmin();
    });
}

/* ---------------- ADMIN · PQRS ---------------- */
function cargarPQRSAdmin() {
  llamarAPI('getTodasPQRS', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-pqrs-admin');
      const pqrs = r.pqrs || [];
      cont.innerHTML = pqrs.length ? '' : '<p>No hay PQRS radicados.</p>';
      pqrs.forEach(function (p) {
        const clase = p.Estado === 'Cerrado' ? 'validado' : 'pendiente';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + p.Tipo + '</b> <span class="badge ' + clase + '">' + p.Estado + '</span>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">Apto ' + p.ID_Apto + ' — ' + p.Fecha + '</span>' +
          '<br><span style="font-size:13px;">' + p.Descripcion + '</span>' +
          (p.Respuesta
            ? '<br><div style="margin-top:6px; padding:8px 10px; background:var(--verde-claro); border-radius:8px; font-size:13px;"><b>Respuesta:</b> ' + p.Respuesta + '</div>'
            : '<div style="margin-top:8px;">' +
              '<textarea id="pqrs-resp-' + p.ID_PQRS + '" placeholder="Escribe una respuesta" rows="2"></textarea>' +
              '<button style="margin-top:4px; width:auto; padding:8px 14px;" onclick="responderPQRSUI(\'' + p.ID_PQRS + '\')">Responder y cerrar</button>' +
              '</div>') +
          '</div>';
      });
    });
}

function responderPQRSUI(idPQRS) {
  const respuesta = document.getElementById('pqrs-resp-' + idPQRS).value.trim();
  if (!respuesta) { alert('Escribe una respuesta'); return; }
  mostrarCargando(true);
  llamarAPI('responderPQRS', { idUsuario: SESION.idUsuario, idPQRS: idPQRS, respuesta: respuesta, estado: 'Cerrado' })
    .then(function () {
      mostrarCargando(false);
      cargarPQRSAdmin();
    });
}

/* ---------------- ADMIN · MANTENIMIENTO ---------------- */
function cargarMantenimientoAdmin() {
  llamarAPI('getMantenimiento', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-mantenimiento-admin');
      const reportes = r.reportes || [];
      cont.innerHTML = reportes.length ? '' : '<p>No hay reportes de mantenimiento.</p>';
      reportes.forEach(function (m) {
        const clase = m.Estado === 'Resuelto' ? 'validado' : (m.Estado === 'En proceso' ? 'pendiente' : 'no-autorizado');
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + m.Zona_Area + '</b> <span class="badge ' + clase + '">' + m.Estado + '</span>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + m.Descripcion + '</span>' +
          '<br><span style="font-size:12px; color:var(--texto-suave);">Reportado: ' + m.Fecha_Reporte + '</span>' +
          (m.Estado !== 'Resuelto'
            ? '<br><button style="margin-top:6px; width:auto; padding:8px 14px;" onclick="actualizarEstadoMantenimientoUI(\'' + m.ID_Mantenimiento + '\', \'En proceso\')">En proceso</button> ' +
              '<button class="verde" style="margin-top:6px; width:auto; padding:8px 14px;" onclick="actualizarEstadoMantenimientoUI(\'' + m.ID_Mantenimiento + '\', \'Resuelto\')">Marcar resuelto</button>'
            : '') +
          '</div>';
      });
    });
}

function actualizarEstadoMantenimientoUI(idMantenimiento, estado) {
  mostrarCargando(true);
  llamarAPI('actualizarEstadoMantenimiento', { idUsuario: SESION.idUsuario, idMantenimiento: idMantenimiento, estado: estado })
    .then(function () {
      mostrarCargando(false);
      cargarMantenimientoAdmin();
    });
}

/* ---------------- ADMIN · SOS ---------------- */
function cargarAlertasSOSAdmin() {
  llamarAPI('getAlertasActivas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-alertas-sos-admin');
      const alertas = r.alertas || [];
      cont.innerHTML = alertas.length ? '' : '<p>No hay alertas activas. 👍</p>';
      alertas.forEach(function (a) {
        const fecha = a.Fecha_Hora ? new Date(a.Fecha_Hora).toLocaleString('es-CO') : '';
        cont.innerHTML += '<div class="alerta-sos-item"><b>🆘 Apto ' + a.ID_Apto + '</b>' +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + fecha + '</span>' +
          '<br><button class="rojo" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="atenderAlertaAdminUI(\'' + a.ID_Alerta + '\')">Marcar como atendida</button></div>';
      });
    });
}

function atenderAlertaAdminUI(idAlerta) {
  mostrarCargando(true);
  llamarAPI('atenderAlertaSOS', { idUsuario: SESION.idUsuario, idAlerta: idAlerta })
    .then(function () {
      mostrarCargando(false);
      cargarAlertasSOSAdmin();
    });
}
