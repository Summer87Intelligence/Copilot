import { describe, expect, it } from "vitest";

import {
  chunkCompanyIds,
  CLIENT_TRANSFER_ALIAS_COMPANY_BATCH_SIZE,
  mergeAliasRowsIntoMap,
} from "./client-transfer-aliases-query";

describe("chunkCompanyIds", () => {
  it("parte más de 500 IDs en batches sin truncar silenciosamente", () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `id-${i}`);
    const chunks = chunkCompanyIds(ids);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(CLIENT_TRANSFER_ALIAS_COMPANY_BATCH_SIZE);
    expect(chunks[1]).toHaveLength(CLIENT_TRANSFER_ALIAS_COMPANY_BATCH_SIZE);
    expect(chunks[2]).toHaveLength(200);
    expect(chunks.flat()).toHaveLength(1200);
  });
});

describe("mergeAliasRowsIntoMap", () => {
  it("agrupa labels por company_id preservando orden de inserción", () => {
    const map = new Map<string, string[]>();
    mergeAliasRowsIntoMap(map, [
      { company_id: "c1", label: "ALIAS A" },
      { company_id: "c1", label: "ALIAS B" },
      { company_id: "c2", label: "OTHER" },
    ]);

    expect(map.get("c1")).toEqual(["ALIAS A", "ALIAS B"]);
    expect(map.get("c2")).toEqual(["OTHER"]);
  });
});
