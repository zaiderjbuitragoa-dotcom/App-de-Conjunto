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

/* ---------------- RESIDENTE ---------------- */
function iniciarResidente() {
  document.getElementById('vista-residente').classList.remove('oculto');
  document.getElementById('res-nombre').innerText = SESION.nombre;
  cargarEstadoCuenta();
  cargarMisVisitas();
}

function mostrarPanelResidente(panel, btn) {
  ['inicio', 'visitas', 'pagos', 'vehiculos'].forEach(function (p) {
    document.getElementById('res-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-residente .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
  if (panel === 'pagos') cargarHistorialPagos();
  if (panel === 'vehiculos') cargarMisVehiculos();
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

/* ---------------- VIGILANCIA ---------------- */
function iniciarVigilancia() {
  document.getElementById('vista-vigilancia').classList.remove('oculto');
  cargarVisitasHoy();
}

function mostrarPanelVigilancia(panel, btn) {
  ['visitas', 'novedades'].forEach(function (p) {
    document.getElementById('vig-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-vigilancia .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
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

/* ---------------- ADMINISTRADOR ---------------- */
function iniciarAdmin() {
  document.getElementById('vista-admin').classList.remove('oculto');
  cargarDashboardAdmin();
}

function mostrarPanelAdmin(panel, btn) {
  ['inicio', 'pagos'].forEach(function (p) {
    document.getElementById('admin-panel-' + p).classList.toggle('oculto', p !== panel);
  });
  document.querySelectorAll('#vista-admin .tab-btn').forEach(function (b) { b.classList.remove('activo'); });
  btn.classList.add('activo');
  if (panel === 'pagos') cargarPagosPendientesUI();
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
