const { z } = require('zod');
const pool = require('../config/db');
const perfilMedicoModel = require('../models/perfilMedico.model');

async function listarPublicos(req, res, next) {
  try {
    const medicos = await perfilMedicoModel.listarVerificadosPublico();
    res.json({ medicos });
  } catch (err) {
    next(err);
  }
}

const disponibilidadSchema = z.object({
  disponible: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

async function actualizarDisponibilidad(req, res, next) {
  try {
    const { disponible, lat, lng } = disponibilidadSchema.parse(req.body);
    if (disponible && (lat === undefined || lng === undefined)) {
      return res.status(400).json({ error: 'Se requiere lat/lng para pasar a disponible' });
    }
    const { rows } = await pool.query(
      `UPDATE perfiles_medicos
       SET disponible = $1,
           lat_actual = COALESCE($2, lat_actual),
           lng_actual = COALESCE($3, lng_actual),
           ubicacion_actualizada_en = CASE WHEN $2 IS NOT NULL THEN now() ELSE ubicacion_actualizada_en END
       WHERE usuario_id = $4
       RETURNING usuario_id, disponible, lat_actual, lng_actual, ubicacion_actualizada_en`,
      [disponible, lat ?? null, lng ?? null, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Perfil médico no encontrado' });
    }
    // Los pacientes ven al instante a los médicos que se conectan o desconectan
    const io = req.app.get('io');
    if (io) io.to('pacientes').emit('medicos:disponibilidad', { medicoId: req.user.id, disponible });
    res.json({ perfil: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function obtenerPerfil(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT usuario_id, cmp_colegiatura, especialidad, disponible, direccion_consultorio,
              consultorio_lat, consultorio_lng, lat_actual, lng_actual
       FROM perfiles_medicos WHERE usuario_id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Perfil médico no encontrado' });
    res.json({ perfil: rows[0] });
  } catch (err) {
    next(err);
  }
}

const consultorioSchema = z.object({
  direccionConsultorio: z.string().trim().max(255),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

async function actualizarConsultorio(req, res, next) {
  try {
    const { direccionConsultorio, lat, lng } = consultorioSchema.parse(req.body);
    const conUbicacion = lat !== undefined && lng !== undefined;
    const { rows } = await pool.query(
      `UPDATE perfiles_medicos
       SET direccion_consultorio = $1,
           consultorio_lat = CASE WHEN $4 THEN $2::double precision ELSE consultorio_lat END,
           consultorio_lng = CASE WHEN $4 THEN $3::double precision ELSE consultorio_lng END
       WHERE usuario_id = $5
       RETURNING usuario_id, cmp_colegiatura, especialidad, disponible, direccion_consultorio,
                 consultorio_lat, consultorio_lng`,
      [direccionConsultorio || null, lat ?? null, lng ?? null, conUbicacion, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Perfil médico no encontrado' });
    res.json({ perfil: rows[0] });
  } catch (err) {
    next(err);
  }
}

const cercanosSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radio: z.coerce.number().positive().max(50000).optional().default(10000),
});

async function listarCercanos(req, res, next) {
  try {
    const { lat, lng, radio } = cercanosSchema.parse(req.query);
    const medicos = await perfilMedicoModel.listarCercanos({ lat, lng, radioMetros: radio });
    res.json({ medicos });
  } catch (err) {
    next(err);
  }
}

module.exports = { listarCercanos, actualizarDisponibilidad, listarPublicos, obtenerPerfil, actualizarConsultorio };
