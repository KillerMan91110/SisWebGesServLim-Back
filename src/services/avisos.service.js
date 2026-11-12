// Avisos que el sistema envía en cada momento del ciclo de una solicitud.
const solicitudModel = require('../models/solicitud.model');
const { notificarSeguro, fechaLegible, lugar, procedimiento } = require('./notificacion.service');
const perfilMedicoModel = require('../models/perfilMedico.model');

const RADIO_AVISO_KM = Number(process.env.RADIO_AVISO_MEDICOS_KM) || 15;

function km(metros) {
  const m = Number(metros);
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

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
      mensaje: `Tu cita de ${procedimiento(s)} del ${fechaLegible(s.programada_para)} fue confirmada con ${medico}, ${lugar(s)}.`,
      solicitudId: s.id,
    });
  } else if (s.modalidad === 'consultorio') {
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'aceptada',
      titulo: '🏥 Te esperan en el consultorio',
      mensaje: `${medico} aceptó tu solicitud de ${procedimiento(s)}. Acércate ${lugar(s)}.`,
      solicitudId: s.id,
    });
  } else {
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'aceptada',
      titulo: '🩺 Tu solicitud fue aceptada',
      mensaje: `${medico} aceptó tu solicitud de ${procedimiento(s)} y se dirigirá a tu domicilio.`,
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
    mensaje: `${s.paciente_nombre} canceló la solicitud de ${procedimiento(s)}${
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
    mensaje: `${s.medico_nombre} finalizó tu atención de ${procedimiento(s)}. Revisa el reporte y califica el servicio.`,
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

// Nueva solicitud: aviso a los médicos verificados y en línea dentro del radio.
async function alNuevaSolicitud(solicitud) {
  try {
    const cercanos = await perfilMedicoModel.listarCercanos({
      lat: solicitud.lat,
      lng: solicitud.lng,
      radioMetros: RADIO_AVISO_KM * 1000,
    });
    const cuando = solicitud.programada_para
      ? `cita para el ${fechaLegible(solicitud.programada_para)}`
      : 'atención inmediata';
    const donde = solicitud.modalidad === 'consultorio' ? 'en tu consultorio' : 'a domicilio';
    for (const m of cercanos) {
      await notificarSeguro({
        usuarioId: m.id,
        tipo: 'nueva_solicitud',
        titulo: '🆕 Nueva solicitud cerca de ti',
        mensaje: `${procedimiento(solicitud)} a ${km(m.distancia_metros)} · ${donde} · ${cuando}.`,
        solicitudId: solicitud.id,
      });
    }
  } catch (err) {
    console.error('[avisos] nueva solicitud:', err.message);
  }
}

// Consultorio: el paciente se dirige al consultorio o ya llegó (avisos al médico).
async function alMovimientoPaciente(solicitudOId, nuevoEstado) {
  const s = await completa(solicitudOId);
  if (!s?.medico_id) return;
  if (nuevoEstado === 'en_camino') {
    await notificarSeguro({
      usuarioId: s.medico_id,
      tipo: 'paciente_en_camino',
      titulo: '🚶 Paciente en camino',
      mensaje: `${s.paciente_nombre} se dirige a tu consultorio (${procedimiento(s)}). Puedes seguirlo en el mapa.`,
      solicitudId: s.id,
    });
  } else if (nuevoEstado === 'en_atencion') {
    await notificarSeguro({
      usuarioId: s.medico_id,
      tipo: 'paciente_llego',
      titulo: '🏥 Tu paciente llegó',
      mensaje: `${s.paciente_nombre} llegó a tu consultorio.`,
      solicitudId: s.id,
    });
    await notificarSeguro({
      usuarioId: s.paciente_id,
      tipo: 'en_atencion',
      titulo: '🏥 Llegaste al consultorio',
      mensaje: `${s.medico_nombre} fue avisado de tu llegada.`,
      solicitudId: s.id,
    });
  }
}

module.exports = { alNuevaSolicitud, alMovimientoPaciente, alAceptar, alCancelarPorPaciente, alFinalizar, alCambiarEstado };
