const pool = require('../config/db');

const CAMPOS = [
  'dni',
  'fecha_nacimiento',
  'sexo',
  'grupo_sanguineo',
  'alergias',
  'antecedentes',
  'medicacion_actual',
  'contacto_emergencia_nombre',
  'contacto_emergencia_telefono',
];

async function obtener(usuarioId) {
  const { rows } = await pool.query('SELECT * FROM fichas_clinicas WHERE usuario_id = $1', [usuarioId]);
  return rows[0] || null;
}

async function guardar(usuarioId, datos) {
  const valores = CAMPOS.map((c) => (datos[c] === '' || datos[c] === undefined ? null : datos[c]));
  const { rows } = await pool.query(
    `INSERT INTO fichas_clinicas (usuario_id, ${CAMPOS.join(', ')}, actualizado_en)
     VALUES ($1, ${CAMPOS.map((_, i) => `$${i + 2}`).join(', ')}, now())
     ON CONFLICT (usuario_id) DO UPDATE SET
       ${CAMPOS.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
       actualizado_en = now()
     RETURNING *`,
    [usuarioId, ...valores]
  );
  return rows[0];
}

// Atenciones finalizadas del paciente con su reporte clínico, de la más reciente a la más antigua.
async function historialAtenciones(pacienteId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.tipo_procedimiento, s.modalidad, s.creado_en, s.finalizado_en,
            m.nombre AS medico_nombre, pm.especialidad AS medico_especialidad,
            r.diagnostico, r.procedimiento_realizado, r.observaciones, r.recomendaciones
     FROM solicitudes_atencion s
     LEFT JOIN usuarios m ON m.id = s.medico_id
     LEFT JOIN perfiles_medicos pm ON pm.usuario_id = s.medico_id
     LEFT JOIN reporte_atencion r ON r.solicitud_id = s.id
     WHERE s.paciente_id = $1 AND s.estado = 'finalizada'
     ORDER BY s.finalizado_en DESC`,
    [pacienteId]
  );
  return rows;
}

module.exports = { CAMPOS, obtener, guardar, historialAtenciones };
