/**
 * CSVs de ejemplo para pruebas manuales del importador (`services/csv-importer.ts`).
 * Ambos casos usan el formato simplificado soportado por v1:
 *
 * invoice:
 * date,client,amount,status
 *
 * expense:
 * date,category,amount
 */

/**
 * Escenario balanceado:
 * - ventas razonables con mix de `paid` y `issued`
 * - gastos controlados
 * - perfil financiero saludable para un mes operativo normal
 */
export const sampleCsvBalanced = `invoice:
date,client,amount,status
2026-03-02,Distribuidora Norte,320000,paid
2026-03-04,Grupo Delta,285000,paid
2026-03-07,Retail Sur,190000,issued
2026-03-12,Distribuidora Norte,410000,partially_paid
2026-03-18,Industrias Patagónicas,365000,paid
2026-03-23,Grupo Delta,240000,issued

expense:
date,category,amount
2026-03-03,alquiler,120000
2026-03-05,sueldos,260000
2026-03-10,software,48000
2026-03-16,marketing,72000
2026-03-20,logistica,56000
2026-03-27,impuestos,91000`;

/**
 * Escenario alto riesgo:
 * - menos ventas cobradas (más `issued` y `partially_paid`)
 * - gastos altos y sostenidos
 * - tensión financiera para forzar alertas y recomendaciones del Copilot
 */
export const sampleCsvHighRisk = `invoice:
date,client,amount,status
2026-03-02,Mayorista Central,210000,issued
2026-03-06,Comercial Sur,175000,partially_paid
2026-03-09,Mayorista Central,240000,issued
2026-03-14,Tech Import,130000,paid
2026-03-19,Comercial Sur,195000,issued
2026-03-25,Mayorista Central,225000,issued

expense:
date,category,amount
2026-03-03,alquiler,185000
2026-03-05,sueldos,340000
2026-03-08,servicios,98000
2026-03-13,marketing,145000
2026-03-17,logistica,128000
2026-03-22,financiero,112000
2026-03-28,impuestos,160000`;

/**
 * Ejemplo de uso:
 * `buildSnapshotFromCsv(sampleCsvBalanced, "company-demo-summer87")`
 */

