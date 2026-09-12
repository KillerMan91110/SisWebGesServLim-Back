const { ZodError } = require('zod');

function notFound(req, res, next) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'El registro ya existe (dato duplicado)' });
  }

  console.error(err);
  // Solo se expone err.message cuando es un error de aplicación explícito (tiene .status);
  // cualquier otro error (ej. de Postgres) podría filtrar detalles internos, asi que se oculta.
  const status = err.status || 500;
  const mensaje = err.status ? err.message : 'Error interno del servidor';
  res.status(status).json({ error: mensaje });
}

module.exports = { notFound, errorHandler };
