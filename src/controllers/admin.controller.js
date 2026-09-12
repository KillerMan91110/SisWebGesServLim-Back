const { z } = require('zod');
const perfilMedicoModel = require('../models/perfilMedico.model');
const usuarioModel = require('../models/usuario.model');
const dashboardModel = require('../models/dashboard.model');
const { parseId } = require('../utils/parseId');

async function listarMedicosPendientes(req, res, next) {
  try {
    const medicos = await perfilMedicoModel.listarPendientes();
    res.json({ medicos });
  } catch (err) {
    next(err);
  }
}

async function verificarMedico(req, res, next) {
  try {
    const usuarioId = parseId(req.params.id);
    if (usuarioId === null) return res.status(400).json({ error: 'id inválido' });
    await perfilMedicoModel.verificar(usuarioId);
    res.json({ mensaje: 'Médico verificado correctamente' });
  } catch (err) {
    next(err);
  }
}

async function rechazarMedico(req, res, next) {
  try {
    const usuarioId = parseId(req.params.id);
    if (usuarioId === null) return res.status(400).json({ error: 'id inválido' });
    await perfilMedicoModel.rechazar(usuarioId);
    res.json({ mensaje: 'Registro de médico rechazado; la cuenta fue eliminada' });
  } catch (err) {
    next(err);
  }
}

const listarUsuariosSchema = z.object({
  rol: z.enum(['paciente', 'medico', 'admin']).optional(),
});

async function listarUsuarios(req, res, next) {
  try {
    const { rol } = listarUsuariosSchema.parse(req.query);
    const usuarios = await usuarioModel.listarTodos({ rol });
    res.json({ usuarios });
  } catch (err) {
    next(err);
  }
}

const estadoSchema = z.object({ activo: z.boolean() });

async function actualizarEstadoUsuario(req, res, next) {
  try {
    const targetId = parseId(req.params.id);
    if (targetId === null) return res.status(400).json({ error: 'id inválido' });
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'No podés modificar el estado de tu propia cuenta' });
    }
    const { activo } = estadoSchema.parse(req.body);

    const usuarioActual = await usuarioModel.findById(targetId);
    if (!usuarioActual) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (activo && usuarioActual.rol === 'medico') {
      const perfil = await perfilMedicoModel.obtenerPorUsuarioId(targetId);
      if (!perfil?.verificado) {
        return res.status(409).json({
          error: 'Este médico todavía no está verificado. Usá /admin/medicos/:id/verificar para aprobarlo.',
        });
      }
    }

    const usuario = await usuarioModel.actualizarEstado(targetId, activo);
    res.json({ usuario });
  } catch (err) {
    next(err);
  }
}

const dashboardQuerySchema = z.object({
  dias: z.coerce.number().int().min(0).max(365).optional().default(30),
});

async function obtenerDashboard(req, res, next) {
  try {
    const { dias } = dashboardQuerySchema.parse(req.query);
    const [resumen, solicitudesPorDia, usuarios] = await Promise.all([
      dashboardModel.obtenerResumen(),
      dashboardModel.obtenerSolicitudesPorDia(dias),
      dashboardModel.obtenerResumenUsuarios(),
    ]);
    res.json({ resumen, solicitudesPorDia, usuarios });
  } catch (err) {
    next(err);
  }
}

// Mitiga inyección de fórmulas CSV (Excel/Sheets) anteponiendo una comilla
// a valores que empiezan con caracteres que un spreadsheet interpreta como fórmula.
function neutralizarFormulaCsv(str) {
  return /^[=+\-@]/.test(str) ? `'${str}` : str;
}

function filaACsv(valores) {
  return valores
    .map((v) => {
      if (v === null || v === undefined) return '';
      const str = neutralizarFormulaCsv(v instanceof Date ? v.toISOString() : String(v));
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    })
    .join(',');
}

const fechaOpcional = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Fecha inválida' })
  .optional();

const exportarSchema = z.object({
  desde: fechaOpcional,
  hasta: fechaOpcional,
});

async function exportarSolicitudesCsv(req, res, next) {
  try {
    const { desde, hasta } = exportarSchema.parse(req.query);
    const filas = await dashboardModel.listarParaExportar({ desde, hasta });
    const encabezado = [
      'id',
      'paciente_id',
      'medico_id',
      'tipo_procedimiento',
      'estado',
      'creado_en',
      'aceptada_en',
      'finalizado_en',
      'cancelado_en',
    ];
    const lineas = [filaACsv(encabezado), ...filas.map((f) => filaACsv(encabezado.map((c) => f[c])))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="solicitudes.csv"');
    res.send(lineas.join('\n'));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listarMedicosPendientes,
  verificarMedico,
  rechazarMedico,
  listarUsuarios,
  actualizarEstadoUsuario,
  obtenerDashboard,
  exportarSolicitudesCsv,
};
