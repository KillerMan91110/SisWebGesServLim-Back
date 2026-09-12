const pool = require('../config/db');

async function crear({ solicitudId, calificadoPor, medicoId, puntaje, comentario }) {
  const { rows } = await pool.query(
    `INSERT INTO calificaciones (solicitud_id, calificado_por, medico_id, puntaje, comentario)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [solicitudId, calificadoPor, medicoId, puntaje, comentario || null]
  );
  return rows[0];
}

module.exports = { crear };
