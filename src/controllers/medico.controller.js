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
    res.json({ perfil: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function obtenerPerfil(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT usuario_id, cmp_colegiatura, especialidad, disponible, direccion_consultorio,
              lat_actual, lng_actual
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
});

async function actualizarConsultorio(req, res, next) {
  try {
    const { direccionConsultorio } = consultorioSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE perfiles_medicos SET direccion_consultorio = $1 WHERE usuario_id = $2
       RETURNING usuario_id, cmp_colegiatura, especialidad, disponible, direccion_consultorio`,
      [direccionConsultorio || null, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Perfil médico no encontrado' });
    res.json({ perfil: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { actualizarDisponibilidad, listarPublicos, obtenerPerfil, actualizarConsultorio };
