const pool = require('../config/db');

async function registrar({ usuarioId, accion, pacienteId = null, solicitudId = null, detalle = null }) {
  await pool.query(
    `INSERT INTO auditoria_accesos (usuario_id, accion, paciente_id, solicitud_id, detalle)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuarioId, accion, pacienteId, solicitudId, detalle]
  );
}

async function listar(limite = 100) {
  const { rows } = await pool.query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.rol AS usuario_rol, p.nombre AS paciente_nombre
     FROM auditoria_accesos a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     LEFT JOIN usuarios p ON p.id = a.paciente_id
     ORDER BY a.creado_en DESC
     LIMIT $1`,
    [limite]
  );
  return rows;
}

module.exports = { registrar, listar };
