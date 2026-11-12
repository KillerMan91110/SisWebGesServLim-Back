const jwt = require('jsonwebtoken');
const usuarioModel = require('../models/usuario.model');
const solicitudModel = require('../models/solicitud.model');
const mensajeModel = require('../models/mensaje.model');
const { esParteDeSolicitud } = require('../utils/autorizacion');
const avisos = require('../services/avisos.service');
const auditoriaModel = require('../models/auditoria.model');

const radioEnv = Number(process.env.RADIO_LLEGADA_METROS);
const RADIO_LLEGADA_METROS = Number.isFinite(radioEnv) ? radioEnv : 50;

const MENSAJE_MAX_LARGO = 2000;
const ESTADOS_CHAT_ACTIVO = ['aceptada', 'en_camino', 'en_atencion'];

function safeCallback(callback, payload) {
  if (typeof callback !== 'function') return;
  try {
    callback(payload);
  } catch (err) {
    console.error('Error en callback de socket:', err);
  }
}

function registerSockets(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Token no proporcionado'));
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return next(new Error('Token inválido o expirado'));
    }
    try {
      const usuario = await usuarioModel.findById(payload.id);
      if (!usuario || !usuario.activo) {
        return next(new Error('Cuenta inactiva o no encontrada'));
      }
      socket.user = { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre };
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const { id, rol } = socket.user;
    socket.join(`user:${id}`);
    if (rol === 'medico') {
      socket.join('medicos');
    }

    // Une al socket a la sala de una solicitud puntual (tracking + chat).
    // Paciente y médico participan; el admin entra en modo supervisión (solo lectura) y queda auditado.
    socket.on('solicitud:unirse', async (solicitudId, callback) => {
      try {
        const solicitud = await solicitudModel.findById(Number(solicitudId));
        const esAdmin = rol === 'admin' && Boolean(solicitud);
        if (!esParteDeSolicitud(solicitud, id) && !esAdmin) {
          return safeCallback(callback, { error: 'No autorizado' });
        }
        socket.join(`solicitud:${solicitud.id}`);
        if (esAdmin) {
          auditoriaModel
            .registrar({
              usuarioId: id,
              accion: 'supervisar_chat',
              pacienteId: solicitud.paciente_id,
              solicitudId: solicitud.id,
            })
            .catch(() => {});
        }
        safeCallback(callback, { ok: true, supervision: esAdmin && !esParteDeSolicitud(solicitud, id) });
      } catch (err) {
        safeCallback(callback, { error: 'Error al unirse a la solicitud' });
      }
    });

    socket.on('solicitud:salir', (solicitudId) => {
      socket.leave(`solicitud:${solicitudId}`);
    });

    // E4-02: el medico transmite su ubicacion mientras tiene una solicitud activa
    socket.on('ubicacion:enviar', async ({ solicitudId, lat, lng }, callback) => {
      try {
        if (rol !== 'medico') return safeCallback(callback, { error: 'Solo médicos pueden enviar ubicación' });
        const resultado = await solicitudModel.actualizarUbicacionMedico({
          medicoId: id,
          solicitudId: Number(solicitudId),
          lat,
          lng,
          radioLlegadaMetros: RADIO_LLEGADA_METROS,
        });
        if (!resultado) return safeCallback(callback, { error: 'Solicitud no encontrada o no activa' });

        const { solicitud, distancia, cambioEstado } = resultado;
        io.to(`solicitud:${solicitud.id}`).emit('ubicacion:medico', {
          solicitudId: solicitud.id,
          lat,
          lng,
          distanciaMetros: Math.round(distancia),
        });
        if (cambioEstado) {
          io.to(`user:${solicitud.paciente_id}`).emit('solicitud:actualizada', solicitud);
          io.to(`user:${solicitud.medico_id}`).emit('solicitud:actualizada', solicitud);
          avisos.alCambiarEstado(solicitud, solicitud.estado);
        }
        safeCallback(callback, { ok: true, distanciaMetros: Math.round(distancia), estado: solicitud.estado });
      } catch (err) {
        safeCallback(callback, { error: 'Error al actualizar ubicación' });
      }
    });

    // E5-01: chat en tiempo real de una solicitud
    socket.on('mensaje:enviar', async ({ solicitudId, contenido }, callback) => {
      try {
        const texto = (contenido || '').trim();
        if (!texto) return safeCallback(callback, { error: 'Mensaje vacío' });
        if (texto.length > MENSAJE_MAX_LARGO) {
          return safeCallback(callback, { error: `Mensaje demasiado largo (máx. ${MENSAJE_MAX_LARGO} caracteres)` });
        }
        const solicitud = await solicitudModel.findById(Number(solicitudId));
        if (!esParteDeSolicitud(solicitud, id)) {
          return safeCallback(callback, { error: 'No autorizado' });
        }
        if (!ESTADOS_CHAT_ACTIVO.includes(solicitud.estado)) {
          return safeCallback(callback, { error: 'El chat ya no está disponible para esta solicitud' });
        }
        const mensaje = await mensajeModel.crear({
          solicitudId: solicitud.id,
          remitenteId: id,
          contenido: texto,
        });
        io.to(`solicitud:${solicitud.id}`).emit('mensaje:nuevo', mensaje);
        safeCallback(callback, { ok: true, mensaje });
      } catch (err) {
        safeCallback(callback, { error: 'Error al enviar el mensaje' });
      }
    });

    // Indicador "escribiendo...": solo lo emiten los participantes y se reenvía al resto de la sala.
    socket.on('chat:escribiendo', async ({ solicitudId, escribiendo } = {}) => {
      const sala = `solicitud:${Number(solicitudId)}`;
      if (!socket.rooms.has(sala) || rol === 'admin') return;
      socket.to(sala).emit('chat:escribiendo', {
        solicitudId: Number(solicitudId),
        usuarioId: id,
        nombre: socket.user.nombre,
        rol,
        escribiendo: Boolean(escribiendo),
      });
    });

    // Al salir de la sala o desconectarse se apaga su indicador para los demás.
    socket.on('disconnecting', () => {
      for (const sala of socket.rooms) {
        if (sala.startsWith('solicitud:')) {
          socket.to(sala).emit('chat:escribiendo', {
            solicitudId: Number(sala.split(':')[1]),
            usuarioId: id,
            escribiendo: false,
          });
        }
      }
    });
  });
}

module.exports = { registerSockets };
