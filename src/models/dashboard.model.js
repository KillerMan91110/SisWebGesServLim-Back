const pool = require('../config/db');

// dias = 0 significa "todo el historial".
const EN_RANGO = `($1::int = 0 OR s.creado_en >= now() - make_interval(days => $1::int))`;

async function obtenerResumen(dias) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*) AS total_solicitudes,
      COUNT(*) FILTER (WHERE s.aceptada_en IS NOT NULL) AS total_aceptadas,
      COUNT(*) FILTER (WHERE s.estado = 'finalizada') AS total_finalizadas,
      COUNT(*) FILTER (WHERE s.estado = 'cancelada') AS total_canceladas,
      COUNT(*) FILTER (WHERE s.programada_para IS NOT NULL) AS total_programadas,
      COUNT(*) FILTER (WHERE s.modalidad = 'domicilio') AS total_domicilio,
      COUNT(*) FILTER (WHERE s.modalidad = 'consultorio') AS total_consultorio,
      ROUND(
        COUNT(*) FILTER (WHERE s.aceptada_en IS NOT NULL)::numeric
        / NULLIF(COUNT(*), 0) * 100, 1
      ) AS tasa_aceptacion_pct,
      ROUND(AVG(EXTRACT(EPOCH FROM (s.aceptada_en - s.creado_en)))
        FILTER (WHERE s.aceptada_en IS NOT NULL AND s.programada_para IS NULL) / 60.0, 1)
        AS promedio_minutos_hasta_aceptacion,
      ROUND(AVG(EXTRACT(EPOCH FROM (s.finalizado_en - COALESCE(s.programada_para, s.creado_en))))
        FILTER (WHERE s.finalizado_en IS NOT NULL) / 60.0, 1) AS promedio_minutos_atencion_total,
      ROUND(AVG(c.puntaje), 2) AS satisfaccion_promedio,
      COUNT(c.id) AS total_calificaciones
    FROM solicitudes_atencion s
    LEFT JOIN calificaciones c ON c.solicitud_id = s.id
    WHERE ${EN_RANGO}`,
    [dias]
  );
  const { rows: ahora } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes_ahora,
       COUNT(*) FILTER (WHERE estado IN ('aceptada', 'en_camino', 'en_atencion')) AS en_curso_ahora
     FROM solicitudes_atencion`
  );
  let totalPeriodoAnterior = null;
  if (dias > 0) {
    const { rows: prev } = await pool.query(
      `SELECT COUNT(*) AS total FROM solicitudes_atencion
       WHERE creado_en >= now() - make_interval(days => $1::int * 2)
         AND creado_en < now() - make_interval(days => $1::int)`,
      [dias]
    );
    totalPeriodoAnterior = Number(prev[0].total);
  }
  return { ...rows[0], ...ahora[0], total_periodo_anterior: totalPeriodoAnterior };
}

async function obtenerSolicitudesPorDia(dias) {
  const { rows } = await pool.query(
    `SELECT to_char(date_trunc('day', s.creado_en), 'YYYY-MM-DD') AS dia,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE s.estado = 'finalizada') AS finalizadas
     FROM solicitudes_atencion s
     WHERE s.creado_en >= now() - make_interval(days => $1::int)
     GROUP BY 1
     ORDER BY 1`,
    [dias > 0 ? dias : 365]
  );
  return rows;
}

async function obtenerPorTipo(dias) {
  const { rows } = await pool.query(
    `SELECT s.tipo_procedimiento AS tipo, COUNT(*) AS total,
            COUNT(*) FILTER (WHERE s.estado = 'finalizada') AS finalizadas
     FROM solicitudes_atencion s
     WHERE ${EN_RANGO}
     GROUP BY 1
     ORDER BY total DESC`,
    [dias]
  );
  return rows;
}

async function obtenerPorEstado(dias) {
  const { rows } = await pool.query(
    `SELECT s.estado, COUNT(*) AS total FROM solicitudes_atencion s WHERE ${EN_RANGO} GROUP BY 1`,
    [dias]
  );
  return rows;
}

async function obtenerDesempenoMedicos(dias) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, pm.especialidad, pm.disponible,
            COUNT(s.id) FILTER (WHERE s.aceptada_en IS NOT NULL) AS aceptadas,
            COUNT(s.id) FILTER (WHERE s.estado = 'finalizada') AS finalizadas,
            ROUND(AVG(c.puntaje), 2) AS satisfaccion_promedio,
            COUNT(c.id) AS calificaciones,
            ROUND(AVG(EXTRACT(EPOCH FROM (s.finalizado_en - s.aceptada_en)))
              FILTER (WHERE s.finalizado_en IS NOT NULL) / 60.0, 1) AS minutos_promedio_atencion
     FROM perfiles_medicos pm
     JOIN usuarios u ON u.id = pm.usuario_id
     LEFT JOIN solicitudes_atencion s ON s.medico_id = u.id AND ${EN_RANGO}
     LEFT JOIN calificaciones c ON c.solicitud_id = s.id
     WHERE pm.verificado = true
     GROUP BY u.id, u.nombre, pm.especialidad, pm.disponible
     ORDER BY finalizadas DESC, satisfaccion_promedio DESC NULLS LAST`,
    [dias]
  );
  return rows;
}

async function obtenerDistribucionCalificaciones(dias) {
  const { rows } = await pool.query(
    `SELECT g.puntaje, COUNT(c.id) AS total
     FROM generate_series(1, 5) AS g(puntaje)
     LEFT JOIN calificaciones c ON c.puntaje = g.puntaje
       AND EXISTS (SELECT 1 FROM solicitudes_atencion s WHERE s.id = c.solicitud_id AND ${EN_RANGO})
     GROUP BY g.puntaje
     ORDER BY g.puntaje DESC`,
    [dias]
  );
  return rows;
}

async function obtenerProximasCitas() {
  const { rows } = await pool.query(
    `SELECT s.id, s.tipo_procedimiento, s.modalidad, s.programada_para, s.estado,
            p.nombre AS paciente_nombre, m.nombre AS medico_nombre
     FROM solicitudes_atencion s
     JOIN usuarios p ON p.id = s.paciente_id
     LEFT JOIN usuarios m ON m.id = s.medico_id
     WHERE s.programada_para >= now() - interval '1 hour'
       AND s.estado IN ('pendiente', 'aceptada', 'en_camino', 'en_atencion')
     ORDER BY s.programada_para ASC
     LIMIT 8`
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
    condiciones.push(`s.creado_en >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    condiciones.push(`s.creado_en <= $${params.length}`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT s.id, s.paciente_id, s.medico_id, m.nombre AS medico_nombre, s.tipo_procedimiento,
            s.modalidad, s.programada_para, s.estado, s.creado_en, s.aceptada_en,
            s.finalizado_en, s.cancelado_en, c.puntaje
     FROM solicitudes_atencion s
     LEFT JOIN usuarios m ON m.id = s.medico_id
     LEFT JOIN calificaciones c ON c.solicitud_id = s.id
     ${where}
     ORDER BY s.creado_en ASC`,
    params
  );
  return rows;
}

async function listarSolicitudesAdmin({ estado, modalidad, tipo, medicoId, desde, hasta, q, pagina, porPagina }) {
  const condiciones = [];
  const params = [];
  const agregar = (sql, valor) => {
    params.push(valor);
    condiciones.push(sql.replace('?', `$${params.length}`));
  };
  if (estado) agregar('s.estado = ?', estado);
  if (modalidad) agregar('s.modalidad = ?', modalidad);
  if (tipo) agregar('s.tipo_procedimiento = ?', tipo);
  if (medicoId) agregar('s.medico_id = ?', medicoId);
  if (desde) agregar('s.creado_en >= ?', desde);
  if (hasta) agregar("s.creado_en < (?::date + interval '1 day')", hasta);
  if (q) {
    // Busca por nombre de paciente o médico; si es un número, también por N.° de solicitud
    params.push(`%${q}%`);
    const n = params.length;
    let cond = `(p.nombre ILIKE $${n} OR m.nombre ILIKE $${n}`;
    if (/^\d+$/.test(q)) {
      params.push(Number(q));
      cond += ` OR s.id = $${params.length}`;
    }
    condiciones.push(`${cond})`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const paramsBase = params;

  const desdeTabla = `FROM solicitudes_atencion s
     JOIN usuarios p ON p.id = s.paciente_id
     LEFT JOIN usuarios m ON m.id = s.medico_id
     LEFT JOIN calificaciones c ON c.solicitud_id = s.id
     ${where}`;
  const { rows: total } = await pool.query(`SELECT COUNT(*)::int AS total ${desdeTabla}`, paramsBase);
  const offset = (pagina - 1) * porPagina;
  const { rows } = await pool.query(
    `SELECT s.id, s.tipo_procedimiento, s.modalidad, s.estado, s.programada_para, s.creado_en,
            s.aceptada_en, s.finalizado_en, p.nombre AS paciente_nombre, m.nombre AS medico_nombre,
            c.puntaje
     ${desdeTabla}
     ORDER BY s.creado_en DESC
     LIMIT ${Number(porPagina)} OFFSET ${Number(offset)}`,
    paramsBase
  );
  return { solicitudes: rows, total: total[0].total };
}

module.exports = {
  listarSolicitudesAdmin,
  obtenerResumen,
  obtenerSolicitudesPorDia,
  obtenerPorTipo,
  obtenerPorEstado,
  obtenerDesempenoMedicos,
  obtenerDistribucionCalificaciones,
  obtenerProximasCitas,
  obtenerResumenUsuarios,
  listarParaExportar,
};
