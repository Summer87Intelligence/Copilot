-- =============================================================================
-- seed-proto-operativo.sql — Dataset proto_* para validar Copilot (clientes, AR, caja, fiscal, documentos)
-- =============================================================================
-- EJECUCIÓN MANUAL: pegar en el SQL Editor de Supabase y ejecutar (Run).
-- No se ejecuta desde la app ni desde /demo.
--
-- Requisitos:
--   - Tablas public.proto_companies, proto_contacts, proto_invoices, proto_receipts,
--     proto_payments, proto_tax_obligations, proto_tax_payments, proto_documents
--     ya creadas y alineadas con el CRUD del proyecto.
--   - Columna opcional collection_probability en proto_invoices (extend-proto-invoices-collection-probability.sql).
--   - Columnas obligation_id en proto_payments si usás vínculo fiscal operativo.
--   - proto_contacts: este seed usa full_name, job_title, email, status. Si tu tabla usa
--     name / title / role, renombrá las columnas en los INSERT o ajustá la tabla.
--
-- Política: no borra tablas; inserta con ON CONFLICT DO NOTHING sobre PK (id).
-- UUIDs fijos prefijo d1e*/d2e*/… para trazabilidad y documentos vinculados.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Empresas (5) — Casos A–E repartidos en comentarios
-- ---------------------------------------------------------------------------
insert into public.proto_companies (
  id, name, industry, city, status, risk_level
) values
  -- A: facturación alta, deuda baja
  ('d1e00000-0000-4000-8000-000000000001'::uuid, 'Metalúrgica Delta', 'Industria metalúrgica', 'Montevideo', 'active', 'low'),
  ('d1e00000-0000-4000-8000-000000000002'::uuid, 'Retail Express', 'Retail', 'Punta del Este', 'active', 'medium'),
  -- B: deuda vencida fuerte
  ('d1e00000-0000-4000-8000-000000000003'::uuid, 'Distribuidora Sur', 'Distribución', 'Maldonado', 'active', 'high'),
  -- C: cobranza parcial
  ('d1e00000-0000-4000-8000-000000000004'::uuid, 'Comercial Andina', 'Comercio mayorista', 'Salto', 'active', 'medium'),
  -- D: caja vs obligación fiscal próxima (pagos operativos vinculados abajo)
  ('d1e00000-0000-4000-8000-000000000005'::uuid, 'Logística Oeste', 'Logística', 'Canelones', 'active', 'medium')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Contactos (1–2 por empresa)
-- ---------------------------------------------------------------------------
insert into public.proto_contacts (
  id, company_id, full_name, job_title, email, status
) values
  ('d1e00000-0000-4000-8000-000000000011'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'Laura Fernández', 'Gerente general', 'l.fernandez@metaldelta.example.com', 'active'),
  ('d1e00000-0000-4000-8000-000000000012'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'Martín Acosta', 'Finanzas', 'm.acosta@metaldelta.example.com', 'active'),
  ('d1e00000-0000-4000-8000-000000000013'::uuid, 'd1e00000-0000-4000-8000-000000000002'::uuid, 'Paula Méndez', 'Dueña', 'p.mendez@retailex.example.com', 'active'),
  ('d1e00000-0000-4000-8000-000000000014'::uuid, 'd1e00000-0000-4000-8000-000000000002'::uuid, 'Diego Ríos', 'Administración', 'd.rios@retailex.example.com', 'active'),
  ('d1e00000-0000-4000-8000-000000000015'::uuid, 'd1e00000-0000-4000-8000-000000000003'::uuid, 'Carlos Villar', 'Compras', 'c.villar@distsur.example.com', 'active'),
  ('d1e00000-0000-4000-8000-000000000016'::uuid, 'd1e00000-0000-4000-8000-000000000004'::uuid, 'Ana López', 'Tesorería', 'a.lopez@andina.example.com', 'active'),
  ('d1e00000-0000-4000-8000-000000000017'::uuid, 'd1e00000-0000-4000-8000-000000000005'::uuid, 'Rodrigo Paz', 'Operaciones', 'r.paz@logoeste.example.com', 'active'),
  ('d1e00000-0000-4000-8000-000000000018'::uuid, 'd1e00000-0000-4000-8000-000000000005'::uuid, 'Valentina Núñez', 'Contadora externa', 'v.nunez@estudio.example.com', 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Facturas (10): pagadas, abiertas, vencidas, parcial — collection_probability coherente
-- ---------------------------------------------------------------------------
insert into public.proto_invoices (
  id, company_id, invoice_number, issue_date, due_date,
  total_amount, balance_amount, collection_probability, status, category, notes
) values
  -- Delta — alto volumen, baja deuda
  ('d2e00000-0000-4000-8000-000000000001'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'MD-2026-0142', '2026-01-10', '2026-02-10', 1850000.00, 0.00, 0.92, 'paid', 'Venta nacional', 'Caso A: cerrada al día.'),
  ('d2e00000-0000-4000-8000-000000000002'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'MD-2026-0188', '2026-02-05', '2026-03-07', 920000.00, 0.00, 0.88, 'paid', 'Venta nacional', null),
  ('d2e00000-0000-4000-8000-000000000003'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'MD-2026-0220', '2026-03-18', '2026-04-20', 340000.00, 120000.00, 0.85, 'issued', 'Venta nacional', 'Saldo bajo; cliente sólido.'),
  -- Retail
  ('d2e00000-0000-4000-8000-000000000004'::uuid, 'd1e00000-0000-4000-8000-000000000002'::uuid, 'RX-2026-0091', '2026-02-01', '2026-03-03', 410000.00, 0.00, 0.78, 'paid', 'Retail', null),
  ('d2e00000-0000-4000-8000-000000000005'::uuid, 'd1e00000-0000-4000-8000-000000000002'::uuid, 'RX-2026-0110', '2026-03-22', '2026-04-22', 275000.00, 275000.00, 0.72, 'issued', 'Retail', 'Vence en abril; sin recibos aún.'),
  -- Sur — vencidas
  ('d2e00000-0000-4000-8000-000000000006'::uuid, 'd1e00000-0000-4000-8000-000000000003'::uuid, 'DS-2025-0440', '2025-11-12', '2025-12-12', 520000.00, 520000.00, 0.35, 'overdue', 'Distribución', 'Caso B: mora larga.'),
  ('d2e00000-0000-4000-8000-000000000007'::uuid, 'd1e00000-0000-4000-8000-000000000003'::uuid, 'DS-2026-0012', '2026-01-08', '2026-02-08', 310000.00, 310000.00, 0.42, 'overdue', 'Distribución', null),
  -- Andina — parcial
  ('d2e00000-0000-4000-8000-000000000008'::uuid, 'd1e00000-0000-4000-8000-000000000004'::uuid, 'CA-2026-0033', '2026-02-15', '2026-03-17', 500000.00, 300000.00, 0.55, 'partial', 'Mayorista', 'Caso C: 200k cobrados vía recibo.'),
  ('d2e00000-0000-4000-8000-000000000009'::uuid, 'd1e00000-0000-4000-8000-000000000004'::uuid, 'CA-2026-0040', '2026-03-01', '2026-04-02', 180000.00, 180000.00, 0.68, 'issued', 'Mayorista', null),
  -- Oeste
  ('d2e00000-0000-4000-8000-000000000010'::uuid, 'd1e00000-0000-4000-8000-000000000005'::uuid, 'LO-2026-0007', '2026-03-25', '2026-04-25', 195000.00, 195000.00, 0.70, 'issued', 'Servicios logísticos', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Recibos (5): totales + uno parcial (factura CA-2026-0033)
-- ---------------------------------------------------------------------------
insert into public.proto_receipts (
  id, company_id, invoice_id, receipt_number, receipt_date, amount, payment_method, status, reference, notes
) values
  ('d3e00000-0000-4000-8000-000000000001'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'd2e00000-0000-4000-8000-000000000001'::uuid, 'RC-MD-2026-089', '2026-02-08', 1850000.00, 'transferencia', 'paid', 'TRF-MD-089', 'Cobro total MD-0142'),
  ('d3e00000-0000-4000-8000-000000000002'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'd2e00000-0000-4000-8000-000000000002'::uuid, 'RC-MD-2026-090', '2026-03-05', 920000.00, 'débito', 'paid', 'DEB-MD-090', null),
  ('d3e00000-0000-4000-8000-000000000003'::uuid, 'd1e00000-0000-4000-8000-000000000002'::uuid, 'd2e00000-0000-4000-8000-000000000004'::uuid, 'RC-RX-2026-031', '2026-03-01', 410000.00, 'transferencia', 'paid', 'TRF-RX-031', null),
  ('d3e00000-0000-4000-8000-000000000004'::uuid, 'd1e00000-0000-4000-8000-000000000004'::uuid, 'd2e00000-0000-4000-8000-000000000008'::uuid, 'RC-CA-2026-012', '2026-03-02', 200000.00, 'efectivo', 'paid', 'CAJA-AND-12', 'Caso C: cobro parcial'),
  ('d3e00000-0000-4000-8000-000000000005'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'd2e00000-0000-4000-8000-000000000003'::uuid, 'RC-MD-2026-091', '2026-03-28', 220000.00, 'transferencia', 'paid', 'TRF-MD-091', 'Parcial sobre MD-0220 (queda saldo en factura)')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Obligaciones fiscales (5): pagada, pendiente, vencida, próxima, IVA abril
-- ---------------------------------------------------------------------------
insert into public.proto_tax_obligations (
  id, tax_type, period_label, due_date, estimated_amount, confirmed_amount, status, priority, notes
) values
  -- E: cerrada y conciliable con pago fiscal
  ('f1e00000-0000-4000-8000-000000000001'::uuid, 'iva', 'Enero 2026', '2026-02-14', 890000.00, 890000.00, 'paid', 'low', 'Caso E: liquidada; comprobante en proto_tax_payments.'),
  ('f1e00000-0000-4000-8000-000000000002'::uuid, 'iva', 'Abril 2026', '2026-04-18', 1420000.00, null, 'pending', 'high', 'Pendiente de saldo; parcial posible.'),
  ('f1e00000-0000-4000-8000-000000000003'::uuid, 'bps', 'Abril 2026', '2026-04-12', 468000.00, null, 'scheduled', 'critical', 'Caso D: vencimiento cercano; pago operativo vinculado abajo.'),
  ('f1e00000-0000-4000-8000-000000000004'::uuid, 'irae', 'Anticipo Q2 2026', '2026-05-08', 312000.00, null, 'scheduled', 'medium', 'IRA E anticipo trimestral.'),
  ('f1e00000-0000-4000-8000-000000000005'::uuid, 'dgi', 'Régimen general — Ene 2026', '2026-02-28', 125000.00, null, 'overdue', 'critical', 'Caso vencida: requiere seguimiento.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Pagos fiscales (2) vinculados a obligaciones
-- ---------------------------------------------------------------------------
insert into public.proto_tax_payments (
  id, obligation_id, payment_date, amount, payment_method, reference, status, notes
) values
  ('f2e00000-0000-4000-8000-000000000001'::uuid, 'f1e00000-0000-4000-8000-000000000001'::uuid, '2026-02-12', 890000.00, 'débito bancario', 'DGI-IVA-ENE-2026-OP', 'paid', 'Liquidación íntegra IVA enero (Caso E).'),
  ('f2e00000-0000-4000-8000-000000000002'::uuid, 'f1e00000-0000-4000-8000-000000000002'::uuid, '2026-03-30', 600000.00, 'transferencia', 'TRF-IVA-ABR-PARCIAL', 'paid', 'Anticipo sobre IVA abril (sigue saldo pendiente en obligación).')
on conflict (id) do nothing;

-- Coherencia montos confirmados vs pagos fiscales seed (idempotente)
update public.proto_tax_obligations
set confirmed_amount = 600000.00
where id = 'f1e00000-0000-4000-8000-000000000002'::uuid;

-- ---------------------------------------------------------------------------
-- Pagos operativos (6): categorías variadas + anticipo fiscal (Logística → BPS abril, parcial)
-- ---------------------------------------------------------------------------
insert into public.proto_payments (
  id, company_id, payment_number, payment_date, amount, category, vendor_name, status, reference, notes, obligation_id
) values
  ('d4e00000-0000-4000-8000-000000000001'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'OP-2026-0101', '2026-03-05', 185000.00, 'Servicios', 'Inmobiliaria Puerto S.A.', 'paid', 'ALQ-MD-03', 'Alquiler planta', null),
  ('d4e00000-0000-4000-8000-000000000002'::uuid, 'd1e00000-0000-4000-8000-000000000002'::uuid, 'OP-2026-0102', '2026-03-12', 42000.00, 'Servicios', 'SaaS Tools UY', 'paid', 'SW-RX-03', 'Software / suscripciones', null),
  ('d4e00000-0000-4000-8000-000000000003'::uuid, 'd1e00000-0000-4000-8000-000000000003'::uuid, 'OP-2026-0103', '2026-03-18', 256000.00, 'Proveedores', 'Materiales del Sur', 'paid', 'INS-DS-318', 'Insumos operativos', null),
  ('d4e00000-0000-4000-8000-000000000004'::uuid, 'd1e00000-0000-4000-8000-000000000004'::uuid, 'OP-2026-0104', '2026-03-22', 8900.00, 'Otros', 'Papelería Central', 'paid', 'PAP-CA-322', 'Papelería', null),
  ('d4e00000-0000-4000-8000-000000000005'::uuid, 'd1e00000-0000-4000-8000-000000000001'::uuid, 'OP-2026-0105', '2026-03-25', 95000.00, 'Servicios', 'Estudio Contable Ríos', 'paid', 'HON-MD-325', 'Honorarios profesionales', null),
  ('d4e00000-0000-4000-8000-000000000006'::uuid, 'd1e00000-0000-4000-8000-000000000005'::uuid, 'OP-2026-0106', '2026-03-28', 200000.00, 'Impuestos operativos', 'BPS', 'paid', 'BPS-ABR-SEED-PAR', 'Caso D: anticipo operativo; obligación BPS abril sigue abierta (caja tensionada).', 'f1e00000-0000-4000-8000-000000000003'::uuid)
on conflict (id) do nothing;

update public.proto_tax_obligations
set confirmed_amount = 200000.00
where id = 'f1e00000-0000-4000-8000-000000000003'::uuid;

-- ---------------------------------------------------------------------------
-- Documentos (4): factura, recibo, pago fiscal, obligación
-- ---------------------------------------------------------------------------
insert into public.proto_documents (
  id, document_type, related_table, related_id, file_name, file_url, mime_type, reference, issue_date, status, notes
) values
  (
    'd5e00000-0000-4000-8000-000000000001'::uuid,
    'factura_pdf',
    'proto_invoices',
    'd2e00000-0000-4000-8000-000000000001'::uuid,
    'MD-2026-0142.pdf',
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    'application/pdf',
    'MD-2026-0142',
    '2026-01-10',
    'active',
    'Respaldo factura Metalúrgica Delta (alto monto).'
  ),
  (
    'd5e00000-0000-4000-8000-000000000002'::uuid,
    'recibo_cobro',
    'proto_receipts',
    'd3e00000-0000-4000-8000-000000000004'::uuid,
    'RC-CA-2026-012.pdf',
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    'application/pdf',
    'RC-CA-2026-012',
    '2026-03-02',
    'active',
    'Comprobante cobro parcial Comercial Andina.'
  ),
  (
    'd5e00000-0000-4000-8000-000000000003'::uuid,
    'comprobante_pago_fiscal',
    'proto_tax_payments',
    'f2e00000-0000-4000-8000-000000000001'::uuid,
    'Comprobante_IVA_enero_2026.pdf',
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    'application/pdf',
    'DGI-IVA-ENE-2026-OP',
    '2026-02-12',
    'active',
    'Soporte pago fiscal IVA enero (Caso E).'
  ),
  (
    'd5e00000-0000-4000-8000-000000000004'::uuid,
    'dj_fiscal',
    'proto_tax_obligations',
    'f1e00000-0000-4000-8000-000000000002'::uuid,
    'DJ_IVA_abril_2026_borrador.pdf',
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    'application/pdf',
    'DJ-IVA-2026-04',
    '2026-04-01',
    'active',
    'Borrador / soporte obligación IVA Abril 2026.'
  )
on conflict (id) do nothing;

commit;

-- =============================================================================
-- Fin seed-proto-operativo.sql
-- =============================================================================
