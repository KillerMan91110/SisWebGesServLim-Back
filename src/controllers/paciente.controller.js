const { z } = require('zod');
const fichaModel = require('../models/fichaClinica.model');

const textoOpcional = (max) => z.string().trim().max(max).optional().or(z.literal(''));

const fichaSchema = z.object({
  dni: z
    .string()
    .trim()
    .regex(/^\d{8,12}$/, 'El DNI debe tener entre 8 y 12 dígitos')
    .optional()
    .or(z.literal('')),
  fecha_nacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .refine((v) => new Date(v) <= new Date(), 'La fecha de nacimiento no puede ser futura')
    .optional()
    .or(z.literal('')),
  sexo: z.enum(['femenino', 'masculino', 'otro']).optional().or(z.literal('')),
  grupo_sanguineo: z
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .optional()
    .or(z.literal('')),
  alergias: textoOpcional(1000),
  antecedentes: textoOpcional(2000),
  medicacion_actual: textoOpcional(1000),
  contacto_emergencia_nombre: textoOpcional(150),
  contacto_emergencia_telefono: textoOpcional(20),
});

async function obtenerFicha(req, res, next) {
  try {
    const ficha = await fichaModel.obtener(req.user.id);
    res.json({ ficha });
  } catch (err) {
    next(err);
  }
}

async function guardarFicha(req, res, next) {
  try {
    const datos = fichaSchema.parse(req.body);
    const ficha = await fichaModel.guardar(req.user.id, datos);
    res.json({ ficha });
  } catch (err) {
    next(err);
  }
}

async function miHistorial(req, res, next) {
  try {
    const [ficha, atenciones] = await Promise.all([
      fichaModel.obtener(req.user.id),
      fichaModel.historialAtenciones(req.user.id),
    ]);
    res.json({ ficha, atenciones });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerFicha, guardarFicha, miHistorial };
