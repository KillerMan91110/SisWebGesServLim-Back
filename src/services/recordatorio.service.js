// Tareas periódicas (cada minuto): recordatorios de citas, aviso cuando nadie
// acepta una atención inmediata y cancelación de citas vencidas sin médico.
const pool = require('../config/db');
const { notificarSeguro, fechaLegible, lugar, procedimiento, getIo } = require('./notificacion.service');

const MINUTOS_SIN_MEDICO = Number(process.env.MINUTOS_AVISO_SIN_MEDICO) || 10;

const SELECT_CITA = `
  SELECT s.*, p.nombre AS paciente_nombre, m.nombre AS medico_nombre,
         pm.direccion_consultorio AS medico_direccion_consultorio
  FROM solicitudes_atencion s
  JOIN usuarios p ON p.id = s.paciente_id
  LEFT JOIN usuarios m ON m.id = s.medico_id
  LEFT JOIN perfiles_medicos pm ON pm.usuario_id = s.medico_id`;

// Marca la solicitud y solo devuelve las que ESTE proceso marcó (evita avisos duplicados).
async function reclamar(columna, condicion) {
  const { rows } = await pool.query(
    `UPDATE solicitudes_atencion s SET ${columna} = now()
     WHERE ${columna} IS NULL AND ${condicion}
     RETURNING s.id`
  );
  if (rows.length === 0) return [];
  const { rows: completas } = await pool.query(`${SELECT_CITA} WHERE s.id = ANY($1)`, [
    rows.map((r) => r.id),
  ]);
  return completas;
}

async function recordatorios24h() {
  const citas = await reclamar(
    'recordatorio_24h_en',
    `s.estado = 'aceptada' AND s.programada_para IS NOT NULL
     AND s.programada_para > now() + interval '1 hour'
     AND s.programada_para <= now() + interval '24 hours'`
  );
  for (const c of citas) {
    const cuando = fechaLegible(c.programada_para);
    await notificarSeguro({
      usuarioId: c.paciente_id,
      tipo: 'recordatorio',
      titulo: '⏰ Recordatorio de tu cita',
      mensaje: `Te atenderá ${c.medico_nombre} el ${cuando} (${procedimiento(c)}), ${lugar(c)}.`,
      solicitudId: c.id,
    });
    await notificarSeguro({
      usuarioId: c.medico_id,
      tipo: 'recordatorio',
      titulo: '⏰ Paciente agendado',
      mensaje: `Atenderás a ${c.paciente_nombre} el ${cuando} (${procedimiento(c)}), ${
        c.modalidad === 'consultorio' ? 'en tu consultorio' : 'en su domicilio'
      }.`,
      solicitudId: c.id,
    });
  }
}

async function recordatorios1h() {
  const citas = await reclamar(
    'recordatorio_1h_en',
    `s.estado = 'aceptada' AND s.programada_para IS NOT NULL
     AND s.programada_para > now()
     AND s.programada_para <= now() + interval '1 hour'`
  );
  for (const c of citas) {
    const hora = new Date(c.programada_para).toLocaleTimeString('es-PE', {
      timeZone: process.env.TZ_APP || 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
    });
    await notificarSeguro({
      usuarioId: c.paciente_id,
      tipo: 'cita_pronto',
      titulo: '🔔 Tu cita comienza pronto',
      mensaje: `${c.medico_nombre} te atenderá a las ${hora} (${procedimiento(c)}), ${lugar(c)}.`,
      solicitudId: c.id,
    });
    await notificarSeguro({
      usuarioId: c.medico_id,
      tipo: 'cita_pronto',
      titulo: '🔔 Tu próximo paciente',
      mensaje: `${c.paciente_nombre} tiene cita contigo a las ${hora} (${procedimiento(c)}), ${
        c.modalidad === 'consultorio' ? 'en tu consultorio' : 'en su domicilio'
      }.`,
      solicitudId: c.id,
    });
  }
}

async function avisoSinMedico() {
  const pendientes = await reclamar(
    'aviso_sin_medico_en',
    `s.estado = 'pendiente' AND s.programada_para IS NULL
     AND s.creado_en <= now() - make_interval(mins => ${MINUTOS_SIN_MEDICO})`
  );
  for (const s of pendientes) {
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'sin_medico',
      titulo: '⏳ Aún buscamos un médico',
      mensaje: `Tu solicitud de ${procedimiento(s)} sigue pendiente. Si prefieres, cancélala y programa una cita para otro momento.`,
      solicitudId: s.id,
    });
  }
}

async function cancelarCitasVencidas() {
  const { rows } = await pool.query(
    `WITH vencidas AS (
       UPDATE solicitudes_atencion
       SET estado = 'cancelada', cancelado_en = now()
       WHERE estado = 'pendiente' AND programada_para IS NOT NULL AND programada_para <= now()
       RETURNING id, paciente_id, tipo_procedimiento, programada_para
     ), hist AS (
       INSERT INTO historial_estados_solicitud (solicitud_id, estado_anterior, estado_nuevo, cambiado_por)
       SELECT id, 'pendiente', 'cancelada', NULL FROM vencidas
     )
     SELECT * FROM vencidas`
  );
  const io = getIo();
  for (const s of rows) {
    if (io) io.to('medicos').emit('solicitud:tomada', { id: s.id });
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'cita_vencida',
      titulo: '❌ Cita cancelada',
      mensaje: `Ningún médico aceptó tu cita de ${procedimiento(s)} del ${fechaLegible(
        s.programada_para
      )}, por lo que se canceló. Puedes programar una nueva.`,
      solicitudId: s.id,
    });
  }
}

async function ejecutarCiclo() {
  for (const tarea of [recordatorios1h, recordatorios24h, avisoSinMedico, cancelarCitasVencidas]) {
    try {
      await tarea();
    } catch (err) {
      console.error(`[recordatorios] ${tarea.name} falló:`, err.message);
    }
  }
}

function programarRecordatorios() {
  ejecutarCiclo();
  setInterval(ejecutarCiclo, 60 * 1000).unref();
}

module.exports = { programarRecordatorios, ejecutarCiclo };
