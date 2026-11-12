// Restaura la base de datos desde un respaldo JSON generado por el sistema.
// REEMPLAZA todos los datos actuales. Uso:
//   npm run backup:restaurar -- respaldo-20261111-230000-auto.json --confirmar
require('dotenv').config({ quiet: true });
const fs = require('fs');
const pool = require('../config/db');
const { TABLAS, rutaDeRespaldo, crearRespaldo } = require('../services/respaldo.service');

async function main() {
  const [, , nombre, flag] = process.argv;
  const ruta = nombre && rutaDeRespaldo(nombre);
  if (!ruta) {
    console.error('Indica un respaldo existente de la carpeta backups/.');
    process.exitCode = 1;
    return;
  }
  if (flag !== '--confirmar') {
    console.error('Esto reemplaza TODOS los datos actuales. Repite el comando agregando --confirmar.');
    process.exitCode = 1;
    return;
  }

  // Red de seguridad: respaldo del estado actual antes de sobrescribir.
  const previo = await crearRespaldo({ origen: 'manual' });
  console.log(`Estado actual guardado en ${previo.nombre}`);

  const { tablas } = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${TABLAS.filter((t) => tablas[t]).join(', ')} RESTART IDENTITY CASCADE`);
    for (const tabla of TABLAS) {
      for (const fila of tablas[tabla] || []) {
        const columnas = Object.keys(fila);
        const valores = columnas.map((c) => fila[c]);
        const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores})`,
          valores
        );
      }
      // Reajusta la secuencia SERIAL si la tabla tiene columna id.
      if ((tablas[tabla] || [])[0]?.id !== undefined) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), COALESCE((SELECT MAX(id) FROM ${tabla}), 1))`
        );
      }
    }
    await client.query('COMMIT');
    console.log(`✔ Base restaurada desde ${nombre}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('Error al restaurar:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
