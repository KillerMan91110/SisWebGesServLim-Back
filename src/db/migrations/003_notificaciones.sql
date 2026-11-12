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
