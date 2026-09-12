function esParteDeSolicitud(solicitud, userId) {
  return Boolean(solicitud) && (solicitud.paciente_id === userId || solicitud.medico_id === userId);
}

function puedeAccederSolicitud(solicitud, usuarioActual) {
  return esParteDeSolicitud(solicitud, usuarioActual.id) || usuarioActual.rol === 'admin';
}

module.exports = { esParteDeSolicitud, puedeAccederSolicitud };
