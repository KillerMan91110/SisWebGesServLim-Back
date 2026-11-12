const { Router } = require('express');
const pacienteController = require('../controllers/paciente.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = Router();

router.use('/pacientes', authenticate, authorize('paciente'));
router.get('/pacientes/me/ficha', pacienteController.obtenerFicha);
router.put('/pacientes/me/ficha', pacienteController.guardarFicha);
router.get('/pacientes/me/historial', pacienteController.miHistorial);

module.exports = router;
