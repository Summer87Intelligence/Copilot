import { describe, expect, it } from "vitest";

import {
  formatLastExpenseOrigin,
  formatLastIncomeOrigin,
} from "@/components/copilot/hoy/hoy-cash-detail-compact";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";

describe("hoy-cash-detail copy", () => {
  it("expone título y caption del bloque de últimos movimientos", () => {
    expect(HOY_COPY.cashLastMovementsTitle).toBe("Últimos movimientos de caja");
    expect(HOY_COPY.cashLastMovementsCaption).toBe(
      "Entrada y salida más reciente detectada por moneda."
    );
  });

  it("usa labels de entrada y salida de dinero", () => {
    expect(HOY_COPY.lastIncomeLabel).toBe("Última entrada de dinero");
    expect(HOY_COPY.lastExpenseLabel).toBe("Última salida de dinero");
  });

  it("usa empty states de entradas y salidas", () => {
    expect(HOY_COPY.noIncomeRegistered).toBe("Sin entradas registradas");
    expect(HOY_COPY.noExpenseRegistered).toBe("Sin salidas registradas");
  });

  it("formatea ingreso Zeta desde concepto Recibo", () => {
    expect(formatLastIncomeOrigin("Recibo RC-2")).toBe("Recibo Zeta: RC-2");
  });

  it("formatea ingreso manual", () => {
    expect(formatLastIncomeOrigin("Aporte socio")).toBe("Ingreso manual: Aporte socio");
  });

  it("formatea egreso manual", () => {
    expect(formatLastExpenseOrigin("Sueldos")).toBe("Egreso manual: Sueldos");
  });

  it("formatea pago con prefijo", () => {
    expect(formatLastExpenseOrigin("Pago proveedor X")).toBe("Pago: proveedor X");
  });
});
