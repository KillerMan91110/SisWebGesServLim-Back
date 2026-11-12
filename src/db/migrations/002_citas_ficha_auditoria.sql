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
