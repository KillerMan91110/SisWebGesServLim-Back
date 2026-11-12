// Copias de seguridad de la base de datos en formato JSON.
// No depende de pg_dump: lee cada tabla con el mismo pool de la aplicación,
// así funciona igual en cualquier PC donde corra el backend.
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const DIRECTORIO = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups'));
const RETENER = Number(process.env.BACKUP_RETENER) || 14;

// Orden de dependencias (padres antes que hijos) para poder restaurar.
const TABLAS = [
  'usuarios',
  'perfiles_medicos',
  'fichas_clinicas',
  'solicitudes_atencion',
  'historial_estados_solicitud',
  'reporte_atencion',
  'mensajes',
  'calificaciones',
  'auditoria_accesos',
];

const NOMBRE_VALIDO = /^respaldo-\d{8}-\d{6}(-[a-z]+)?\.json$/;

function marcaDeTiempo(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-` +
    `${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}`
  );
}

async function tablasExistentes() {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const existentes = new Set(rows.map((r) => r.table_name));
  return TABLAS.filter((t) => existentes.has(t));
}

async function crearRespaldo({ origen = 'manual' } = {}) {
  fs.mkdirSync(DIRECTORIO, { recursive: true });
  const client = await pool.connect();
  const datos = {};
  try {
    // Lectura consistente de todas las tablas en un mismo instante.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const tabla of await tablasExistentes()) {
      const { rows } = await client.query(`SELECT * FROM ${tabla} ORDER BY 1`);
      datos[tabla] = rows;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const nombre = `respaldo-${marcaDeTiempo()}-${origen === 'automatico' ? 'auto' : 'manual'}.json`;
  const contenido = { version: 1, creado_en: new Date().toISOString(), origen, tablas: datos };
  fs.writeFileSync(path.join(DIRECTORIO, nombre), JSON.stringify(contenido));
  depurarAntiguos();
  return describir(nombre);
}

function describir(nombre) {
  const stat = fs.statSync(path.join(DIRECTORIO, nombre));
  return {
    nombre,
    tamano_bytes: stat.size,
    creado_en: stat.mtime.toISOString(),
    origen: nombre.includes('-auto') ? 'automatico' : 'manual',
  };
}

function listarRespaldos() {
  if (!fs.existsSync(DIRECTORIO)) return [];
  return fs
    .readdirSync(DIRECTORIO)
    .filter((f) => NOMBRE_VALIDO.test(f))
    .map(describir)
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
}

function depurarAntiguos() {
  listarRespaldos()
    .slice(RETENER)
    .forEach((r) => fs.unlinkSync(path.join(DIRECTORIO, r.nombre)));
}

// Devuelve la ruta absoluta solo si el nombre es un respaldo válido (evita path traversal).
function rutaDeRespaldo(nombre) {
  if (!NOMBRE_VALIDO.test(nombre)) return null;
  const ruta = path.join(DIRECTORIO, nombre);
  return fs.existsSync(ruta) ? ruta : null;
}

// Programa respaldos automáticos cada N horas y hace uno al iniciar si el último es antiguo.
function programarRespaldos() {
  const horas = Number(process.env.BACKUP_INTERVALO_HORAS) || 24;
  if (horas <= 0) return;
  const intervaloMs = horas * 60 * 60 * 1000;

  const ejecutar = () =>
    crearRespaldo({ origen: 'automatico' })
      .then((r) => console.log(`[respaldo] creado ${r.nombre}`))
      .catch((err) => console.error('[respaldo] falló:', err.message));

  const ultimo = listarRespaldos()[0];
  if (!ultimo || Date.now() - new Date(ultimo.creado_en).getTime() > intervaloMs) {
    ejecutar();
  }
  setInterval(ejecutar, intervaloMs).unref();
}

module.exports = { TABLAS, DIRECTORIO, crearRespaldo, listarRespaldos, rutaDeRespaldo, programarRespaldos };
