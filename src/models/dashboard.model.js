const pool = require('../config/db');

async function obtenerResumen() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total_solicitudes,
      COUNT(*) FILTER (WHERE aceptada_en IS NOT NULL) AS total_aceptadas,
      COUNT(*) FILTER (WHERE estado = 'finalizada') AS total_finalizadas,
      COUNT(*) FILTER (WHERE estado = 'cancelada') AS total_canceladas,
      ROUND(
        COUNT(*) FILTER (WHERE aceptada_en IS NOT NULL)::numeric
        / NULLIF(COUNT(*), 0) * 100, 1
      ) AS tasa_aceptacion_pct,
      ROUND(AVG(EXTRACT(EPOCH FROM (aceptada_en - creado_en)))
        FILTER (WHERE aceptada_en IS NOT NULL) / 60.0, 1) AS promedio_minutos_hasta_aceptacion,
      ROUND(AVG(EXTRACT(EPOCH FROM (finalizado_en - creado_en)))
        FILTER (WHERE finalizado_en IS NOT NULL) / 60.0, 1) AS promedio_minutos_atencion_total
    FROM solicitudes_atencion
  `);
  return rows[0];
}

async function obtenerSolicitudesPorDia(dias) {
  const { rows } = await pool.query(
    `SELECT date_trunc('day', creado_en)::date AS dia, COUNT(*) AS total
     FROM solicitudes_atencion
     WHERE creado_en >= now() - ($1 || ' days')::interval
     GROUP BY dia
     ORDER BY dia`,
    [dias]
  );
  return rows;
}

async function obtenerResumenUsuarios() {
  const { rows } = await pool.query('SELECT rol, COUNT(*) AS total FROM usuarios GROUP BY rol');
  const { rows: pendientesRows } = await pool.query(
    'SELECT COUNT(*) AS total FROM perfiles_medicos WHERE verificado = false'
  );
  const resumen = { paciente: 0, medico: 0, admin: 0 };
  rows.forEach((r) => {
    resumen[r.rol] = Number(r.total);
  });
  return { ...resumen, medicosPendientesVerificacion: Number(pendientesRows[0].total) };
}

async function listarParaExportar({ desde, hasta }) {
  const condiciones = [];
  const params = [];
  if (desde) {
    params.push(desde);
    condiciones.push(`creado_en >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    condiciones.push(`creado_en <= $${params.length}`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT id, paciente_id, medico_id, tipo_procedimiento, estado,
            creado_en, aceptada_en, finalizado_en, cancelado_en
     FROM solicitudes_atencion
     ${where}
     ORDER BY creado_en ASC`,
    params
  );
  return rows;
}

module.exports = {
  obtenerResumen,
  obtenerSolicitudesPorDia,
  obtenerResumenUsuarios,
  listarParaExportar,
};
