const pool = require('../config/db');

// Cada mensaje incluye el nombre y rol de quien lo envió (para mostrarlo en el chat).
async function crear({ solicitudId, remitenteId, contenido }) {
  const { rows } = await pool.query(
    `WITH nuevo AS (
       INSERT INTO mensajes (solicitud_id, remitente_id, contenido)
       VALUES ($1, $2, $3)
       RETURNING *
     )
     SELECT nuevo.*, u.nombre AS remitente_nombre, u.rol AS remitente_rol
     FROM nuevo JOIN usuarios u ON u.id = nuevo.remitente_id`,
    [solicitudId, remitenteId, contenido]
  );
  return rows[0];
}

async function listarPorSolicitud(solicitudId) {
  const { rows } = await pool.query(
    `SELECT m.*, u.nombre AS remitente_nombre, u.rol AS remitente_rol
     FROM mensajes m
     JOIN usuarios u ON u.id = m.remitente_id
     WHERE m.solicitud_id = $1
     ORDER BY m.enviado_en ASC`,
    [solicitudId]
  );
  return rows;
}

module.exports = { crear, listarPorSolicitud };
