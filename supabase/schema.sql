-- =====================================================================
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

-- ---------------------------------------------------------------------
-- 001_init.sql
-- ---------------------------------------------------------------------
-- Extensiones para queries geoespaciales sin PostGIS


-- Tipos
CREATE TYPE rol_usuario AS ENUM ('paciente', 'medico', 'admin');
CREATE TYPE estado_solicitud AS ENUM ('pendiente', 'aceptada', 'en_camino', 'en_atencion', 'finalizada', 'cancelada');

-- Usuarios (paciente, medico o admin)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol rol_usuario NOT NULL,
    telefono VARCHAR(20),
    direccion VARCHAR(255),
    foto_url VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Datos exclusivos de médicos (1:1 con usuarios)
CREATE TABLE perfiles_medicos (
    usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    cmp_colegiatura VARCHAR(20) UNIQUE NOT NULL,
    especialidad VARCHAR(100) NOT NULL,
    verificado BOOLEAN NOT NULL DEFAULT false,
    verificado_en TIMESTAMPTZ,
    disponible BOOLEAN NOT NULL DEFAULT false,
    lat_actual DOUBLE PRECISION,
    lng_actual DOUBLE PRECISION,
    ubicacion_actualizada_en TIMESTAMPTZ
);

-- Índice geoespacial para "médicos disponibles cerca de X"
CREATE INDEX idx_perfiles_medicos_ubicacion
    ON perfiles_medicos
    USING gist (ll_to_earth(lat_actual, lng_actual))
    WHERE disponible = true;

-- Solicitudes de atención
CREATE TABLE solicitudes_atencion (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES usuarios(id),
    medico_id INTEGER REFERENCES usuarios(id),
    tipo_procedimiento VARCHAR(100) NOT NULL,
    descripcion TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    estado estado_solicitud NOT NULL DEFAULT 'pendiente',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    aceptada_en TIMESTAMPTZ,
    finalizado_en TIMESTAMPTZ,
    cancelado_en TIMESTAMPTZ
);

CREATE INDEX idx_solicitudes_estado ON solicitudes_atencion (estado);
CREATE INDEX idx_solicitudes_paciente ON solicitudes_atencion (paciente_id);
CREATE INDEX idx_solicitudes_medico ON solicitudes_atencion (medico_id);
CREATE INDEX idx_solicitudes_ubicacion
    ON solicitudes_atencion
    USING gist (ll_to_earth(lat, lng));

-- Auditoría de cambios de estado (sirve para métricas del panel admin: E8-01/E8-02)
CREATE TABLE historial_estados_solicitud (
    id SERIAL PRIMARY KEY,
    solicitud_id INTEGER NOT NULL REFERENCES solicitudes_atencion(id) ON DELETE CASCADE,
    estado_anterior estado_solicitud,
    estado_nuevo estado_solicitud NOT NULL,
    cambiado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    cambiado_por INTEGER REFERENCES usuarios(id)
);

CREATE INDEX idx_historial_solicitud ON historial_estados_solicitud (solicitud_id);

-- Reporte clínico liviano por solicitud (1:1)
CREATE TABLE reporte_atencion (
    solicitud_id INTEGER PRIMARY KEY REFERENCES solicitudes_atencion(id) ON DELETE CASCADE,
    diagnostico TEXT,
    procedimiento_realizado TEXT,
    observaciones TEXT,
    recomendaciones TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat de una solicitud
CREATE TABLE mensajes (
    id SERIAL PRIMARY KEY,
    solicitud_id INTEGER NOT NULL REFERENCES solicitudes_atencion(id) ON DELETE CASCADE,
    remitente_id INTEGER NOT NULL REFERENCES usuarios(id),
    contenido TEXT NOT NULL,
    enviado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mensajes_solicitud ON mensajes (solicitud_id);

-- Calificación del médico por parte del paciente
CREATE TABLE calificaciones (
    id SERIAL PRIMARY KEY,
    solicitud_id INTEGER UNIQUE NOT NULL REFERENCES solicitudes_atencion(id) ON DELETE CASCADE,
    calificado_por INTEGER NOT NULL REFERENCES usuarios(id),
    medico_id INTEGER NOT NULL REFERENCES usuarios(id),
    puntaje INTEGER NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
    comentario TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calificaciones_medico ON calificaciones (medico_id);

INSERT INTO schema_migrations (nombre) VALUES ('001_init.sql') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 002_citas_ficha_auditoria.sql
-- ---------------------------------------------------------------------
-- Citas programadas, modalidad de atención, ficha clínica del paciente y auditoría de accesos.

-- Modalidad: el profesional va al domicilio o el paciente acude a su consultorio
CREATE TYPE modalidad_atencion AS ENUM ('domicilio', 'consultorio');

ALTER TABLE solicitudes_atencion
    ADD COLUMN modalidad modalidad_atencion NOT NULL DEFAULT 'domicilio',
    -- NULL = atención inmediata; con fecha = cita programada
    ADD COLUMN programada_para TIMESTAMPTZ;

CREATE INDEX idx_solicitudes_programada
    ON solicitudes_atencion (programada_para)
    WHERE programada_para IS NOT NULL;

-- Dirección del consultorio del médico (para la modalidad "consultorio")
ALTER TABLE perfiles_medicos
    ADD COLUMN direccion_consultorio VARCHAR(255);

-- Ficha clínica del paciente (1:1 con usuarios de rol paciente)
CREATE TABLE fichas_clinicas (
    usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    dni VARCHAR(12),
    fecha_nacimiento DATE,
    sexo VARCHAR(20),
    grupo_sanguineo VARCHAR(5),
    alergias TEXT,
    antecedentes TEXT,
    medicacion_actual TEXT,
    contacto_emergencia_nombre VARCHAR(150),
    contacto_emergencia_telefono VARCHAR(20),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registro de quién consulta información clínica (control de acceso / seguridad)
CREATE TABLE auditoria_accesos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    accion VARCHAR(60) NOT NULL,
    paciente_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    solicitud_id INTEGER REFERENCES solicitudes_atencion(id) ON DELETE SET NULL,
    detalle TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditoria_creado ON auditoria_accesos (creado_en DESC);

INSERT INTO schema_migrations (nombre) VALUES ('002_citas_ficha_auditoria.sql') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 003_notificaciones.sql
-- ---------------------------------------------------------------------
-- Notificaciones dentro de la plataforma y control de recordatorios de citas.

CREATE TABLE notificaciones (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo VARCHAR(40) NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    mensaje TEXT NOT NULL,
    solicitud_id INTEGER REFERENCES solicitudes_atencion(id) ON DELETE CASCADE,
    leida_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_usuario ON notificaciones (usuario_id, creado_en DESC);
CREATE INDEX idx_notificaciones_no_leidas ON notificaciones (usuario_id) WHERE leida_en IS NULL;

-- Marcas para no enviar el mismo aviso dos veces
ALTER TABLE solicitudes_atencion
    ADD COLUMN recordatorio_24h_en TIMESTAMPTZ,
    ADD COLUMN recordatorio_1h_en TIMESTAMPTZ,
    ADD COLUMN aviso_sin_medico_en TIMESTAMPTZ;

INSERT INTO schema_migrations (nombre) VALUES ('003_notificaciones.sql') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 004_consentimiento.sql
-- ---------------------------------------------------------------------
-- Consentimiento para el tratamiento de datos personales y de salud (Ley N.° 29733).
ALTER TABLE usuarios
    ADD COLUMN consentimiento_datos_en TIMESTAMPTZ,
    ADD COLUMN consentimiento_version VARCHAR(20);

INSERT INTO schema_migrations (nombre) VALUES ('004_consentimiento.sql') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 005_ubicacion_consultorio.sql
-- ---------------------------------------------------------------------
-- Ubicación del consultorio en el mapa (para trazar la ruta del paciente hasta él).
ALTER TABLE perfiles_medicos
    ADD COLUMN consultorio_lat DOUBLE PRECISION,
    ADD COLUMN consultorio_lng DOUBLE PRECISION;

INSERT INTO schema_migrations (nombre) VALUES ('005_ubicacion_consultorio.sql') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Seguridad en Supabase
-- Supabase expone el esquema "public" por su API REST (anon / authenticated).
-- Se activa Row Level Security SIN políticas: la API pública no puede leer ni
-- escribir nada. El backend se conecta como dueño de las tablas (postgres) y no
-- se ve afectado.
-- ---------------------------------------------------------------------
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles_medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_atencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_estados_solicitud ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporte_atencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE calificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichas_clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_accesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

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
