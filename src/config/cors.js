// Orígenes permitidos para el frontend, separados por comas en CORS_ORIGIN.
// Ej.: CORS_ORIGIN=https://medgo.vercel.app,http://localhost:5173
// Con CORS_PERMITIR_PREVIEWS_VERCEL=true también se aceptan las vistas previas
// de Vercel del mismo proyecto (https://<proyecto>-<hash>-<equipo>.vercel.app).
const permitidos = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const proyectoVercel = process.env.VERCEL_PROYECTO; // ej. "medgo-front"

function origenPermitido(origen) {
  if (!origen) return true; // peticiones sin origen (curl, apps, health checks)
  const limpio = origen.replace(/\/$/, '');
  if (permitidos.includes(limpio)) return true;
  if (
    process.env.CORS_PERMITIR_PREVIEWS_VERCEL === 'true' &&
    proyectoVercel &&
    new RegExp(`^https://${proyectoVercel}-[a-z0-9-]+\\.vercel\\.app$`).test(limpio)
  ) {
    return true;
  }
  return false;
}

const opcionesCors = {
  origin(origen, callback) {
    callback(null, origenPermitido(origen));
  },
};

module.exports = { opcionesCors, permitidos };
