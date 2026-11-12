const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

// Protege contra fuerza bruta: solo cuentan los intentos FALLIDOS (contraseña incorrecta).
// En desarrollo el límite es más alto para poder probar con varias cuentas.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos fallidos de inicio de sesión. Espera 15 minutos e inténtalo de nuevo.' },
});

router.post('/auth/register/paciente', authController.registrarPaciente);
router.post('/auth/register/medico', authController.registrarMedico);
router.post('/auth/login', loginLimiter, authController.login);
router.get('/auth/me', authenticate, authController.me);
router.patch('/auth/me', authenticate, authController.actualizarPerfil);
router.patch('/auth/me/password', authenticate, authController.cambiarPassword);
router.post('/auth/me/consentimiento', authenticate, authController.aceptarConsentimiento);

module.exports = router;
