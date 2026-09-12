const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/health/db', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({ status: 'ok', db_time: result.rows[0].now });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
