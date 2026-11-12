const { Pool, types } = require('pg');

// Las columnas DATE (ej. fecha de nacimiento) se devuelven como 'YYYY-MM-DD' sin convertir
// a Date, para que no se corran un día por la zona horaria.
types.setTypeParser(1082, (valor) => valor);

// En la nube (Supabase) se usa una sola cadena DATABASE_URL con SSL.
// En local se siguen usando las variables DB_HOST, DB_PORT, etc.
const config = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      // Supabase exige SSL; DB_SSL=false solo para probar la cadena contra un Postgres local
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_MAX) || 10,
    }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL', err);
});

module.exports = pool;
