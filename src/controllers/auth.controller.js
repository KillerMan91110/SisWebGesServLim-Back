const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const usuarioModel = require('../models/usuario.model');

const registroPacienteSchema = z.object({
  nombre: z.string().min(2).max(150),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  telefono: z.string().max(20).optional(),
});

const registroMedicoSchema = registroPacienteSchema.extend({
  cmpColegiatura: z.string().min(3).max(20),
  especialidad: z.string().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

function firmarToken(usuario) {
  return jwt.sign({ id: usuario.id, rol: usuario.rol }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
}

function serializarUsuario(usuario) {
  const { password_hash, ...resto } = usuario;
  return resto;
}

async function registrarPaciente(req, res, next) {
  try {
    const datos = registroPacienteSchema.parse(req.body);
    const existente = await usuarioModel.findByEmail(datos.email);
    if (existente) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    const passwordHash = await bcrypt.hash(datos.password, 10);
    const usuario = await usuarioModel.crearPaciente({ ...datos, passwordHash });
    const token = firmarToken(usuario);
    res.status(201).json({ usuario, token });
  } catch (err) {
    next(err);
  }
}

async function registrarMedico(req, res, next) {
  try {
    const datos = registroMedicoSchema.parse(req.body);
    const existente = await usuarioModel.findByEmail(datos.email);
    if (existente) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    const passwordHash = await bcrypt.hash(datos.password, 10);
    const usuario = await usuarioModel.crearMedico({ ...datos, passwordHash });
    res.status(201).json({
      usuario,
      mensaje: 'Registro exitoso. Tu cuenta quedará activa cuando el administrador verifique tu colegiatura.',
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const usuario = await usuarioModel.findByEmail(email);
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    if (!usuario.activo) {
      return res.status(403).json({ error: 'Cuenta inactiva o pendiente de verificación por el administrador' });
    }
    const token = firmarToken(usuario);
    res.json({ usuario: serializarUsuario(usuario), token });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const usuario = await usuarioModel.findById(req.user.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ usuario: serializarUsuario(usuario) });
  } catch (err) {
    next(err);
  }
}

const actualizarPerfilSchema = z.object({
  nombre: z.string().min(2).max(150).optional(),
  telefono: z.string().max(20).optional(),
});

async function actualizarPerfil(req, res, next) {
  try {
    const datos = actualizarPerfilSchema.parse(req.body);
    const usuario = await usuarioModel.actualizarPerfil(req.user.id, datos);
    res.json({ usuario: serializarUsuario(usuario) });
  } catch (err) {
    next(err);
  }
}

const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z.string().min(8),
});

async function cambiarPassword(req, res, next) {
  try {
    const { passwordActual, passwordNueva } = cambiarPasswordSchema.parse(req.body);
    const usuario = await usuarioModel.findById(req.user.id);
    const valida = await bcrypt.compare(passwordActual, usuario.password_hash);
    if (!valida) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const passwordHash = await bcrypt.hash(passwordNueva, 10);
    await usuarioModel.actualizarPassword(usuario.id, passwordHash);
    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registrarPaciente,
  registrarMedico,
  login,
  me,
  actualizarPerfil,
  cambiarPassword,
};
