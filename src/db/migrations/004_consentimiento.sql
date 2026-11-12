-- Consentimiento para el tratamiento de datos personales y de salud (Ley N.° 29733).
ALTER TABLE usuarios
    ADD COLUMN consentimiento_datos_en TIMESTAMPTZ,
    ADD COLUMN consentimiento_version VARCHAR(20);
