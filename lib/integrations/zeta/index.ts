export type {
  ZetaConnectionBlock,
  ZetaCompanyCredentials,
  ZetaDeveloperCredentials,
  ZetaStaticCredentials,
} from "@/lib/integrations/zeta/zeta-connection-types";
export {
  buildZetaConnectionBlock,
  assertZetaStaticCredentials,
  ZetaConfigurationError,
} from "@/lib/integrations/zeta/zeta-connection";
export { loadZetaServerConfig } from "@/lib/integrations/zeta/zeta-config";
export type { ZetaServerConfig } from "@/lib/integrations/zeta/zeta-invoke";
export {
  classifyZetaHttpResponse,
  classifyZetaNetworkError,
  parseRetryAfterMs,
  computeBackoffMs,
} from "@/lib/integrations/zeta/zeta-transport";
export { zetaLog } from "@/lib/integrations/zeta/zeta-log";
export {
  zetaPostJson,
  ZetaHttpError,
  type ZetaCallContext,
} from "@/lib/integrations/zeta/zeta-http-client";
export { zetaInvokeConnectionAndData } from "@/lib/integrations/zeta/zeta-invoke";
export {
  queryFacturaClienteSaldosPendientes,
  parseQuerySaldosPendientesOut,
  mapSaldoRowsToZetaInvoicesBestEffort,
  ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
  type QuerySaldosPendientesResult,
  type ZetaSaldoPendienteRow,
} from "@/lib/integrations/zeta/zeta-factura-cliente";
export {
  ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES,
  type ZetaSaldosPipelineMode,
  type ZetaSaldosPipelineOptions,
  type ZetaSaldosPipelineResult,
} from "@/lib/integrations/zeta/zeta-pipeline-types";
export { runZetaSaldosPendientesPipeline } from "@/lib/integrations/zeta/zeta-saldos-pipeline";
