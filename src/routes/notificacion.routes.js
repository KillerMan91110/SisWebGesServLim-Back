const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const notificaciones = require('../services/notificacion.service');
const { parseId } = require('../utils/parseId');

const router = Router();

router.use('/notificaciones', authenticate);

router.get('/notificaciones', async (req, res, next) => {
  try {
    res.json(await notificaciones.listar(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.patch('/notificaciones/leer-todas', async (req, res, next) => {
  try {
    await notificaciones.marcarTodasLeidas(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/notificaciones/:id/leida', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'id inválido' });
    await notificaciones.marcarLeida(req.user.id, id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
