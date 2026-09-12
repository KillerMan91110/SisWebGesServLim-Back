const { Router } = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = Router();

router.use('/admin', authenticate, authorize('admin'));
router.get('/admin/medicos/pendientes', adminController.listarMedicosPendientes);
router.patch('/admin/medicos/:id/verificar', adminController.verificarMedico);
router.delete('/admin/medicos/:id/rechazar', adminController.rechazarMedico);
router.get('/admin/usuarios', adminController.listarUsuarios);
router.patch('/admin/usuarios/:id/estado', adminController.actualizarEstadoUsuario);
router.get('/admin/dashboard', adminController.obtenerDashboard);
router.get('/admin/reportes/solicitudes.csv', adminController.exportarSolicitudesCsv);

module.exports = router;
