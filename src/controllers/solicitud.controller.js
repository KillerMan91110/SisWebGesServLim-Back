const { z } = require('zod');
const solicitudModel = require('../models/solicitud.model');
const mensajeModel = require('../models/mensaje.model');
const reporteAtencionModel = require('../models/reporteAtencion.model');
const calificacionModel = require('../models/calificacion.model');
const { parseId } = require('../utils/parseId');
const { puedeAccederSolicitud } = require('../utils/autorizacion');

const crearSchema = z.object({
  tipoProcedimiento: z.string().min(2).max(100),
  descripcion: z.string().max(2000).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const cercanasSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radio: z.coerce.number().positive().max(50000).optional().default(10000),
});

const finalizarSchema = z.object({
  diagnostico: z.string().max(2000).optional(),
  procedimientoRealizado: z.string().max(2000).optional(),
  observaciones: z.string().max(2000).optional(),
  recomendaciones: z.string().max(2000).optional(),
});

const calificarSchema = z.object({
  puntaje: z.number().int().min(1).max(5),
  comentario: z.string().max(1000).optional(),
});

async function crear(req, res, next) {
  try {
    const datos = crearSchema.parse(req.body);
    const solicitud = await solicitudModel.crear({ pacienteId: req.user.id, ...datos });
    const io = req.app.get('io');
    if (io) io.to('medicos').emit('solicitud:nueva', solicitud);
    res.status(201).json({ solicitud });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'id inválido' });
    const solicitud = await solicitudModel.findById(id);
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (!puedeAccederSolicitud(solicitud, req.user)) {
      return res.status(403).json({ error: 'No tenés acceso a esta solicitud' });
    }
    res.json({ solicitud });
  } catch (err) {
    next(err);
  }
}

async function listarMias(req, res, next) {
  try {
    const solicitudes = await solicitudModel.listarPorPaciente(req.user.id);
    res.json({ solicitudes });
  } catch (err) {
    next(err);
  }
}

async function listarAtendidas(req, res, next) {
  try {
    const solicitudes = await solicitudModel.listarPorMedico(req.user.id);
    res.json({ solicitudes });
  } catch (err) {
    next(err);
  }
}

async function listarCercanas(req, res, next) {
  try {
    const { lat, lng, radio } = cercanasSchema.parse(req.query);
    const solicitudes = await solicitudModel.listarCercanas({ lat, lng, radioMetros: radio });
    res.json({ solicitudes });
  } catch (err) {
    next(err);
  }
}

async function aceptar(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'id inválido' });
    const solicitud = await solicitudModel.aceptar({ solicitudId: id, medicoId: req.user.id });
    if (!solicitud) {
      return res.status(409).json({ error: 'La solicitud ya no está disponible' });
    }
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${solicitud.paciente_id}`).emit('solicitud:actualizada', solicitud);
      io.to('medicos').emit('solicitud:tomada', { id: solicitud.id });
    }
    res.json({ solicitud });
  } catch (err) {
    next(err);
  }
}

async function cancelar(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'id inválido' });
    const solicitud = await solicitudModel.cancelar({ solicitudId: id, pacienteId: req.user.id });
    if (!solicitud) {
      return res.status(409).json({ error: 'La solicitud no se puede cancelar en su estado actual' });
    }
    const io = req.app.get('io');
    if (io) {
      io.to('medicos').emit('solicitud:tomada', { id: solicitud.id });
      if (solicitud.medico_id) {
        io.to(`user:${solicitud.medico_id}`).emit('solicitud:actualizada', solicitud);
      }
    }
    res.json({ solicitud });
  } catch (err) {
    next(err);
  }
}

async function listarMensajes(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'id inválido' });
    const solicitud = await solicitudModel.findById(id);
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (!puedeAccederSolicitud(solicitud, req.user)) {
      return res.status(403).json({ error: 'No tenés acceso a esta solicitud' });
    }
    const mensajes = await mensajeModel.listarPorSolicitud(solicitud.id);
    res.json({ mensajes });
  } catch (err) {
    next(err);
  }
}

async function finalizar(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'id inválido' });
    const datos = finalizarSchema.parse(req.body ?? {});
    const solicitud = await solicitudModel.finalizar({
      solicitudId: id,
      medicoId: req.user.id,
      reporte: datos,
    });
    if (!solicitud) {
      return res.status(409).json({ error: 'La solicitud no se puede finalizar en su estado actual' });
    }
    const io = req.app.get('io');
    if (io) {
      io.to(`solicitud:${solicitud.id}`).emit('solicitud:actualizada', solicitud);
      io.to(`user:${solicitud.paciente_id}`).emit('solicitud:actualizada', solicitud);
    }
    res.json({ solicitud });
  } catch (err) {
    next(err);
  }
}

async function obtenerReporte(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'id inválido' });
    const solicitud = await solicitudModel.findById(id);
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (!puedeAccederSolicitud(solicitud, req.user)) {
      return res.status(403).json({ error: 'No tenés acceso a esta solicitud' });
    }
    const reporte = await reporteAtencionModel.obtenerPorSolicitud(solicitud.id);
    if (!reporte) return res.status(404).json({ error: 'Todavía no hay reporte para esta solicitud' });
    res.json({ reporte });
  } catch (err) {
    next(err);
  }
}

async function calificar(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'id inválido' });
    const datos = calificarSchema.parse(req.body);
    const solicitud = await solicitudModel.findById(id);
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (solicitud.paciente_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo el paciente de esta solicitud puede calificarla' });
    }
    if (solicitud.estado !== 'finalizada') {
      return res.status(409).json({ error: 'Solo se puede calificar una solicitud finalizada' });
    }
    if (solicitud.puntaje !== null && solicitud.puntaje !== undefined) {
      return res.status(409).json({ error: 'Ya calificaste esta solicitud' });
    }
    const calificacion = await calificacionModel.crear({
      solicitudId: solicitud.id,
      calificadoPor: req.user.id,
      medicoId: solicitud.medico_id,
      puntaje: datos.puntaje,
      comentario: datos.comentario,
    });
    res.status(201).json({ calificacion });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  crear,
  obtener,
  listarMias,
  listarAtendidas,
  listarCercanas,
  aceptar,
  cancelar,
  listarMensajes,
  finalizar,
  obtenerReporte,
  calificar,
};
