const pool = require('../config/db');

async function obtenerPorSolicitud(solicitudId) {
  const { rows } = await pool.query('SELECT * FROM reporte_atencion WHERE solicitud_id = $1', [solicitudId]);
  return rows[0] || null;
}

module.exports = { obtenerPorSolicitud };
