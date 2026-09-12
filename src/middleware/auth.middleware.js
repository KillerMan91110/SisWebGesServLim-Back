const jwt = require('jsonwebtoken');
const usuarioModel = require('../models/usuario.model');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  const token = header.slice('Bearer '.length);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  try {
    // Se revalida contra la base en cada request: si el admin desactiva la cuenta,
    // un JWT firmado y todavía no expirado deja de servir de inmediato.
    const usuario = await usuarioModel.findById(payload.id);
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Cuenta inactiva o no encontrada' });
    }
    req.user = { id: usuario.id, rol: usuario.rol };
    next();
  } catch (err) {
    next(err);
  }
}

function authorize(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tenés permisos para esta acción' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
