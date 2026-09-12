require('dotenv').config({ quiet: true });
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function main() {
  const [, , nombre, email, password] = process.argv;
  if (!nombre || !email || !password) {
    console.error('Uso: node src/db/seed-admin.js "<nombre>" <email> <password>');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
     VALUES ($1, $2, $3, 'admin', true)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [nombre, email, passwordHash]
  );

  if (rows[0]) {
    console.log('Admin creado:', rows[0]);
  } else {
    console.log('Ya existía un usuario con ese email.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
