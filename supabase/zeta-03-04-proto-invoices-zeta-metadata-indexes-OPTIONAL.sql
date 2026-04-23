-- =============================================================================
-- OPCIONAL — NO ejecutar salvo análisis de rendimiento en producción
-- =============================================================================
-- Las consultas del pipeline filtran por rutas JSONB, p. ej.:
--   zeta_metadata->zeta_comprobante_identity_v1->>registro_id
--   zeta_metadata->zeta_customer_voucher_v1->>serie / numero
--
-- Un índice GIN sobre `zeta_metadata` puede acelerar esos filtros, pero:
-- - aumenta espacio en disco y costo en cada UPDATE de la columna;
-- - en tablas chicas suele no compensar frente a seq scan + filtros tenant.
--
-- Evaluar con EXPLAIN (ANALYZE) en staging antes de crear.
-- =============================================================================

-- Ejemplo (comentado): índice GIN genérico jsonb_path_ops suele servir para @> ; las
-- expresiones `->` de PostgREST a veces se benefician de gin (jsonb_ops). Probar ambos en PG.

-- create index concurrently if not exists idx_proto_invoices_zeta_metadata_gin
--   on public.proto_invoices using gin (zeta_metadata jsonb_ops);
