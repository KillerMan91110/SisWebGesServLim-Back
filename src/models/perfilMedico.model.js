const pool = require('../config/db');
const { withTransaction } = require('../utils/withTransaction');

async function listarPendientes() {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.telefono, u.creado_en,
            pm.cmp_colegiatura, pm.especialidad
     FROM perfiles_medicos pm
     JOIN usuarios u ON u.id = pm.usuario_id
     WHERE pm.verificado = false
     ORDER BY u.creado_en ASC`
  );
  return rows;
}

async function listarVerificadosPublico() {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, pm.especialidad
     FROM perfiles_medicos pm
     JOIN usuarios u ON u.id = pm.usuario_id
     WHERE pm.verificado = true AND u.activo = true
     ORDER BY u.nombre ASC`
  );
  return rows;
}

async function obtenerPorUsuarioId(usuarioId) {
  const { rows } = await pool.query('SELECT * FROM perfiles_medicos WHERE usuario_id = $1', [usuarioId]);
  return rows[0] || null;
}

async function verificar(usuarioId) {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE perfiles_medicos SET verificado = true, verificado_en = now() WHERE usuario_id = $1`,
      [usuarioId]
    );
    if (rowCount === 0) {
      throw Object.assign(new Error('Perfil médico no encontrado'), { status: 404 });
    }
    await client.query(
      `UPDATE usuarios SET activo = true, actualizado_en = now() WHERE id = $1`,
      [usuarioId]
    );
  });
}

async function rechazar(usuarioId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT verificado FROM perfiles_medicos WHERE usuario_id = $1 FOR UPDATE',
      [usuarioId]
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('Perfil médico no encontrado'), { status: 404 });
    }
    if (rows[0].verificado) {
      throw Object.assign(
        new Error('No se puede rechazar a un médico ya verificado; usá suspender su cuenta en su lugar'),
        { status: 409 }
      );
    }
    // El médico nunca fue verificado, así que nunca pudo aceptar solicitudes:
    // se elimina la cuenta para liberar el email y que pueda re-registrarse si fue un error.
    await client.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  });
}

module.exports = { listarPendientes, listarVerificadosPublico, obtenerPorUsuarioId, verificar, rechazar };
