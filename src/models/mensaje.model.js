const pool = require('../config/db');

async function crear({ solicitudId, remitenteId, contenido }) {
  const { rows } = await pool.query(
    `INSERT INTO mensajes (solicitud_id, remitente_id, contenido)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [solicitudId, remitenteId, contenido]
  );
  return rows[0];
}

async function listarPorSolicitud(solicitudId) {
  const { rows } = await pool.query(
    'SELECT * FROM mensajes WHERE solicitud_id = $1 ORDER BY enviado_en ASC',
    [solicitudId]
  );
  return rows;
}

module.exports = { crear, listarPorSolicitud };
