const { Router } = require('express');
const solicitudController = require('../controllers/solicitud.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = Router();

router.use('/solicitudes', authenticate);

router.post('/solicitudes', authorize('paciente'), solicitudController.crear);
router.get('/solicitudes/mias', authorize('paciente'), solicitudController.listarMias);
router.get('/solicitudes/atendidas', authorize('medico'), solicitudController.listarAtendidas);
router.get('/solicitudes/cercanas', authorize('medico'), solicitudController.listarCercanas);
router.get('/solicitudes/:id', solicitudController.obtener);
router.get('/solicitudes/:id/mensajes', solicitudController.listarMensajes);
router.post('/solicitudes/:id/aceptar', authorize('medico'), solicitudController.aceptar);
router.patch('/solicitudes/:id/cancelar', authorize('paciente'), solicitudController.cancelar);
router.post('/solicitudes/:id/finalizar', authorize('medico'), solicitudController.finalizar);
router.get('/solicitudes/:id/reporte', solicitudController.obtenerReporte);
router.post('/solicitudes/:id/calificar', authorize('paciente'), solicitudController.calificar);

module.exports = router;
