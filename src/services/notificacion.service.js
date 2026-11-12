// Notificaciones: se guardan en la base (para verlas luego en la campana)
// y se envían en tiempo real por socket si el usuario está conectado.
const pool = require('../config/db');

let io = null;

function setIo(instancia) {
  io = instancia;
}

function getIo() {
  return io;
}

async function notificar({ usuarioId, tipo, titulo, mensaje, solicitudId = null }) {
  if (!usuarioId) return null;
  const { rows } = await pool.query(
    `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, solicitud_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [usuarioId, tipo, titulo, mensaje, solicitudId]
  );
  const notificacion = rows[0];
  if (io) io.to(`user:${usuarioId}`).emit('notificacion:nueva', notificacion);
  return notificacion;
}

// Una notificación nunca debe romper la operación principal (aceptar, finalizar...).
function notificarSeguro(datos) {
  return notificar(datos).catch((err) => console.error('[notificacion] falló:', err.message));
}

async function listar(usuarioId, limite = 30) {
  const { rows } = await pool.query(
    `SELECT * FROM notificaciones WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT $2`,
    [usuarioId, limite]
  );
  const { rows: cuenta } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM notificaciones WHERE usuario_id = $1 AND leida_en IS NULL',
    [usuarioId]
  );
  return { notificaciones: rows, noLeidas: cuenta[0].total };
}

async function marcarLeida(usuarioId, id) {
  const { rowCount } = await pool.query(
    `UPDATE notificaciones SET leida_en = now() WHERE id = $1 AND usuario_id = $2 AND leida_en IS NULL`,
    [id, usuarioId]
  );
  return rowCount > 0;
}

async function marcarTodasLeidas(usuarioId) {
  await pool.query(
    'UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL',
    [usuarioId]
  );
}

// ---- Textos ----

const MODALIDAD = { domicilio: 'en tu domicilio', consultorio: 'en el consultorio' };

function fechaLegible(fecha) {
  return new Date(fecha).toLocaleString('es-PE', {
    timeZone: process.env.TZ_APP || 'America/Lima',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function lugar(solicitud) {
  if (solicitud.modalidad === 'consultorio') {
    return solicitud.medico_direccion_consultorio
      ? `en el consultorio: ${solicitud.medico_direccion_consultorio}`
      : 'en el consultorio del médico';
  }
  return MODALIDAD.domicilio;
}

module.exports = {
  setIo,
  getIo,
  notificar,
  notificarSeguro,
  listar,
  marcarLeida,
  marcarTodasLeidas,
  fechaLegible,
  lugar,
};
