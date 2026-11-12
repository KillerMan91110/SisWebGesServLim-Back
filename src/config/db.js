const { Pool, types } = require('pg');

// Las columnas DATE (ej. fecha de nacimiento) se devuelven como 'YYYY-MM-DD' sin convertir
// a Date, para que no se corran un día por la zona horaria.
types.setTypeParser(1082, (valor) => valor);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL', err);
});

module.exports = pool;
