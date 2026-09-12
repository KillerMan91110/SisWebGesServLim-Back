-- Extensiones para queries geoespaciales sin PostGIS
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

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
