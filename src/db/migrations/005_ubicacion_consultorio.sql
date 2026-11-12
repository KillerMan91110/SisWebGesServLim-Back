-- Ubicación del consultorio en el mapa (para trazar la ruta del paciente hasta él).
ALTER TABLE perfiles_medicos
    ADD COLUMN consultorio_lat DOUBLE PRECISION,
    ADD COLUMN consultorio_lng DOUBLE PRECISION;
