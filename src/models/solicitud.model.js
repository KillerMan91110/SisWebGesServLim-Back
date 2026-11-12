const pool = require('../config/db');
const { withTransaction } = require('../utils/withTransaction');

async function crear({ pacienteId, tipoProcedimiento, descripcion, lat, lng, modalidad, programadaPara }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO solicitudes_atencion
         (paciente_id, tipo_procedimiento, descripcion, lat, lng, modalidad, programada_para)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        pacienteId,
        tipoProcedimiento,
        descripcion || null,
        lat,
        lng,
        modalidad || 'domicilio',
        programadaPara || null,
      ]
    );
    const solicitud = rows[0];
    await client.query(
      `INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES ($1, NULL, 'pendiente', $2)`,
      [solicitud.id, pacienteId]
    );
    return solicitud;
  });
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT s.*,
            c.puntaje, c.comentario AS calificacion_comentario, c.creado_en AS calificado_en,
            p.nombre AS paciente_nombre,
            m.nombre AS medico_nombre,
            pm.especialidad AS medico_especialidad,
            pm.direccion_consultorio AS medico_direccion_consultorio
     FROM solicitudes_atencion s
     LEFT JOIN calificaciones c ON c.solicitud_id = s.id
     LEFT JOIN usuarios p ON p.id = s.paciente_id
     LEFT JOIN usuarios m ON m.id = s.medico_id
     LEFT JOIN perfiles_medicos pm ON pm.usuario_id = s.medico_id
     WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listarPorPaciente(pacienteId) {
  const { rows } = await pool.query(
    `SELECT s.*, m.nombre AS medico_nombre,
            pm.direccion_consultorio AS medico_direccion_consultorio
     FROM solicitudes_atencion s
     LEFT JOIN usuarios m ON m.id = s.medico_id
     LEFT JOIN perfiles_medicos pm ON pm.usuario_id = s.medico_id
     WHERE s.paciente_id = $1
     ORDER BY s.creado_en DESC`,
    [pacienteId]
  );
  return rows;
}

// Citas programadas del médico que aún no terminan (agenda), por fecha.
async function listarAgendaMedico(medicoId) {
  const { rows } = await pool.query(
    `SELECT s.*, p.nombre AS paciente_nombre, p.telefono AS paciente_telefono
     FROM solicitudes_atencion s
     JOIN usuarios p ON p.id = s.paciente_id
     WHERE s.medico_id = $1
       AND s.programada_para IS NOT NULL
       AND s.estado IN ('aceptada', 'en_camino', 'en_atencion')
     ORDER BY s.programada_para ASC`,
    [medicoId]
  );
  return rows;
}

async function listarPorMedico(medicoId) {
  const { rows } = await pool.query(
    `SELECT s.*, c.puntaje, c.comentario AS calificacion_comentario, c.creado_en AS calificado_en
     FROM solicitudes_atencion s
     LEFT JOIN calificaciones c ON c.solicitud_id = s.id
     WHERE s.medico_id = $1
     ORDER BY s.creado_en DESC`,
    [medicoId]
  );
  return rows;
}

async function listarCercanas({ lat, lng, radioMetros }) {
  const { rows } = await pool.query(
    `SELECT s.*, ROUND(earth_distance(ll_to_earth(s.lat, s.lng), ll_to_earth($1, $2))) AS distancia_metros
     FROM solicitudes_atencion s
     WHERE s.estado = 'pendiente'
       AND earth_distance(ll_to_earth(s.lat, s.lng), ll_to_earth($1, $2)) <= $3
     ORDER BY distancia_metros ASC
     LIMIT 50`,
    [lat, lng, radioMetros]
  );
  return rows;
}

async function aceptar({ solicitudId, medicoId }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE solicitudes_atencion
       SET medico_id = $1, estado = 'aceptada', aceptada_en = now()
       WHERE id = $2 AND estado = 'pendiente'
       RETURNING *`,
      [medicoId, solicitudId]
    );
    if (rows.length === 0) return null;
    const solicitud = rows[0];
    await client.query(
      `INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES ($1, 'pendiente', 'aceptada', $2)`,
      [solicitud.id, medicoId]
    );
    return solicitud;
  });
}

async function cancelar({ solicitudId, pacienteId }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `WITH previo AS (
         SELECT estado FROM solicitudes_atencion
         WHERE id = $1 AND paciente_id = $2 AND estado IN ('pendiente', 'aceptada')
         FOR UPDATE
       )
       UPDATE solicitudes_atencion s
       SET estado = 'cancelada', cancelado_en = now()
       FROM previo
       WHERE s.id = $1
       RETURNING s.*, previo.estado AS estado_previo`,
      [solicitudId, pacienteId]
    );
    if (rows.length === 0) return null;
    const { estado_previo, ...solicitud } = rows[0];
    await client.query(
      `INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES ($1, $2, 'cancelada', $3)`,
      [solicitud.id, estado_previo, pacienteId]
    );
    return solicitud;
  });
}

async function actualizarUbicacionMedico({ medicoId, solicitudId, lat, lng, radioLlegadaMetros }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM solicitudes_atencion WHERE id = $1 AND medico_id = $2 FOR UPDATE`,
      [solicitudId, medicoId]
    );
    const solicitudActual = rows[0];
    // En consultorio el médico no se desplaza: la llegada se registra con un botón.
    if (
      !solicitudActual ||
      solicitudActual.modalidad === 'consultorio' ||
      !['aceptada', 'en_camino'].includes(solicitudActual.estado)
    ) {
      return null;
    }

    await client.query(
      `UPDATE perfiles_medicos SET lat_actual = $1, lng_actual = $2, ubicacion_actualizada_en = now() WHERE usuario_id = $3`,
      [lat, lng, medicoId]
    );

    const { rows: distRows } = await client.query(
      `SELECT earth_distance(ll_to_earth($1, $2), ll_to_earth($3, $4)) AS distancia`,
      [lat, lng, solicitudActual.lat, solicitudActual.lng]
    );
    const distancia = Number(distRows[0].distancia);

    let nuevoEstado = solicitudActual.estado === 'aceptada' ? 'en_camino' : solicitudActual.estado;
    if (distancia <= radioLlegadaMetros) {
      nuevoEstado = 'en_atencion';
    }

    let solicitud = solicitudActual;
    let cambioEstado = false;
    if (nuevoEstado !== solicitudActual.estado) {
      const { rows: updRows } = await client.query(
        `UPDATE solicitudes_atencion SET estado = $1 WHERE id = $2 RETURNING *`,
        [nuevoEstado, solicitudId]
      );
      solicitud = updRows[0];
      cambioEstado = true;
      await client.query(
        `INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, cambiado_por)
         VALUES ($1, $2, $3, $4)`,
        [solicitudId, solicitudActual.estado, nuevoEstado, medicoId]
      );
    }

    return { solicitud, distancia, cambioEstado };
  });
}

async function finalizar({ solicitudId, medicoId, reporte }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `WITH previo AS (
         SELECT estado FROM solicitudes_atencion
         WHERE id = $1 AND medico_id = $2 AND estado IN ('aceptada', 'en_camino', 'en_atencion')
         FOR UPDATE
       )
       UPDATE solicitudes_atencion s
       SET estado = 'finalizada', finalizado_en = now()
       FROM previo
       WHERE s.id = $1
       RETURNING s.*, previo.estado AS estado_previo`,
      [solicitudId, medicoId]
    );
    if (rows.length === 0) return null;
    const { estado_previo, ...solicitud } = rows[0];
    await client.query(
      `INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES ($1, $2, 'finalizada', $3)`,
      [solicitud.id, estado_previo, medicoId]
    );
    await client.query(
      `INSERT INTO reporte_atencion (solicitud_id, diagnostico, procedimiento_realizado, observaciones, recomendaciones)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        solicitud.id,
        reporte?.diagnostico || null,
        reporte?.procedimientoRealizado || null,
        reporte?.observaciones || null,
        reporte?.recomendaciones || null,
      ]
    );
    return solicitud;
  });
}

async function registrarLlegadaConsultorio({ solicitudId, medicoId }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE solicitudes_atencion SET estado = 'en_atencion'
       WHERE id = $1 AND medico_id = $2 AND modalidad = 'consultorio' AND estado = 'aceptada'
       RETURNING *`,
      [solicitudId, medicoId]
    );
    if (rows.length === 0) return null;
    await client.query(
      `INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES ($1, 'aceptada', 'en_atencion', $2)`,
      [solicitudId, medicoId]
    );
    return rows[0];
  });
}

module.exports = {
  registrarLlegadaConsultorio,
  crear,
  findById,
  listarPorPaciente,
  listarPorMedico,
  listarAgendaMedico,
  listarCercanas,
  aceptar,
  cancelar,
  actualizarUbicacionMedico,
  finalizar,
};
