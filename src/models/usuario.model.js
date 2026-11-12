const pool = require('../config/db');
const { withTransaction } = require('../utils/withTransaction');

async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  return rows[0] || null;
}

async function crearPaciente({ nombre, email, passwordHash, telefono, versionPrivacidad }) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, consentimiento_datos_en, consentimiento_version)
     VALUES ($1, $2, $3, 'paciente', $4, now(), $5)
     RETURNING id, nombre, email, rol, telefono, activo, creado_en, consentimiento_datos_en, consentimiento_version`,
    [nombre, email, passwordHash, telefono || null, versionPrivacidad]
  );
  return rows[0];
}

async function crearMedico({ nombre, email, passwordHash, telefono, cmpColegiatura, especialidad, versionPrivacidad }) {
  return withTransaction(async (client) => {
    const { rows: usuarioRows } = await client.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, activo, consentimiento_datos_en, consentimiento_version)
       VALUES ($1, $2, $3, 'medico', $4, false, now(), $5)
       RETURNING id, nombre, email, rol, telefono, activo, creado_en, consentimiento_datos_en, consentimiento_version`,
      [nombre, email, passwordHash, telefono || null, versionPrivacidad]
    );
    const usuario = usuarioRows[0];
    await client.query(
      `INSERT INTO perfiles_medicos (usuario_id, cmp_colegiatura, especialidad)
       VALUES ($1, $2, $3)`,
      [usuario.id, cmpColegiatura, especialidad]
    );
    return usuario;
  });
}

async function listarTodos({ rol } = {}) {
  const params = [];
  let query = 'SELECT id, nombre, email, rol, telefono, activo, creado_en, consentimiento_datos_en FROM usuarios';
  if (rol) {
    params.push(rol);
    query += ` WHERE rol = $${params.length}`;
  }
  query += ' ORDER BY creado_en DESC';
  const { rows } = await pool.query(query, params);
  return rows;
}

async function actualizarEstado(id, activo) {
  const { rows } = await pool.query(
    `UPDATE usuarios SET activo = $1, actualizado_en = now() WHERE id = $2
     RETURNING id, nombre, email, rol, activo`,
    [activo, id]
  );
  return rows[0] || null;
}

async function actualizarPerfil(id, { nombre, telefono }) {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET nombre = COALESCE($1, nombre), telefono = COALESCE($2, telefono), actualizado_en = now()
     WHERE id = $3
     RETURNING *`,
    [nombre ?? null, telefono ?? null, id]
  );
  return rows[0] || null;
}

async function actualizarPassword(id, passwordHash) {
  await pool.query('UPDATE usuarios SET password_hash = $1, actualizado_en = now() WHERE id = $2', [
    passwordHash,
    id,
  ]);
}

async function registrarConsentimiento(id, version) {
  const { rows } = await pool.query(
    `UPDATE usuarios SET consentimiento_datos_en = now(), consentimiento_version = $2, actualizado_en = now()
     WHERE id = $1 RETURNING *`,
    [id, version]
  );
  return rows[0] || null;
}

module.exports = {
  registrarConsentimiento,
  findByEmail,
  findById,
  crearPaciente,
  crearMedico,
  listarTodos,
  actualizarEstado,
  actualizarPerfil,
  actualizarPassword,
};
