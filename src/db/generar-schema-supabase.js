// Genera supabase/schema.sql: todas las migraciones en un solo script para pegar
// en el SQL Editor de Supabase. Uso: npm run schema:supabase
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'migrations');
const SALIDA = path.join(__dirname, '..', '..', 'supabase', 'schema.sql');

const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const TABLAS = [
  'usuarios',
  'perfiles_medicos',
  'solicitudes_atencion',
  'historial_estados_solicitud',
  'reporte_atencion',
  'mensajes',
  'calificaciones',
  'fichas_clinicas',
  'auditoria_accesos',
  'notificaciones',
  'schema_migrations',
];

let sql = `-- =====================================================================
-- MedGo · Esquema completo de la base de datos para Supabase
-- Generado automáticamente desde src/db/migrations (npm run schema:supabase).
-- Pegar TODO en Supabase > SQL Editor > New query > Run, en una base VACÍA.
-- =====================================================================

BEGIN;

-- Supabase crea las extensiones en el esquema "extensions" por defecto. Se fuerzan en
-- "public" porque earthdistance usa funciones de cube sin calificar y los índices
-- geoespaciales fallarían si cube no está en el search_path.
CREATE EXTENSION IF NOT EXISTS cube WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA public;

-- Registro de migraciones aplicadas (lo usa "npm run migrate" en Render para no repetirlas)
CREATE TABLE IF NOT EXISTS schema_migrations (
    nombre VARCHAR(255) PRIMARY KEY,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

for (const archivo of archivos) {
  let contenido = fs.readFileSync(path.join(DIR, archivo), 'utf8');
  // Las extensiones ya se crearon arriba en el esquema correcto
  contenido = contenido.replace(/^CREATE EXTENSION IF NOT EXISTS \w+;\s*$/gim, '');
  sql += `
-- ---------------------------------------------------------------------
-- ${archivo}
-- ---------------------------------------------------------------------
${contenido.trim()}

INSERT INTO schema_migrations (nombre) VALUES ('${archivo}') ON CONFLICT DO NOTHING;
`;
}

sql += `
-- ---------------------------------------------------------------------
-- Seguridad en Supabase
-- Supabase expone el esquema "public" por su API REST (anon / authenticated).
-- Se activa Row Level Security SIN políticas: la API pública no puede leer ni
-- escribir nada. El backend se conecta como dueño de las tablas (postgres) y no
-- se ve afectado.
-- ---------------------------------------------------------------------
${TABLAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n')}

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  END IF;
END
$$;

COMMIT;

-- =====================================================================
-- (Opcional) Crear el primer administrador directamente desde SQL.
-- Recomendado: usar "npm run seed:admin" desde tu PC. Si prefieres SQL,
-- quita los guiones de las líneas de abajo y cambia nombre, correo y clave.
-- =====================================================================
-- INSERT INTO usuarios (nombre, email, password_hash, rol, activo, consentimiento_datos_en, consentimiento_version)
-- VALUES ('Nombre del Admin', 'admin@tucentro.pe',
--         extensions.crypt('CambiaEstaClave2026', extensions.gen_salt('bf', 10)),
--         'admin', true, now(), 'v1-2026');
`;

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, sql);
console.log(`Generado ${path.relative(process.cwd(), SALIDA)} con ${archivos.length} migraciones.`);
