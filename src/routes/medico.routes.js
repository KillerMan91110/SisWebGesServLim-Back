const { Router } = require('express');
const medicoController = require('../controllers/medico.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = Router();

// Pública: sin authenticate, para la página de inicio.
router.get('/medicos/publicos', medicoController.listarPublicos);

router.patch(
  '/medicos/disponibilidad',
  authenticate,
  authorize('medico'),
  medicoController.actualizarDisponibilidad
);

module.exports = router;
