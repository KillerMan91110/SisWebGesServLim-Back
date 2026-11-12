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

// Médicos verificados, activos y en línea cerca de un punto. La ubicación se redondea
// (~100 m) para no exponer la posición exacta del profesional.
async function listarCercanos({ lat, lng, radioMetros }) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, pm.especialidad, pm.direccion_consultorio,
            ROUND(pm.lat_actual::numeric, 3)::float AS lat,
            ROUND(pm.lng_actual::numeric, 3)::float AS lng,
            ROUND(earth_distance(ll_to_earth(pm.lat_actual, pm.lng_actual), ll_to_earth($1, $2))) AS distancia_metros,
            (SELECT ROUND(AVG(c.puntaje), 1) FROM calificaciones c WHERE c.medico_id = u.id) AS satisfaccion,
            (SELECT COUNT(*) FROM solicitudes_atencion s WHERE s.medico_id = u.id AND s.estado = 'finalizada') AS atenciones
     FROM perfiles_medicos pm
     JOIN usuarios u ON u.id = pm.usuario_id
     WHERE pm.verificado = true AND u.activo = true AND pm.disponible = true
       AND pm.lat_actual IS NOT NULL AND pm.lng_actual IS NOT NULL
       AND earth_distance(ll_to_earth(pm.lat_actual, pm.lng_actual), ll_to_earth($1, $2)) <= $3
     ORDER BY distancia_metros ASC
     LIMIT 30`,
    [lat, lng, radioMetros]
  );
  return rows;
}

module.exports = {
  listarCercanos, listarPendientes, listarVerificadosPublico, obtenerPorUsuarioId, verificar, rechazar };
