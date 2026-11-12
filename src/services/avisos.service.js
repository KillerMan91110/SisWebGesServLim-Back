// Avisos que el sistema envía en cada momento del ciclo de una solicitud.
const solicitudModel = require('../models/solicitud.model');
const { notificarSeguro, fechaLegible, lugar } = require('./notificacion.service');

async function completa(solicitudOId) {
  const id = typeof solicitudOId === 'object' ? solicitudOId.id : solicitudOId;
  return solicitudModel.findById(id);
}

async function alAceptar(solicitudOId) {
  const s = await completa(solicitudOId);
  if (!s) return;
  const medico = s.medico_nombre || 'Un médico';
  if (s.programada_para) {
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'cita_confirmada',
      titulo: '📅 Cita confirmada',
      mensaje: `Tu cita de ${s.tipo_procedimiento} del ${fechaLegible(s.programada_para)} fue confirmada con ${medico}, ${lugar(s)}.`,
      solicitudId: s.id,
    });
  } else if (s.modalidad === 'consultorio') {
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'aceptada',
      titulo: '🏥 Te esperan en el consultorio',
      mensaje: `${medico} aceptó tu solicitud de ${s.tipo_procedimiento}. Acércate ${lugar(s)}.`,
      solicitudId: s.id,
    });
  } else {
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'aceptada',
      titulo: '🩺 Tu solicitud fue aceptada',
      mensaje: `${medico} aceptó tu solicitud de ${s.tipo_procedimiento} y se dirigirá a tu domicilio.`,
      solicitudId: s.id,
    });
  }
}

async function alCancelarPorPaciente(solicitudOId) {
  const s = await completa(solicitudOId);
  if (!s?.medico_id) return;
  await notificarSeguro({
    usuarioId: s.medico_id,
    tipo: 'cancelada',
    titulo: '🚫 Solicitud cancelada',
    mensaje: `${s.paciente_nombre} canceló la solicitud de ${s.tipo_procedimiento}${
      s.programada_para ? ` programada para el ${fechaLegible(s.programada_para)}` : ''
    }.`,
    solicitudId: s.id,
  });
}

async function alFinalizar(solicitudOId) {
  const s = await completa(solicitudOId);
  if (!s) return;
  await notificarSeguro({
    usuarioId: s.paciente_id,
    tipo: 'finalizada',
    titulo: '✅ Atención finalizada',
    mensaje: `${s.medico_nombre} finalizó tu atención de ${s.tipo_procedimiento}. Revisa el reporte y califica el servicio.`,
    solicitudId: s.id,
  });
}

async function alCambiarEstado(solicitudOId, nuevoEstado) {
  const s = await completa(solicitudOId);
  if (!s) return;
  if (nuevoEstado === 'en_camino') {
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'en_camino',
      titulo: '🚗 Tu médico está en camino',
      mensaje: `${s.medico_nombre} se dirige a tu domicilio. Puedes seguir su ubicación en el mapa.`,
      solicitudId: s.id,
    });
  } else if (nuevoEstado === 'en_atencion') {
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'en_atencion',
      titulo: s.modalidad === 'consultorio' ? '🏥 Llegada registrada' : '📍 Tu médico llegó',
      mensaje:
        s.modalidad === 'consultorio'
          ? `${s.medico_nombre} registró tu llegada al consultorio. En breve comienza tu atención.`
          : `${s.medico_nombre} llegó a tu domicilio.`,
      solicitudId: s.id,
    });
  }
}

module.exports = { alAceptar, alCancelarPorPaciente, alFinalizar, alCambiarEstado };
