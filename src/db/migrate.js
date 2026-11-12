// Aplica en orden los archivos de src/db/migrations que todavía no se ejecutaron.
// Uso: npm run migrate
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const DIR = path.join(__dirname, 'migrations');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre VARCHAR(255) PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  // Bases creadas antes de existir este script ya tienen 001 aplicado a mano.
  const { rows: existe } = await pool.query(`SELECT to_regclass('public.usuarios') AS t`);
  if (existe[0].t) {
    await pool.query(
      `INSERT INTO schema_migrations (nombre) VALUES ('001_init.sql') ON CONFLICT DO NOTHING`
    );
  }

  const { rows } = await pool.query('SELECT nombre FROM schema_migrations');
  const aplicadas = new Set(rows.map((r) => r.nombre));
  const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(DIR, archivo), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [archivo]);
      await client.query('COMMIT');
      console.log(`✔ Migración aplicada: ${archivo}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Falló ${archivo}: ${err.message}`);
    } finally {
      client.release();
    }
  }
  console.log('Base de datos al día.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
