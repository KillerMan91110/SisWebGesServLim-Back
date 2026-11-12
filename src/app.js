const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const solicitudRoutes = require('./routes/solicitud.routes');
const medicoRoutes = require('./routes/medico.routes');
const pacienteRoutes = require('./routes/paciente.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());

if (!process.env.CORS_ORIGIN) {
  console.warn(
    '[config] CORS_ORIGIN no está definido: no se enviará ningún header Access-Control-Allow-Origin ' +
      'y el navegador bloqueará todas las peticiones cross-origin del frontend.'
  );
}
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());
app.use(morgan('dev'));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api', apiLimiter);

app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', adminRoutes);
app.use('/api', solicitudRoutes);
app.use('/api', medicoRoutes);
app.use('/api', pacienteRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
