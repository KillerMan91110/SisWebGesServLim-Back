const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login, probá de nuevo más tarde' },
});

router.post('/auth/register/paciente', authController.registrarPaciente);
router.post('/auth/register/medico', authController.registrarMedico);
router.post('/auth/login', loginLimiter, authController.login);
router.get('/auth/me', authenticate, authController.me);
router.patch('/auth/me', authenticate, authController.actualizarPerfil);
router.patch('/auth/me/password', authenticate, authController.cambiarPassword);

module.exports = router;
