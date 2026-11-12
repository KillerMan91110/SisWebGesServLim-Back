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

router.get('/medicos/perfil', authenticate, authorize('medico'), medicoController.obtenerPerfil);
router.patch(
  '/medicos/perfil/consultorio',
  authenticate,
  authorize('medico'),
  medicoController.actualizarConsultorio
);

module.exports = router;
