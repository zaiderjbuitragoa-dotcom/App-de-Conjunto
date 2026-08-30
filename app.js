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

// ✅ FIX: la sesión solo vivía en esta variable de JS, así que
// cualquier refresh de la página la perdía y mandaba de vuelta al
// login. Ahora se guarda en localStorage y se restaura al cargar,
// sin necesidad de ingresar de nuevo hasta que el usuario cierre
// sesión explícitamente con el botón 🚪.
const CLAVE_SESION = 'miConjuntoSesion';

function guardarSesion(sesion) {
  try { localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)); } catch (e) { /* localStorage no disponible */ }
}

function borrarSesionGuardada() {
  try { localStorage.removeItem(CLAVE_SESION); } catch (e) { /* localStorage no disponible */ }
}

function restaurarSesion() {
  let guardada = null;
  try { guardada = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { guardada = null; }
  if (!guardada || !guardada.idUsuario || !guardada.rol) return;

  SESION = guardada;
  document.getElementById('vista-login').classList.add('oculto');
  if (SESION.rol === 'Residente') iniciarResidente();
  else if (SESION.rol === 'Vigilancia') iniciarVigilancia();
  else if (SESION.rol === 'Administrador') iniciarAdmin();
}

function mostrarCargando(v) {
  document.getElementById('cargando').classList.toggle('oculto', !v);
}

// Helper para formatear horas limpiamente evitando '1899-12-30T19:56:16.000Z'
function formatearHora(str) {
  if (!str) return '';
  const s = String(str).trim();
  if (s.includes('1899-12-30') || s.includes('T')) {
    const matchT = s.match(/T(\d{2}):(\d{2})/);
    if (matchT) {
      let h = parseInt(matchT[1], 10);
      let m = matchT[2];
      let ampm = h >= 12 ? 'PM' : 'AM';
      let h12 = h % 12 || 12;
      return h12 + ':' + m + ' ' + ampm;
    }
  }
  const match24 = s.match(/^(\d{1,2}):(\d{2})(:\d{2})?/);
  if (match24) {
    let h = parseInt(match24[1], 10);
    let m = match24[2];
    let ampm = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
  }
  return s;
}

function formatearFecha(str) {
  if (!str) return '';
  const s = String(str).trim();
  if (s.includes('1899-12-30')) return '';
  if (s.includes('T')) {
    const p = s.split('T')[0].split('-');
    if (p.length === 3) return p[2] + '/' + p[1] + '/' + p[0];
  }
  return s;
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
      guardarSesion(resp);
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

let intervalBadges = null;

function cerrarSesion() {
  SESION = null;
  borrarSesionGuardada();
  Object.keys(_estadoComunicados).forEach(detenerAutoplayAviso);
  if (intervalBadges) {
    clearInterval(intervalBadges);
    intervalBadges = null;
  }
  detenerCamaraPlaca();

  // Ocultar todos los paneles modales que estén abiertos
  const modales = document.querySelectorAll('.panel-modal');
  modales.forEach(function (m) { m.classList.add('oculto'); });

  // Ocultar todas las pantallas principales
  ['vista-residente', 'vista-vigilancia', 'vista-admin', 'vista-registro'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('oculto');
  });

  // Mostrar la pantalla de login limpia
  const vistaLogin = document.getElementById('vista-login');
  if (vistaLogin) vistaLogin.classList.remove('oculto');

  const emailInput = document.getElementById('login-email');
  if (emailInput) emailInput.value = '';

  const errOutput = document.getElementById('login-error');
  if (errOutput) errOutput.innerText = '';
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

/* ---------------- Lightbox: ampliar imagen completa al hacer click ---------------- */
function abrirImagenCompleta(src) {
  if (!src) return;
  const overlay = document.getElementById('lightbox-overlay');
  const img = document.getElementById('lightbox-img');
  img.src = src;
  overlay.classList.remove('oculto');
}

function cerrarImagenCompleta() {
  const overlay = document.getElementById('lightbox-overlay');
  overlay.classList.add('oculto');
  document.getElementById('lightbox-img').src = '';
}

/* ---------------- AVISOS / COMUNICADOS (Carrusel & Formateador Drive) ---------------- */
const _estadoComunicados = {}; // almacena { lista: [], idx: 0, timer } por contenedor
const DURACION_SLIDE_AVISO_MS = 5000;

function extraerDriveId(url) {
  if (!url) return '';
  const match = String(url).match(/[-\w]{25,}/);
  return match ? match[0] : '';
}

function cargarComunicados(contenedorId) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  detenerAutoplayAviso(contenedorId);
  llamarAPI('getComunicados', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const comunicados = r.comunicados || [];
      if (!comunicados.length) {
        cont.innerHTML = '<h3 style="margin:0; color:#ffffff !important; font-size:13px; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; opacity:1 !important;">📢 Avisos del conjunto</h3><p style="color:#ffffff; opacity:.9; font-size:13px; margin:8px 0 0 0;">No hay avisos vigentes por ahora.</p>';
        return;
      }
      _estadoComunicados[contenedorId] = { lista: comunicados, idx: 0, timer: null };
      renderComunicadoSlide(contenedorId);
      iniciarAutoplayAviso(contenedorId);
    });
}

// ✅ Autoplay tipo "Estado de WhatsApp": con más de 3 avisos, pasan
// solos cada pocos segundos con una barrita de progreso arriba.
// Con 3 o menos, el usuario los pasa manualmente con las flechas/puntos.
function iniciarAutoplayAviso(contenedorId) {
  const st = _estadoComunicados[contenedorId];
  if (!st || st.lista.length <= 3) return;
  detenerAutoplayAviso(contenedorId);
  st.timer = setInterval(function () {
    st.idx += 1;
    renderComunicadoSlide(contenedorId);
  }, DURACION_SLIDE_AVISO_MS);
}

function detenerAutoplayAviso(contenedorId) {
  const st = _estadoComunicados[contenedorId];
  if (st && st.timer) { clearInterval(st.timer); st.timer = null; }
}

function renderComunicadoSlide(contenedorId) {
  const cont = document.getElementById(contenedorId);
  const st = _estadoComunicados[contenedorId];
  if (!cont || !st || !st.lista.length) return;

  const total = st.lista.length;
  if (st.idx >= total) st.idx = 0;
  if (st.idx < 0) st.idx = total - 1;

  const c = st.lista[st.idx];
  const fecha = c.Fecha_Publicacion ? new Date(c.Fecha_Publicacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '';
  const driveId = extraerDriveId(c.Adjunto_URL);

  // URL directa de CDN de Google que carga 100% confiable en <img>
  const imgSrc = driveId
    ? ('https://lh3.googleusercontent.com/d/' + driveId + '=w1000')
    : c.Adjunto_URL;

  let navHtml = '';
  if (total > 1) {
    navHtml = `
      <div class="anuncios-nav-btns">
        <button class="btn-nav-aviso" onclick="cambiarSlideAviso('${contenedorId}', -1)" title="Anterior">❮</button>
        <span style="font-size:11px; opacity:0.9; font-weight:800;">${st.idx + 1} / ${total}</span>
        <button class="btn-nav-aviso" onclick="cambiarSlideAviso('${contenedorId}', 1)" title="Siguiente">❯</button>
      </div>`;
  }

  // Con más de 3 avisos se muestran barritas de progreso (estilo estado
  // de WhatsApp) en vez de los puntos, porque avanzan solas.
  let progresoHtml = '';
  let dotsHtml = '';
  if (total > 3) {
    progresoHtml = '<div class="anuncios-progreso">' +
      st.lista.map(function (_, i) {
        const clase = i < st.idx ? 'completa' : (i === st.idx ? 'activa' : '');
        return '<div class="barra ' + clase + '"><div class="relleno"></div></div>';
      }).join('') +
      '</div>';
  } else if (total > 1) {
    dotsHtml = '<div class="anuncios-dots">' +
      st.lista.map(function (_, i) {
        return `<span class="dot-aviso ${i === st.idx ? 'activo' : ''}" onclick="irASlideAviso('${contenedorId}', ${i})"></span>`;
      }).join('') +
      '</div>';
  }

  let imgTag = '';
  if (c.Adjunto_URL) {
    const fallbackSrc = driveId ? ('https://drive.google.com/thumbnail?id=' + driveId + '&sz=w1000') : c.Adjunto_URL;
    imgTag = `
      <img class="img-comunicado" src="${imgSrc}" alt="${c.Titulo || 'Imagen aviso'}"
        onclick="event.stopPropagation(); abrirImagenCompleta(this.src)"
        onerror="this.onerror=null; this.src='${fallbackSrc}';">
    `;
  }

  cont.innerHTML = `
    ${progresoHtml}
    <div class="anuncios-header-row">
      <h3 style="margin:0; color:#ffffff !important; font-size:13px; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; opacity:1 !important;">📢 Avisos del conjunto</h3>
      ${navHtml}
    </div>
    <div class="anuncio-item" style="margin-bottom:0;">
      <div class="titulo" style="font-size:15px; font-weight:800;">${c.Titulo}</div>
      <div style="margin-top:4px; opacity:0.95;">${c.Contenido}</div>
      ${imgTag}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <span class="fecha">${fecha}</span>
        ${c.Dirigido_A ? `<span style="font-size:10px; background:rgba(255,255,255,0.2); padding:2px 8px; border-radius:10px; font-weight:700;">${c.Dirigido_A}</span>` : ''}
      </div>
    </div>
    ${dotsHtml}
  `;

  // Fuerza el reinicio de la animación de la barra activa (si el
  // elemento ya nace con width:100% no se ve la transición).
  if (total > 3) {
    const relleno = cont.querySelector('.barra.activa .relleno');
    if (relleno) {
      relleno.style.transition = 'none';
      relleno.style.width = '0%';
      void relleno.offsetWidth; // fuerza reflow
      relleno.style.transition = 'width ' + DURACION_SLIDE_AVISO_MS + 'ms linear';
      relleno.style.width = '100%';
    }
  }
}

function cambiarSlideAviso(contenedorId, dir) {
  const st = _estadoComunicados[contenedorId];
  if (!st) return;
  st.idx += dir;
  renderComunicadoSlide(contenedorId);
  iniciarAutoplayAviso(contenedorId); // reinicia el conteo tras interacción manual
}

function irASlideAviso(contenedorId, index) {
  const st = _estadoComunicados[contenedorId];
  if (!st) return;
  st.idx = index;
  renderComunicadoSlide(contenedorId);
  iniciarAutoplayAviso(contenedorId);
}

/* ---------------- RESIDENTE ---------------- */
function iniciarResidente() {
  document.getElementById('vista-residente').classList.remove('oculto');
  document.getElementById('res-nombre').innerText = SESION.nombre;
  cargarComunicados('res-anuncios');
  cargarEstadoCuenta();
  cargarMisVisitas();
  cargarBadgesResidente();
  if (intervalBadges) clearInterval(intervalBadges);
  intervalBadges = setInterval(cargarBadgesResidente, 15000);
}

function cargarBadgesResidente() {
  llamarAPI('getMisVisitas', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const pend = (r.visitas || []).filter(function (v) { return v.Estado === 'Pendiente'; });
      ponerBadge('badge-res-visitas', pend.length);
    });

  llamarAPI('getMisReservas', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const pend = (r.reservas || []).filter(function (res) { return res.Estado === 'Pendiente'; });
      ponerBadge('badge-res-zonas', pend.length);
    });

  llamarAPI('getMisMultas', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const pend = (r.multas || []).filter(function (m) { return m.Estado === 'Pendiente'; });
      ponerBadge('badge-res-multas', pend.length);
    });

  llamarAPI('getMisPQRS', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      const abiertas = (r.pqrs || []).filter(function (p) { return p.Estado !== 'Cerrado'; });
      ponerBadge('badge-res-pqrs', abiertas.length);
    });
}

function mostrarPanelResidente(panel) {
  document.getElementById('res-panel-' + panel).classList.remove('oculto');
  if (panel === 'visitas') cargarMisVisitas();
  if (panel === 'pagos') cargarHistorialPagos();
  if (panel === 'vehiculos') cargarMisVehiculos();
  if (panel === 'zonas') { cargarZonasComunes(); cargarMisReservas(); }
  if (panel === 'piscina') cargarMisAccesosPiscina();
  if (panel === 'multas') cargarMisMultas();
  if (panel === 'pqrs') cargarMisPQRS();
}

function cerrarModuloResidente() {
  ['visitas', 'pagos', 'vehiculos', 'zonas', 'piscina', 'multas', 'pqrs'].forEach(function (p) {
    document.getElementById('res-panel-' + p).classList.add('oculto');
  });
  cargarBadgesResidente();
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
        const fechaFmt = formatearFecha(v.Fecha_Programada) || v.Fecha_Programada;
        const horaFmt = formatearHora(v.Hora_Programada);
        cont.innerHTML += '<div class="item-lista"><b>' + v.Nombre_Visitante + '</b> — ' + fechaFmt + (horaFmt ? ' (' + horaFmt + ')' : '') +
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
    }).then(function (r) {
      mostrarCargando(false);
      const el = document.getElementById('pago-resultado');
      // ✅ FIX: verificar r.ok antes de mostrar éxito
      if (!r.ok) {
        el.innerHTML = '<span style="color:var(--rojo)">❌ ' + (r.mensaje || 'Error al guardar el comprobante') + '</span>';
        return;
      }
      el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Comprobante enviado, pendiente de validación.</span>';
      document.getElementById('pago-valor').value = '';
      document.getElementById('pago-periodo').value = '';
      document.getElementById('pago-archivo').value = '';
      cargarHistorialPagos();
    }).catch(function (err) {
      mostrarCargando(false);
      document.getElementById('pago-resultado').innerHTML = '<span style="color:var(--rojo)">❌ Error: ' + err.message + '</span>';
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

// Guarda el último estado de cuenta generado para poder crear el
// PDF sin volver a llamar al backend.
let _ultimoEstadoCuenta = null;

// ✅ Genera el estado de cuenta completo bajo demanda: cargos
// itemizados (concepto por concepto, igual que el estado de cuenta
// oficial del conjunto), total pagado y saldo final.
function generarEstadoCuentaUI() {
  const cont = document.getElementById('detalle-estado-cuenta');
  cont.innerHTML = '<p style="font-size:13px; color:var(--texto-suave);">Generando...</p>';
  llamarAPI('getEstadoCuenta', { idUsuario: SESION.idUsuario, idApto: SESION.idApto })
    .then(function (r) {
      if (!r.ok) { cont.innerHTML = '<p style="color:var(--rojo)">No se pudo generar el estado de cuenta.</p>'; return; }
      _ultimoEstadoCuenta = r;
      const cargos = r.cargos || [];
      const filasCargos = cargos.length
        ? cargos.map(function (c) {
            return '<div class="item-lista"><b>' + c.Concepto + '</b> (' + c.Periodo + ')' +
              '<br><span style="font-size:13px; color:var(--texto-suave);">' + formatearFecha(c.Fecha) + ' — $' + Number(c.Valor || 0).toLocaleString('es-CO') + '</span></div>';
          }).join('')
        : '<p style="font-size:13px; color:var(--texto-suave);">No tienes cargos asignados todavía.</p>';

      cont.innerHTML = `
        <div class="card" style="background:var(--verde-claro); margin-top:10px;">
          <p style="margin:0 0 4px 0; font-size:13px;">Total cargado: <b>$${Number(r.totalCargos || 0).toLocaleString('es-CO')}</b></p>
          <p style="margin:0 0 4px 0; font-size:13px;">Total pagado (validado): <b>$${Number(r.totalPagado || 0).toLocaleString('es-CO')}</b></p>
          <p style="margin:0; font-size:15px; font-weight:800; color:${r.estado === 'Mora' ? 'var(--rojo)' : 'var(--verde-oscuro)'};">
            ${r.estado === 'Mora' ? '🔴 Saldo pendiente: $' + Number(r.saldo).toLocaleString('es-CO') : '🟢 Estás al día'}
          </p>
        </div>
        <p style="font-size:13px; font-weight:700; margin:14px 0 6px 0;">Detalle de cargos:</p>
        ${filasCargos}
        <button class="secundario" style="margin-top:10px;" onclick="generarPDFEstadoCuentaUI()">📄 Descargar PDF</button>
      `;
    })
    .catch(function (err) {
      cont.innerHTML = '<p style="color:var(--rojo)">Error: ' + err.message + '</p>';
    });
}

// ✅ FIX: antes el botón hacía window.print(), que abre el diálogo
// de impresión de TODA la página (menú, otros paneles, etc.), no
// solo el estado de cuenta. Ahora se genera un archivo PDF real,
// con únicamente los datos del estado de cuenta, usando jsPDF.
function generarPDFEstadoCuentaUI() {
  const r = _ultimoEstadoCuenta;
  if (!r) return;
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) { alert('No se pudo cargar el generador de PDF. Revisa tu conexión e inténtalo de nuevo.'); return; }

  const doc = new jsPDFCtor({ unit: 'pt', format: 'letter' });
  const margenIzq = 48;
  let y = 56;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Estado de cuenta', margenIzq, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Apartamento: ' + (SESION.idApto || ''), margenIzq, y);
  y += 16;
  doc.text('Generado: ' + new Date().toLocaleDateString('es-CO'), margenIzq, y);
  y += 26;

  doc.setFont('helvetica', 'bold');
  doc.text('Total cargado: $' + Number(r.totalCargos || 0).toLocaleString('es-CO'), margenIzq, y);
  y += 16;
  doc.text('Total pagado (validado): $' + Number(r.totalPagado || 0).toLocaleString('es-CO'), margenIzq, y);
  y += 16;
  doc.setTextColor(r.estado === 'Mora' ? 200 : 0, r.estado === 'Mora' ? 30 : 120, 0);
  doc.text(r.estado === 'Mora' ? 'Saldo pendiente: $' + Number(r.saldo).toLocaleString('es-CO') : 'Estas al dia', margenIzq, y);
  doc.setTextColor(0, 0, 0);
  y += 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Detalle de cargos', margenIzq, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const cargos = r.cargos || [];
  if (!cargos.length) {
    doc.text('No tienes cargos asignados todavía.', margenIzq, y);
    y += 16;
  } else {
    cargos.forEach(function (c) {
      if (y > 740) { doc.addPage(); y = 56; }
      doc.setFont('helvetica', 'bold');
      doc.text(String(c.Concepto || '') + ' (' + (c.Periodo || '') + ')', margenIzq, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.text(formatearFecha(c.Fecha) + ' — $' + Number(c.Valor || 0).toLocaleString('es-CO'), margenIzq, y);
      y += 18;
    });
  }

  doc.save('estado-de-cuenta-' + (SESION.idApto || '') + '.pdf');
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
        cont.innerHTML += '<div class="item-lista"><b>' + res.Nombre_Zona + '</b> — ' + formatearFecha(res.Fecha) + ' (' + formatearHora(res.Hora_Inicio) + ' - ' + formatearHora(res.Hora_Fin) + ')' +
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
function actualizarFilasAcompanantesPiscina() {
  const n = parseInt(document.getElementById('piscina-acompanantes').value, 10) || 0;
  const cont = document.getElementById('piscina-acompanantes-rows');
  cont.innerHTML = '';
  if (n <= 0) return;

  cont.innerHTML += n > 2
    ? '<p style="color:var(--rojo); font-size:12px; margin:6px 0;">Con más de 2 acompañantes, nombre, edad y firma son obligatorios para cada uno (evita inconvenientes en portería).</p>'
    : '<p style="color:var(--texto-suave); font-size:12px; margin:6px 0;">Nombre, edad y firma son opcionales con 2 o menos acompañantes.</p>';

  for (let i = 0; i < n; i++) {
    cont.innerHTML += `
      <div class="card" style="background:var(--verde-claro); margin-bottom:10px; padding:14px;">
        <p style="margin:0 0 8px 0; font-weight:700; font-size:13px;">Acompañante ${i + 1}</p>
        <input type="text" id="piscina-acomp-nombre-${i}" placeholder="Nombre completo">
        <input type="number" id="piscina-acomp-edad-${i}" placeholder="Edad" min="0">
        <p style="font-size:12px; color:var(--texto-suave); margin:0 0 4px 0;">Firma (dibuja con el dedo o el mouse):</p>
        <canvas id="piscina-acomp-firma-${i}" width="280" height="90" style="width:100%; background:white; border:1.5px solid var(--borde); border-radius:8px; touch-action:none; margin-bottom:8px;"></canvas>
        <button type="button" class="secundario" onclick="limpiarFirmaPiscina(${i})">Limpiar firma</button>
      </div>`;
  }
  for (let i = 0; i < n; i++) inicializarFirmaPiscina(i);
}

function inicializarFirmaPiscina(i) {
  const canvas = document.getElementById('piscina-acomp-firma-' + i);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1e293b';
  let dibujando = false;

  function posicion(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {
      x: (p.clientX - rect.left) * (canvas.width / rect.width),
      y: (p.clientY - rect.top) * (canvas.height / rect.height)
    };
  }
  function iniciar(e) { dibujando = true; const p = posicion(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function mover(e) { if (!dibujando) return; const p = posicion(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function soltar() { dibujando = false; }

  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', mover);
  canvas.addEventListener('mouseup', soltar);
  canvas.addEventListener('mouseleave', soltar);
  canvas.addEventListener('touchstart', iniciar);
  canvas.addEventListener('touchmove', mover);
  canvas.addEventListener('touchend', soltar);
}

function limpiarFirmaPiscina(i) {
  const canvas = document.getElementById('piscina-acomp-firma-' + i);
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function canvasTieneFirma(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true;
  }
  return false;
}

function registrarAccesoPiscinaUI() {
  const fecha = document.getElementById('piscina-fecha').value;
  const numAcompanantes = parseInt(document.getElementById('piscina-acompanantes').value, 10) || 0;
  if (!fecha) { alert('Selecciona la fecha'); return; }

  const acompanantes = [];
  for (let i = 0; i < numAcompanantes; i++) {
    const nombreEl = document.getElementById('piscina-acomp-nombre-' + i);
    const edadEl = document.getElementById('piscina-acomp-edad-' + i);
    const canvas = document.getElementById('piscina-acomp-firma-' + i);
    const firma = canvas && canvasTieneFirma(canvas) ? canvas.toDataURL('image/png').split(',')[1] : '';
    acompanantes.push({
      nombre: nombreEl ? nombreEl.value.trim() : '',
      edad: edadEl ? edadEl.value : '',
      firma: firma
    });
  }

  if (numAcompanantes > 2) {
    const incompleto = acompanantes.some(function (a) { return !a.nombre || !a.edad || !a.firma; });
    if (incompleto) { alert('Con más de 2 acompañantes debes completar nombre, edad y firma de cada uno.'); return; }
  }

  mostrarCargando(true);
  llamarAPI('registrarAccesoPiscina', {
    idUsuario: SESION.idUsuario, idApto: SESION.idApto,
    fecha: fecha, acompanantes: acompanantes
  }).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('piscina-resultado');
    if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
    el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Acceso solicitado.</span>';
    document.getElementById('piscina-acompanantes').value = '';
    document.getElementById('piscina-acompanantes-rows').innerHTML = '';
    cargarMisAccesosPiscina();
  }).catch(function (err) {
    mostrarCargando(false);
    alert('Error registrando acceso: ' + err.message);
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
        const detalle = Array.isArray(a.Acompanantes_Detalle) ? a.Acompanantes_Detalle : [];
        const nombresTxt = detalle.length
          ? detalle.map(function (d) { return d.nombre + (d.edad ? ' (' + d.edad + ' años)' : ''); }).join(', ')
          : '';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + formatearFecha(a.Fecha) + '</b> <span class="badge ' + clase + '">' + a.Estado + '</span>' +
          (a.Num_Acompanantes ? '<br><span style="font-size:13px; color:var(--texto-suave);">👥 ' + a.Num_Acompanantes + ' acompañante(s)' + (nombresTxt ? ': ' + nombresTxt : '') + '</span>' : '') +
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
          '<br><span style="font-size:13px; color:var(--texto-suave);">💲 $' + m.Valor + ' — ' + formatearFecha(m.Fecha) + '</span>' +
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
          '<br><span style="font-size:12px; color:var(--texto-suave);">' + formatearFecha(p.Fecha) + '</span>' +
          (p.Respuesta ? '<br><div style="margin-top:6px; padding:8px 10px; background:var(--verde-claro); border-radius:8px; font-size:13px;"><b>Respuesta:</b> ' + p.Respuesta + '</div>' : '') +
          '</div>';
      });
    });
}

/* ---------------- VIGILANCIA ---------------- */
function iniciarVigilancia() {
  document.getElementById('vista-vigilancia').classList.remove('oculto');
  cargarComunicados('vig-anuncios');
  cargarBannerSOS();
  cargarBadgesVigilancia();
  if (intervalBadges) clearInterval(intervalBadges);
  intervalBadges = setInterval(cargarBadgesVigilancia, 15000);
}

function cargarBadgesVigilancia() {
  llamarAPI('getVisitasHoy', { idUsuario: SESION.idUsuario })
    .then(function (r) { ponerBadge('badge-vig-visitas', (r.visitas || []).length); });

  llamarAPI('getNovedadesAbiertas', { idUsuario: SESION.idUsuario })
    .then(function (r) { ponerBadge('badge-vig-novedades', (r.novedades || []).length); });

  llamarAPI('getAccesosPiscinaHoy', { idUsuario: SESION.idUsuario })
    .then(function (r) { ponerBadge('badge-vig-piscina', (r.accesos || []).filter(function (a) { return a.Estado === 'Pendiente'; }).length); });

  llamarAPI('getAlertasActivas', { idUsuario: SESION.idUsuario })
    .then(function (r) { ponerBadge('badge-vig-sos', (r.alertas || []).length); });

  llamarAPI('getActasVigilancia', { idUsuario: SESION.idUsuario })
    .then(function (r) { ponerBadge('badge-vig-actas', (r.actas || []).length); });
}

function mostrarPanelVigilancia(panel) {
  document.getElementById('vig-panel-' + panel).classList.remove('oculto');
  if (panel === 'visitas') cargarVisitasHoy();
  if (panel === 'piscina') cargarPiscinaHoy();
  if (panel === 'sos') cargarAlertasSOSVigilancia();
  if (panel === 'actas') cargarActasVigilancia();
}

function cerrarModuloVigilancia() {
  ['placas', 'visitas', 'novedades', 'piscina', 'sos', 'actas'].forEach(function (p) {
    document.getElementById('vig-panel-' + p).classList.add('oculto');
  });
  detenerCamaraPlaca();
  cargarBannerSOS();
  cargarBadgesVigilancia();
}

function cargarVisitasHoy() {
  llamarAPI('getVisitasHoy', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-visitas-hoy');
      const visitas = r.visitas || [];
      cont.innerHTML = visitas.length ? '' : '<p>No hay visitantes esperados hoy.</p>';
      visitas.forEach(function (v) {
        const horaLimpia = formatearHora(v.Hora_Programada || v.Fecha_Programada);
        cont.innerHTML += '<div class="item-lista"><b>' + v.Nombre_Visitante + '</b> (' + (v.Documento_Visitante || 'Sin doc') + ')' +
          (horaLimpia ? ' — 🕒 <b>' + horaLimpia + '</b>' : '') + '<br><b>Apto:</b> ' + v.ID_Apto +
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
// ✅ FIX: ahora la lista incluye los accesos ya autorizados (Estado
// 'Ingresó') además de los pendientes, así que ya no "desaparecen"
// al marcar el ingreso — simplemente se les quita el botón y se les
// pone el badge de "Ingresó". Solo se muestran los de HOY, y si no
// hay ninguno, el contenedor queda vacío (sin texto de "no hay...").
function cargarPiscinaHoy() {
  llamarAPI('getAccesosPiscinaHoy', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-piscina-hoy');
      const accesos = r.accesos || [];
      cont.innerHTML = '';
      accesos.forEach(function (a) {
        const detalle = Array.isArray(a.Acompanantes_Detalle) ? a.Acompanantes_Detalle : [];
        const detalleHtml = detalle.length
          ? '<div style="margin-top:6px;">' + detalle.map(function (d) {
              return '<div style="font-size:13px; color:var(--texto-suave);">• ' + (d.nombre || 'Sin nombre') +
                (d.edad ? ' (' + d.edad + ' años)' : '') +
                (d.firmaUrl ? ' — <a href="' + d.firmaUrl + '" target="_blank">ver firma</a>' : ' — sin firma') +
                '</div>';
            }).join('') + '</div>'
          : '';
        const yaIngreso = a.Estado === 'Ingresó';
        cont.innerHTML += '<div class="item-lista"><b>Apto ' + a.ID_Apto + '</b>' +
          ' <span class="badge ' + (yaIngreso ? 'validado' : 'pendiente') + '">' + a.Estado + '</span>' +
          (a.Num_Acompanantes ? ' — 👥 ' + a.Num_Acompanantes + ' acompañante(s)' : '') +
          detalleHtml +
          (yaIngreso ? '' : '<br><button class="verde" style="margin-top:6px;" onclick="marcarIngresoPiscinaUI(\'' + a.ID_Acceso + '\')">✅ Marcar ingreso</button>') +
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

/* ---------------- SOS (vigilancia) ---------------- */
function cargarBannerSOS() {
  llamarAPI('getAlertasActivas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const alertas = r.alertas || [];
      const banner = document.getElementById('vig-banner-sos');
      const badge = document.getElementById('badge-vig-sos');
      if (!alertas.length) {
        banner.innerHTML = '';
        if (badge) badge.classList.add('oculto');
        return;
      }
      banner.innerHTML = '<div class="banner-sos">🆘 ' + alertas.length + ' alerta(s) activa(s) — revisa la pestaña SOS</div>';
      if (badge) { badge.innerText = alertas.length; badge.classList.remove('oculto'); }
    });
}

// ✅ FIX: carga y muestra el conteo de novedades abiertas en el badge de vigilancia
function cargarBadgeNovedadesVigilancia() {
  llamarAPI('getNovedadesAbiertas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const novedades = r.novedades || [];
      const badge = document.getElementById('badge-vig-novedades');
      if (!badge) return;
      if (novedades.length > 0) {
        badge.innerText = novedades.length;
        badge.classList.remove('oculto');
      } else {
        badge.classList.add('oculto');
      }
    })
    .catch(function () { /* si falla, simplemente no muestra badge */ });
}

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
      cargarBannerSOS();
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
        cont.innerHTML += '<div class="item-lista"><b>' + a.Turno + '</b> — ' + formatearFecha(a.Fecha) +
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
  if (intervalBadges) clearInterval(intervalBadges);
  intervalBadges = setInterval(cargarDashboardAdmin, 15000);
}

function mostrarPanelAdmin(panel) {
  document.getElementById('admin-panel-' + panel).classList.remove('oculto');
  if (panel === 'vehiculos') cargarTodosVehiculosAdmin();
  if (panel === 'pagos') cargarPagosPendientesUI();
  if (panel === 'cargos') { cargarApartamentosCargosSelect(); cargarCargosAdmin(); }
  if (panel === 'aprobaciones') cargarUsuariosPendientesUI();
  if (panel === 'anuncios') cargarComunicadosAdmin();
  if (panel === 'zonas') { cargarZonasAdmin(); cargarReservasPendientesAdmin(); cargarReservasConfirmadasAdmin(); }
  if (panel === 'guardas') { cargarGuardias(); cargarActasAdmin(); }
  if (panel === 'multas') { cargarApartamentosSelect(); cargarMultasAdmin(); }
  if (panel === 'pqrs') cargarPQRSAdmin();
  if (panel === 'mantenimiento') cargarMantenimientoAdmin();
  if (panel === 'sos') cargarAlertasSOSAdmin();
  if (panel === 'piscina') cargarPiscinaHoyAdmin();
}

function cerrarModuloAdmin() {
  ['vehiculos', 'pagos', 'cargos', 'aprobaciones', 'anuncios', 'zonas', 'guardas', 'multas', 'pqrs', 'mantenimiento', 'sos', 'piscina'].forEach(function (p) {
    document.getElementById('admin-panel-' + p).classList.add('oculto');
  });
  cargarDashboardAdmin();
}

function cargarDashboardAdmin() {
  llamarAPI('getDashboardAdmin', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const d = r.datos;
      document.getElementById('admin-count-pagos').innerText = d.pagosPendientes;
      document.getElementById('admin-count-novedades').innerText = d.novedadesAbiertas;
      document.getElementById('admin-count-pqrs').innerText = d.pqrsAbiertos;
      ponerBadge('badge-admin-pagos', d.pagosPendientes);
      ponerBadge('badge-admin-novedades', d.novedadesAbiertas);
      ponerBadge('badge-admin-pqrs', d.pqrsAbiertos);
    });

  llamarAPI('getUsuariosPendientes', { idUsuario: SESION.idUsuario })
    .then(function (r) { ponerBadge('badge-admin-aprobaciones', (r.usuarios || []).length); });

  llamarAPI('getAlertasActivas', { idUsuario: SESION.idUsuario })
    .then(function (r) { ponerBadge('badge-admin-sos', (r.alertas || []).length); });

  llamarAPI('getReservasPendientes', { idUsuario: SESION.idUsuario })
    .then(function (r) { ponerBadge('badge-admin-zonas', (r.reservas || []).length); });

  llamarAPI('getMantenimiento', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const pendientes = (r.reportes || []).filter(function (m) { return m.Estado !== 'Resuelto'; });
      ponerBadge('badge-admin-mantenimiento', pendientes.length);
    });

  llamarAPI('getTodosVehiculosAdmin', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const enMora = (r.vehiculos || []).filter(function (v) { return v.EstaEnMora || v.Autorizado === 'Bloqueado'; });
      ponerBadge('badge-admin-vehiculos', enMora.length);
    });
}

function ponerBadge(idBadge, cantidad) {
  const el = document.getElementById(idBadge);
  if (!el) return;
  if (cantidad > 0) { el.innerText = cantidad; el.classList.remove('oculto'); }
  else { el.classList.add('oculto'); }
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
  const fechaPublicacion = document.getElementById('an-publicacion').value;
  const fechaExpiracion = document.getElementById('an-expiracion').value;
  const archivo = document.getElementById('an-imagen').files[0];
  if (!titulo || !contenido) { alert('Completa el título y el mensaje'); return; }

  function enviar(base64, nombreArchivo, mimeType) {
    mostrarCargando(true);
    llamarAPI('crearComunicado', {
      idUsuario: SESION.idUsuario, titulo: titulo, contenido: contenido,
      dirigidoA: dirigidoA, fechaPublicacion: fechaPublicacion, fechaExpiracion: fechaExpiracion,
      base64: base64 || '', nombreArchivo: nombreArchivo || '', mimeType: mimeType || ''
    }).then(function (r) {
      mostrarCargando(false);
      const el = document.getElementById('an-resultado');
      if (!r.ok) { el.innerHTML = '<span style="color:var(--rojo)">' + r.mensaje + '</span>'; return; }
      el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ Comunicado publicado.</span>';
      document.getElementById('an-titulo').value = '';
      document.getElementById('an-contenido').value = '';
      document.getElementById('an-publicacion').value = '';
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
      const ahora = new Date();
      const hoy = new Date().setHours(0, 0, 0, 0);
      comunicados.forEach(function (c) {
        const programado = c.Fecha_Publicacion && new Date(c.Fecha_Publicacion) > ahora;
        const vigente = !programado && (!c.Fecha_Expiracion || new Date(c.Fecha_Expiracion).setHours(0, 0, 0, 0) >= hoy);
        const estadoBadge = programado
          ? '<span class="badge pendiente">Programado</span>'
          : '<span class="badge ' + (vigente ? 'autorizado' : 'no-autorizado') + '">' + (vigente ? 'Publicado' : 'Vencido') + '</span>';
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + c.Titulo + '</b> ' + estadoBadge +
          ' <span class="badge pendiente">' + (c.Dirigido_A || 'Todos') + '</span>' +
          (programado ? '<br><span style="font-size:12px; color:var(--texto-suave);">📅 Se publicará el ' + formatearFecha(String(c.Fecha_Publicacion).split('T')[0] || c.Fecha_Publicacion) + '</span>' : '') +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + c.Contenido + '</span>' +
          (c.Adjunto_URL ? '<img class="miniatura-aviso" src="' + c.Adjunto_URL + '" onclick="abrirImagenCompleta(this.src)">' : '') +
          ((vigente || programado) ? '<br><button class="rojo" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="retirarComunicadoUI(\'' + c.ID_Comunicado + '\')">Retirar</button>' : '') +
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
          formatearFecha(res.Fecha) + ' (' + formatearHora(res.Hora_Inicio) + ' - ' + formatearHora(res.Hora_Fin) + ')' +
          '<br><button style="margin-top:8px; width:auto; padding:8px 14px;" onclick="resolverReservaUI(\'' + res.ID_Reserva + '\', \'Confirmada\')">Aprobar</button> ' +
          '<button class="rojo" style="margin-top:8px; width:auto; padding:8px 14px;" onclick="resolverReservaUI(\'' + res.ID_Reserva + '\', \'Rechazada\')">Rechazar</button>' +
          '</div>';
      });
    });
}

/* ---------------- ADMIN · RESERVAS CONFIRMADAS (solo lectura) ---------------- */
// ✅ Antes solo se veían las pendientes de aprobar; esta sección
// separada deja ver qué ya quedó confirmado, para que no parezca
// que esa información desapareció o no existe.
function cargarReservasConfirmadasAdmin() {
  llamarAPI('getReservasConfirmadas', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-reservas-confirmadas');
      const reservas = r.reservas || [];
      cont.innerHTML = reservas.length ? '' : '<p>No hay reservas confirmadas.</p>';
      reservas.forEach(function (res) {
        cont.innerHTML += '<div class="item-lista">' +
          '<b>' + res.Nombre_Zona + '</b> — Apto ' + res.ID_Apto +
          ' <span class="badge validado">Confirmada</span><br>' +
          formatearFecha(res.Fecha) + ' (' + formatearHora(res.Hora_Inicio) + ' - ' + formatearHora(res.Hora_Fin) + ')' +
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
      cargarReservasConfirmadasAdmin();
      cargarDashboardAdmin();
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

/* ---------------- ADMIN · PISCINA HOY (solo lectura) ---------------- */
// Misma fuente que portería (getAccesosPiscinaHoy): solo los accesos
// de HOY, incluidos los ya autorizados. Si no hay ninguno, no se
// muestra ningún mensaje.
function cargarPiscinaHoyAdmin() {
  llamarAPI('getAccesosPiscinaHoy', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-piscina-hoy-admin');
      const accesos = r.accesos || [];
      cont.innerHTML = '';
      accesos.forEach(function (a) {
        const detalle = Array.isArray(a.Acompanantes_Detalle) ? a.Acompanantes_Detalle : [];
        const nombresTxt = detalle.length
          ? detalle.map(function (d) { return d.nombre + (d.edad ? ' (' + d.edad + ' años)' : ''); }).join(', ')
          : '';
        const clase = a.Estado === 'Ingresó' ? 'validado' : 'pendiente';
        cont.innerHTML += '<div class="item-lista"><b>Apto ' + a.ID_Apto + '</b>' +
          ' <span class="badge ' + clase + '">' + a.Estado + '</span>' +
          (a.Num_Acompanantes ? '<br><span style="font-size:13px; color:var(--texto-suave);">👥 ' + a.Num_Acompanantes + ' acompañante(s)' + (nombresTxt ? ': ' + nombresTxt : '') + '</span>' : '') +
          '</div>';
      });
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
        cont.innerHTML += '<div class="item-lista"><b>' + a.Turno + '</b> — ' + formatearFecha(a.Fecha) +
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
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + m.Motivo + ' — $' + m.Valor + ' — ' + formatearFecha(m.Fecha) + '</span>' +
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
          '<br><span style="font-size:13px; color:var(--texto-suave);">Apto ' + p.ID_Apto + ' — ' + formatearFecha(p.Fecha) + '</span>' +
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
          '<br><span style="font-size:12px; color:var(--texto-suave);">Reportado: ' + formatearFecha(m.Fecha_Reporte) + '</span>' +
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

/* ---------------- ADMIN · CARGOS / CUOTAS ---------------- */
function alternarConceptoCargoOtro() {
  const select = document.getElementById('cg-concepto');
  const otro = document.getElementById('cg-concepto-otro');
  const esOtro = select.value === 'Otro';
  otro.classList.toggle('oculto', !esOtro);
  if (esOtro) otro.focus();
}

function cargarApartamentosCargosSelect() {
  const select = document.getElementById('cg-apto');
  if (!select || select.options.length) return;
  llamarAPI('getApartamentos', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const apartamentos = r.apartamentos || [];
      select.innerHTML = '';

      const optTodos = document.createElement('option');
      optTodos.value = 'TODOS';
      optTodos.textContent = '📢 TODOS LOS APARTAMENTOS (Asignación Masiva)';
      select.appendChild(optTodos);

      apartamentos.forEach(function (a) {
        const opt = document.createElement('option');
        opt.value = a.ID_Apto;
        opt.textContent = a.ID_Apto + (a.Numero ? ' (Apto ' + a.Numero + ')' : '');
        select.appendChild(opt);
      });
    });
}

function crearCargoUI() {
  const idApto = document.getElementById('cg-apto').value;
  const select = document.getElementById('cg-concepto');
  const concepto = select.value === 'Otro'
    ? document.getElementById('cg-concepto-otro').value.trim()
    : select.value;
  const valor = document.getElementById('cg-valor').value;
  const periodo = document.getElementById('cg-periodo').value.trim();

  if (!concepto || !valor || !periodo) {
    alert('Completa el concepto, el valor y el periodo (ej. 2026-08)');
    return;
  }

  mostrarCargando(true);
  llamarAPI('crearCargo', {
    idUsuario: SESION.idUsuario,
    idApto: idApto,
    concepto: concepto,
    valor: valor,
    periodo: periodo
  }).then(function (r) {
    mostrarCargando(false);
    const el = document.getElementById('cg-resultado');
    if (!r.ok) {
      el.innerHTML = '<span style="color:var(--rojo)">❌ ' + r.mensaje + '</span>';
      return;
    }
    el.innerHTML = '<span style="color:var(--verde-oscuro)">✅ ' + r.mensaje + '</span>';
    document.getElementById('cg-concepto-otro').value = '';
    document.getElementById('cg-concepto-otro').classList.add('oculto');
    select.selectedIndex = 0;
    document.getElementById('cg-valor').value = '';
    document.getElementById('cg-periodo').value = '';
    cargarCargosAdmin();
  }).catch(function (err) {
    mostrarCargando(false);
    document.getElementById('cg-resultado').innerHTML = '<span style="color:var(--rojo)">❌ Error: ' + err.message + '</span>';
  });
}

function cargarCargosAdmin() {
  llamarAPI('getCargos', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-cargos-admin');
      const cargos = (r.cargos || []).reverse(); // Mas recientes primero
      cont.innerHTML = cargos.length ? '' : '<p>No hay cargos o cuotas asignadas todavía.</p>';
      cargos.slice(0, 30).forEach(function (c) {
        cont.innerHTML += '<div class="item-lista">' +
          '<b>Apto ' + c.ID_Apto + '</b> — $' + Number(c.Valor).toLocaleString('es-CO') +
          '<br><span style="font-size:13px; color:var(--texto-suave);">' + c.Concepto + ' (' + c.Periodo + ')</span>' +
          '</div>';
      });
    });
}

/* ---------------- VIGILANCIA & ADMIN · CONTROL DE PLACAS Y BLOQUEO POR MORA ---------------- */
let streamCamara = null;
let intervaloEscaneoPlaca = null;
let workerPlacaListo = false;
let ultimaCandidataPlaca = null;
// Pool de 2 workers de Tesseract trabajando en paralelo: mientras uno
// está ocupado analizando una captura, el otro ya puede tomar y
// analizar la siguiente. Esto elimina el tiempo muerto de "esperar a
// que termine el OCR anterior" y es lo que realmente acelera la
// lectura en una entrada vehicular — capturar más seguido no sirve de
// nada si solo hay un lector que procesa las capturas una por una.
let poolOCRPlaca = []; // [{ worker, ocupado }, { worker, ocupado }]
const TAMANO_POOL_OCR = 2;
// Formato típico de placas colombianas: 3 letras + 2-3 números (carro) o
// 3 letras + 2 números + 1 letra (moto). Ajusta el patrón si tu país usa otro formato.
// ⚠️ SIN \b: como el texto ya viene limpio (solo A-Z0-9, sin espacios),
// toda la cadena es "una sola palabra" para la regex, así que \b solo
// aparece al principio/final absolutos del string — eso impedía
// encontrar la placa cuando el OCR agregaba una letra de ruido antes o
// después (p. ej. "EAMJY38DL" en vez de "MJY38D"). Sin \b, la placa se
// encuentra como subcadena en cualquier posición.
const REGEX_PLACA = /[A-Z]{3}[0-9]{2,3}[A-Z]?/;

// Recuadro guía de RESPALDO (en % del ancho/alto del video): solo se usa
// si el detector YOLO no pudo cargar (p. ej. sin internet al CDN de
// onnxruntime-web). Con YOLO activo, el recuadro deja de ser fijo y pasa
// a dibujarse dinámicamente donde el modelo realmente encuentra la placa
// — por eso ya NO hace falta encuadrar manualmente ni acercar el carro a
// una zona exacta de la pantalla.
const GUIA_PLACA = { left: 0.12, right: 0.88, top: 0.35, bottom: 0.65 };

// Cuánto margen (proporcional al tamaño de la caja detectada) se agrega
// alrededor de la placa que encontró YOLO antes de recortarla para el
// OCR. Un poco de aire alrededor evita cortar bordes de caracteres.
const MARGEN_CAJA_YOLO = 0.18;

function toggleCamaraPlaca() {
  const container = document.getElementById('camara-container');
  const video = document.getElementById('video-camara');
  if (!container || !video) return;

  if (streamCamara) {
    detenerCamaraPlaca();
    return;
  }

  if (typeof Tesseract === 'undefined') {
    alert('No se pudo cargar el motor de lectura de placas (Tesseract.js). Verifica tu conexión a internet o que un firewall no esté bloqueando cdn.jsdelivr.net, y recarga la página. Mientras tanto puedes escribir la placa manualmente.');
    return;
  }

  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  }).then(function (stream) {
    streamCamara = stream;
    video.srcObject = stream;
    video.style.objectFit = 'cover';
    container.classList.remove('oculto');
    container.style.position = 'relative';
    asegurarGuiaPlaca();
    actualizarEstadoEscaneo('⏳ Cargando motor de lectura...', false);
    // Se cargan en paralelo el pool de OCR (Tesseract) y el detector de
    // posición (YOLO). Si YOLO falla (sin internet, CDN bloqueado, etc.)
    // el escaneo sigue funcionando con el recuadro fijo de respaldo —
    // nunca se pierde la función existente por un fallo del detector nuevo.
    return Promise.all([prepararWorkerPlaca(), inicializarModeloYolo()]);
  }).then(function () {
    if (streamCamara) iniciarEscaneoAutomaticoPlaca();
  }).catch(function (err) {
    if (streamCamara) {
      actualizarEstadoEscaneo('⚠️ Error cargando OCR: ' + err.message, true);
    } else {
      alert('No se pudo acceder a la cámara: ' + err.message);
    }
  });
}

// Dibuja el recuadro guía sobre el contenedor de la cámara, con una
// máscara oscura alrededor para resaltarlo. Se crea una sola vez y
// luego se reutiliza/reposiciona mientras la cámara esté activa:
// - Con YOLO activo, arranca oculto y se va moviendo a donde el
//   detector encuentra la placa (ver actualizarGuiaPlacaDinamica).
// - Sin YOLO (respaldo), queda fijo en GUIA_PLACA como antes.
function asegurarGuiaPlaca() {
  const container = document.getElementById('camara-container');
  if (!container || document.getElementById('guia-placa')) return;
  const guia = document.createElement('div');
  guia.id = 'guia-placa';
  guia.style.cssText =
    'position:absolute; border:3px solid #22c55e; border-radius:10px; ' +
    'pointer-events:none; transition:all 0.12s ease-out; z-index:5;';
  posicionarGuiaPlaca(GUIA_PLACA.left, GUIA_PLACA.top, GUIA_PLACA.right, GUIA_PLACA.bottom, false);
  container.appendChild(guia);
}

// Posiciona el recuadro guía usando fracciones (0–1) left/top/right/bottom
// del tamaño del contenedor. Si 'activa' es true se resalta con la
// máscara oscura (placa detectada ahora mismo); si no, queda tenue.
function posicionarGuiaPlaca(left, top, right, bottom, activa) {
  const guia = document.getElementById('guia-placa');
  if (!guia) return;
  guia.style.left = (left * 100) + '%';
  guia.style.right = ((1 - right) * 100) + '%';
  guia.style.top = (top * 100) + '%';
  guia.style.bottom = ((1 - bottom) * 100) + '%';
  guia.style.boxShadow = activa ? '0 0 0 9999px rgba(0,0,0,0.45)' : '0 0 0 9999px rgba(0,0,0,0.15)';
  guia.style.borderColor = activa ? '#22c55e' : 'rgba(34,197,94,0.5)';
  guia.style.opacity = '1';
}

// Mueve el recuadro guía a la caja que YOLO acaba de detectar (en
// coordenadas de píxel del video), convirtiéndola a fracciones 0–1.
function actualizarGuiaPlacaDinamica(caja, video) {
  if (!caja) {
    const guia = document.getElementById('guia-placa');
    if (guia) guia.style.opacity = '0.35';
    return;
  }
  posicionarGuiaPlaca(
    caja.x1 / video.videoWidth, caja.y1 / video.videoHeight,
    caja.x2 / video.videoWidth, caja.y2 / video.videoHeight,
    true
  );
}

function quitarGuiaPlaca() {
  const guia = document.getElementById('guia-placa');
  if (guia) guia.remove();
}

// Crea el pool de workers de Tesseract UNA sola vez y lo reutiliza en
// cada foto: crear un worker nuevo por cuadro es lento y es lo que
// suele hacer que el escaneo "se cuelgue" sin avisar nada al usuario.
function crearWorkerOCRPlaca() {
  return Tesseract.createWorker('eng').then(function (w) {
    return w.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      // '7' = tratar la imagen como una única línea de texto. Ahora
      // que recortamos el canvas exactamente a la guía verde, la
      // placa siempre ocupa una sola línea, así que este modo es
      // mucho más preciso que "sparse text" (modo '11'), que buscaba
      // palabras sueltas en cualquier parte del cuadro completo.
      tessedit_pageseg_mode: '7'
    }).then(function () { return w; });
  });
}

function prepararWorkerPlaca() {
  if (workerPlacaListo && poolOCRPlaca.length) return Promise.resolve();
  const creaciones = [];
  for (let i = 0; i < TAMANO_POOL_OCR; i++) creaciones.push(crearWorkerOCRPlaca());
  return Promise.all(creaciones).then(function (workers) {
    poolOCRPlaca = workers.map(function (w) { return { worker: w, ocupado: false }; });
    workerPlacaListo = true;
  });
}

function detenerCamaraPlaca() {
  if (intervaloEscaneoPlaca) {
    clearInterval(intervaloEscaneoPlaca);
    intervaloEscaneoPlaca = null;
  }
  ultimaCandidataPlaca = null;
  deteccionYoloEnCurso = false;
  // Libera los workers por si alguno quedó marcado "ocupado" (p. ej. si
  // se cierra la cámara justo cuando una lectura estaba en curso).
  poolOCRPlaca.forEach(function (p) { p.ocupado = false; });
  if (streamCamara) {
    streamCamara.getTracks().forEach(function (t) { t.stop(); });
    streamCamara = null;
  }
  const container = document.getElementById('camara-container');
  if (container) container.classList.add('oculto');
  quitarGuiaPlaca();
  actualizarEstadoEscaneo('', false);
}

function actualizarEstadoEscaneo(texto, esError) {
  const el = document.getElementById('estado-escaneo-placa');
  if (!el) return;
  el.innerText = texto;
  el.style.color = esError ? '#f87171' : '#22c55e';
}

// Intervalo corto a propósito: esto es una entrada vehicular, no puede
// haber trancón esperando al OCR. Con 2 workers en paralelo, un
// intervalo agresivo es seguro: si ambos están ocupados, el ciclo
// simplemente se salta y lo intenta en el siguiente tick.
function iniciarEscaneoAutomaticoPlaca() {
  actualizarEstadoEscaneo(
    yoloEstaListo()
      ? '🔍 La cámara buscará la placa sola, sin importar dónde esté el vehículo'
      : '🔍 Encuadre la placa dentro del recuadro verde',
    false
  );
  intervaloEscaneoPlaca = setInterval(analizarFotogramaPlaca, 400);
}

// true mientras hay una detección YOLO en curso, para no lanzar una
// segunda detección sobre el mismo frame antes de que termine la primera
// (la inferencia YOLO es más pesada que un simple recorte fijo).
let deteccionYoloEnCurso = false;

// Se ejecuta periódicamente mientras la cámara está activa.
//
// Con YOLO disponible: primero se detecta EN QUÉ PARTE del cuadro está
// la placa (sin importar distancia/ángulo — esto es lo que corrige el
// problema de "no enfoca bien" del recuadro fijo). Si no se detecta
// ninguna placa con suficiente confianza, se actualiza el estado visual
// y se sale sin gastar un worker de OCR en un recorte vacío.
//
// Si YOLO no cargó (sin internet al CDN, etc.), se cae automáticamente
// al comportamiento original: recorte fijo dentro de GUIA_PLACA — el
// sistema sigue funcionando exactamente como antes, solo sin el
// enfoque automático.
//
// Una vez se tiene la caja (de YOLO o del recuadro fijo), el resto del
// pipeline es IDÉNTICO al original: recorte, reescalado a ~900px,
// escala de grises + contraste, y envío al primer worker de Tesseract
// libre del pool.
function analizarFotogramaPlaca() {
  if (!streamCamara || !workerPlacaListo) return;

  const video = document.getElementById('video-camara');
  if (!video || !video.videoWidth) return;

  if (yoloEstaListo() && !deteccionYoloEnCurso) {
    deteccionYoloEnCurso = true;
    detectarPlacaYolo(video).then(function (caja) {
      deteccionYoloEnCurso = false;
      actualizarGuiaPlacaDinamica(caja, video);
      if (!caja) {
        actualizarEstadoEscaneo('🔍 Buscando placa en la imagen...', false);
        return;
      }
      procesarRecortePlaca(video, cajaConMargen(caja, video));
    }).catch(function () {
      deteccionYoloEnCurso = false;
    });
    return;
  }

  if (yoloEstaListo()) return; // ya hay una detección YOLO en curso, se salta este ciclo

  // Respaldo: YOLO no está disponible, se usa el recuadro fijo de siempre.
  const vw = video.videoWidth, vh = video.videoHeight;
  procesarRecortePlaca(video, {
    x1: vw * GUIA_PLACA.left, y1: vh * GUIA_PLACA.top,
    x2: vw * GUIA_PLACA.right, y2: vh * GUIA_PLACA.bottom
  });
}

// Agranda un poco la caja detectada por YOLO (margen proporcional a su
// tamaño) y la recorta a los límites del video, para no perder bordes
// de caracteres cuando el modelo ajusta el recuadro muy pegado a la placa.
function cajaConMargen(caja, video) {
  const anchoCaja = caja.x2 - caja.x1;
  const altoCaja = caja.y2 - caja.y1;
  const mx = anchoCaja * MARGEN_CAJA_YOLO;
  const my = altoCaja * MARGEN_CAJA_YOLO;
  return {
    x1: Math.max(0, caja.x1 - mx), y1: Math.max(0, caja.y1 - my),
    x2: Math.min(video.videoWidth, caja.x2 + mx), y2: Math.min(video.videoHeight, caja.y2 + my)
  };
}

// Toma un worker LIBRE del pool (si ambos están ocupados, se salta este
// ciclo) y le asigna el recorte de 'caja' (coordenadas de píxel del
// video, ya sea de YOLO o del recuadro fijo de respaldo): lo reescala
// para que el texto quede grande y nítido, y lo convierte a blanco y
// negro con más contraste (mejora mucho el OCR en placas amarillas/
// reflectivas) antes de pasarlo al worker. El canvas se convierte a una
// imagen (dataURL) ANTES de mandarla al worker — así el canvas queda
// libre de inmediato para la siguiente captura, sin tener que esperar a
// que termine el reconocimiento de esta. Cualquier error queda
// capturado y visible en pantalla — antes se perdía en silencio y el
// escaneo se quedaba trabado sin volver a intentarlo.
function procesarRecortePlaca(video, caja) {
  const libre = poolOCRPlaca.find(function (p) { return !p.ocupado; });
  if (!libre) return; // los 2 workers están ocupados, se salta este ciclo

  const canvas = document.createElement('canvas');

  try {
    const sx = caja.x1, sy = caja.y1;
    const sw = caja.x2 - caja.x1, sh = caja.y2 - caja.y1;
    if (sw <= 0 || sh <= 0) return;

    // Escala hacia arriba para que el texto recortado quede con buen
    // tamaño para el OCR. Objetivo más grande (900px en vez de 700px)
    // para compensar vehículos lejanos, donde la placa ocupa muy pocos
    // píxeles reales dentro del recorte: entre más pequeña llega, más
    // hace falta ampliarla para que Tesseract distinga los caracteres.
    const escala = Math.max(1, 900 / sw);
    canvas.width = Math.round(sw * escala);
    canvas.height = Math.round(sh * escala);

    const ctx = canvas.getContext('2d');
    ctx.filter = 'grayscale(1) contrast(1.5) brightness(1.08)';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    // Snapshot inmediato como dataURL: libera el canvas ya mismo para
    // la siguiente captura, en vez de dejarlo "reservado" mientras el
    // worker todavía está procesando esta imagen.
    const imagenCapturada = canvas.toDataURL('image/png');

    libre.ocupado = true;
    libre.worker.recognize(imagenCapturada)
      .then(function (resultado) {
        const texto = (resultado.data.text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const confianza = resultado.data.confidence || 0;
        const match = texto.match(REGEX_PLACA);
        if (match) {
          // Si el OCR está muy seguro de la lectura, la aceptamos de
          // una sola vez — clave para no hacer esperar al vehículo en
          // la entrada. Con confianza baja/media sí exigimos ver la
          // MISMA placa en dos lecturas seguidas, para filtrar errores
          // de una sola pasada (letras/números confundidos al vuelo).
          if (confianza >= 75 || ultimaCandidataPlaca === match[0]) {
            actualizarEstadoEscaneo('✅ Placa confirmada: ' + match[0], false);
            document.getElementById('placa-buscar-input').value = match[0];
            ultimaCandidataPlaca = null;
            detenerCamaraPlaca();
            verificarPlacaVigilanciaUI();
          } else {
            ultimaCandidataPlaca = match[0];
            actualizarEstadoEscaneo('🔍 Placa candidata: ' + match[0] + ' (confirmando...)', false);
          }
        } else {
          ultimaCandidataPlaca = null;
          actualizarEstadoEscaneo('🔍 Escaneando...' + (texto ? ' (veo: "' + texto.slice(0, 14) + '")' : ' acerque el vehículo o encuadre mejor la placa'), false);
        }
      })
      .catch(function (err) {
        actualizarEstadoEscaneo('⚠️ Error de lectura: ' + err.message, true);
      })
      .finally(function () {
        libre.ocupado = false;
      });
  } catch (err) {
    actualizarEstadoEscaneo('⚠️ Error: ' + err.message, true);
  }
}

// Botón de respaldo: fuerza una lectura inmediata del cuadro actual,
// útil si el escaneo automático no ha detectado nada o para probar
// manualmente qué está viendo el OCR en este momento.
function forzarLecturaPlaca() {
  if (!streamCamara) { alert('Primero activa la cámara.'); return; }
  if (!workerPlacaListo) { alert('El motor de lectura todavía se está cargando, espera un momento.'); return; }
  analizarFotogramaPlaca();
}

function renderResultadoPlaca(r, containerId) {
  const cont = document.getElementById(containerId);
  if (!cont) return;

  if (!r.encontrado) {
    cont.innerHTML = `
      <div class="semaforo rojo" style="margin-top:14px; padding:20px; border-radius:18px;">
        <div style="font-size:36px; margin-bottom:4px;">⚠️</div>
        <div style="font-size:20px; font-weight:800;">PLACA NO REGISTRADA</div>
        <div style="font-size:14px; margin-top:6px; opacity:0.9;">No figura en el sistema del conjunto.</div>
      </div>`;
    return;
  }

  const veh = r.vehiculo || {};
  if (r.permitirIngreso) {
    cont.innerHTML = `
      <div class="semaforo verde" style="margin-top:14px; padding:22px; border-radius:18px; box-shadow: 0 8px 24px rgba(22,163,74,0.3);">
        <div style="font-size:38px; margin-bottom:4px;">🟢</div>
        <div style="font-size:22px; font-weight:800; letter-spacing:0.5px;">INGRESO PERMITIDO</div>
        <div style="font-size:15px; margin-top:6px; font-weight:700;">APARTAMENTO AL DÍA</div>
      </div>
      <div class="card" style="margin-top:12px; border-left:5px solid var(--verde);">
        <div style="font-size:20px; font-weight:800; color:var(--verde-oscuro); margin-bottom:8px;">🚘 ${veh.Placa}</div>
        <p style="margin:4px 0;"><b>Apartamento:</b> Apto ${r.idApto}</p>
        <p style="margin:4px 0;"><b>Vehículo:</b> ${veh.Tipo} ${veh.Marca || ''} (${veh.Color || 'Sin color'})</p>
        <p style="margin:4px 0;"><b>Propietario:</b> ${veh.Propietario || 'No especificado'}</p>
        <p style="margin:4px 0; color:var(--verde-oscuro); font-weight:700;"><b>Estado Financiero:</b> Al día ($0 pendiente)</p>
      </div>`;
  } else {
    cont.innerHTML = `
      <div class="semaforo rojo" style="margin-top:14px; padding:22px; border-radius:18px; box-shadow: 0 8px 24px rgba(220,38,38,0.4); animation: pulso-sos 1.8s infinite;">
        <div style="font-size:42px; margin-bottom:4px;">🔴</div>
        <div style="font-size:22px; font-weight:900; letter-spacing:0.5px;">NO PUEDE INGRESAR</div>
        <div style="font-size:15px; margin-top:6px; font-weight:800; background:rgba(0,0,0,0.2); padding:8px 12px; border-radius:10px;">${r.motivo}</div>
      </div>
      <div class="card" style="margin-top:12px; border-left:5px solid var(--rojo);">
        <div style="font-size:20px; font-weight:800; color:var(--rojo); margin-bottom:8px;">🚘 ${veh.Placa}</div>
        <p style="margin:4px 0;"><b>Apartamento:</b> Apto ${r.idApto}</p>
        <p style="margin:4px 0;"><b>Vehículo:</b> ${veh.Tipo} ${veh.Marca || ''} (${veh.Color || ''})</p>
        <p style="margin:4px 0;"><b>Propietario:</b> ${veh.Propietario || 'No especificado'}</p>
        ${r.estaEnMora ? `<p style="margin:8px 0 0 0; color:var(--rojo); font-size:17px; font-weight:900;"><b>Saldo en Mora:</b> $${r.saldo.toLocaleString('es-CO')}</p>` : ''}
      </div>`;
  }
}

function verificarPlacaVigilanciaUI() {
  const placa = document.getElementById('placa-buscar-input').value.trim();
  if (!placa) { alert('Ingresa o escanea la placa'); return; }

  mostrarCargando(true);
  llamarAPI('verificarPlacaVehiculo', { idUsuario: SESION.idUsuario, placa: placa })
    .then(function (r) {
      mostrarCargando(false);
      renderResultadoPlaca(r, 'resultado-placa-box');
    })
    .catch(function (err) {
      mostrarCargando(false);
      alert('Error verificando placa: ' + err.message);
    });
}

function verificarPlacaAdminUI() {
  const placa = document.getElementById('admin-placa-input').value.trim();
  if (!placa) { alert('Ingresa la placa'); return; }

  mostrarCargando(true);
  llamarAPI('verificarPlacaVehiculo', { idUsuario: SESION.idUsuario, placa: placa })
    .then(function (r) {
      mostrarCargando(false);
      renderResultadoPlaca(r, 'admin-placa-resultado-box');
    })
    .catch(function (err) {
      mostrarCargando(false);
      alert('Error verificando placa: ' + err.message);
    });
}

function cargarTodosVehiculosAdmin() {
  llamarAPI('getTodosVehiculosAdmin', { idUsuario: SESION.idUsuario })
    .then(function (r) {
      const cont = document.getElementById('lista-vehiculos-admin');
      const vehiculos = r.vehiculos || [];
      cont.innerHTML = vehiculos.length ? '' : '<p>No hay vehículos registrados en el conjunto.</p>';

      vehiculos.forEach(function (v) {
        const estaEnMora = v.EstaEnMora;
        const autorizado = String(v.Autorizado).trim().toLowerCase() === 'si';
        const bloqueado = String(v.Autorizado).trim().toLowerCase() === 'bloqueado';
        // ✅ FIX: antes solo se distinguía "Bloqueado" vs todo lo demás, así
        // que un vehículo recién registrado (Autorizado = 'No', pendiente de
        // que el admin lo apruebe) se mostraba como "🟢 AL DÍA" igual que uno
        // ya autorizado, y solo aparecía el botón de "Bloquear" — nunca uno
        // de "Aprobar". Ahora se distinguen los 3 estados reales.
        const pendiente = !autorizado && !bloqueado;

        const claseBadge = estaEnMora ? 'rechazado' : (autorizado ? 'autorizado' : (bloqueado ? 'rechazado' : 'pendiente'));
        const estadoTexto = estaEnMora
          ? '🔴 BLOQUEADO POR MORA ($' + v.SaldoApto.toLocaleString('es-CO') + ')'
          : bloqueado
            ? '🔴 BLOQUEADO POR ADMIN'
            : pendiente
              ? '🟡 PENDIENTE DE AUTORIZACIÓN'
              : '🟢 AL DÍA';

        let botones = '';
        if (pendiente) {
          botones =
            `<button class="verde" style="width:auto; padding:6px 12px; font-size:12px;" onclick="actualizarEstadoVehiculoAdminUI('${v.ID_Vehiculo}', 'Si')">✅ Aprobar</button>` +
            `<button class="rojo" style="width:auto; padding:6px 12px; font-size:12px;" onclick="actualizarEstadoVehiculoAdminUI('${v.ID_Vehiculo}', 'Bloqueado')">🚫 Rechazar / Bloquear</button>`;
        } else if (bloqueado) {
          botones = `<button class="verde" style="width:auto; padding:6px 12px; font-size:12px;" onclick="actualizarEstadoVehiculoAdminUI('${v.ID_Vehiculo}', 'Si')">✅ Desbloquear</button>`;
        } else {
          botones = `<button class="rojo" style="width:auto; padding:6px 12px; font-size:12px;" onclick="actualizarEstadoVehiculoAdminUI('${v.ID_Vehiculo}', 'Bloqueado')">🚫 Bloquear Manualmente</button>`;
        }

        cont.innerHTML += `
          <div class="item-lista">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <b style="font-size:16px;">🚘 ${v.Placa}</b>
              <span class="badge ${claseBadge}">${estadoTexto}</span>
            </div>
            <div style="font-size:13px; color:var(--texto-suave); margin-top:4px;">
              <b>Apto:</b> ${v.ID_Apto} · <b>Propietario:</b> ${v.Propietario}<br>
              ${v.Tipo} ${v.Marca ? '· ' + v.Marca : ''} ${v.Color ? '· Color: ' + v.Color : ''}
            </div>
            <div style="margin-top:8px; display:flex; gap:8px;">
              ${botones}
            </div>
          </div>`;
      });
    });
}

function actualizarEstadoVehiculoAdminUI(idVehiculo, nuevoEstado) {
  mostrarCargando(true);
  llamarAPI('actualizarEstadoVehiculoAdmin', { idUsuario: SESION.idUsuario, idVehiculo: idVehiculo, nuevoEstado: nuevoEstado })
    .then(function () {
      mostrarCargando(false);
      cargarTodosVehiculosAdmin();
    });
}

/* ---------------- INICIO: restaurar sesión si ya había una activa ---------------- */
restaurarSesion();
