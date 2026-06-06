"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useMemo, useState } from "react";

import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { copilotApiFetch } from "@/lib/copilot-fetch";

type MePayload = {
  appUser?: {
    email: string;
    role: string;
    company_id: string;
    full_name?: string;
  };
};

/**
 * Franja de diagnóstico (solo `NODE_ENV === "development"`): tenant activo, ids y sesión.
 * No altera lógica de negocio.
 */
export function CopilotDevTenantDiagnostics({
  sessionPreview,
}: {
  sessionPreview: CopilotSessionPreview | null;
}) {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [meUser, setMeUser] = useState<MePayload["appUser"] | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [companyNameFromClient, setCompanyNameFromClient] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let cancelled = false;
    void (async () => {
      if (sessionPreview?.tenantCompanyId) {
        setMeUser(null);
        setMeLoaded(true);
        return;
      }

      setMeLoaded(false);
      const res = await copilotApiFetch("/api/copilot/me");
      if (cancelled) return;
      if (!res.ok) {
        setMeUser(null);
        setMeLoaded(true);
        return;
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        setMeUser(null);
        setMeLoaded(true);
        return;
      }
      const u =
        json &&
        typeof json === "object" &&
        "appUser" in json &&
        (json as MePayload).appUser &&
        typeof (json as MePayload).appUser === "object"
          ? (json as MePayload).appUser!
          : null;
      if (!cancelled) {
        setMeUser(u);
        setMeLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionPreview]);

  const companyId =
    sessionPreview?.tenantCompanyId?.trim() ||
    meUser?.company_id?.trim() ||
    "";

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let cancelled = false;
    void (async () => {
      if (!companyId) {
        setCompanyNameFromClient(null);
        return;
      }
      if (sessionPreview?.activeCompanyName) {
        setCompanyNameFromClient(null);
        return;
      }
      const { data, error } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data?.name) {
        setCompanyNameFromClient(null);
        return;
      }
      setCompanyNameFromClient(String(data.name));
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, sessionPreview?.activeCompanyName, supabase]);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const companyName =
    sessionPreview?.activeCompanyName?.trim() ||
    companyNameFromClient ||
    "—";

  const email =
    sessionPreview?.displayEmail?.trim() || meUser?.email?.trim() || "—";
  const role =
    sessionPreview?.displayRole?.trim() || meUser?.role?.trim() || "—";

  if (!sessionPreview && !meLoaded) {
    return (
      <div className="border-b border-dashed border-amber-700/40 bg-amber-50/90 px-4 py-1.5 font-mono text-[11px] text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 sm:px-6">
        <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-800/60 dark:text-amber-50">
          Dev tenant
        </span>{" "}
        Cargando contexto…
      </div>
    );
  }

  return (
    <div className="border-b border-dashed border-amber-700/40 bg-amber-50/90 px-4 py-1.5 font-mono text-[11px] leading-relaxed text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 sm:px-6">
      <span className="mr-2 inline-flex items-center rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-800/60 dark:text-amber-50">
        Dev tenant
      </span>
      <span className="text-amber-900/90 dark:text-amber-100/90">
        Empresa: <strong>{companyName}</strong>
        {" · "}
        <code className="rounded bg-white/60 px-1 dark:bg-black/25">
          company_id={companyId || "—"}
        </code>
        {" · "}
        email: <strong>{email}</strong>
        {" · "}
        rol: <strong>{role}</strong>
      </span>
      {!sessionPreview ? (
        <span className="ml-2 text-amber-800/80 dark:text-amber-200/80">
          (sin cookie de layout; datos vía /api/copilot/me + companies)
        </span>
      ) : null}
    </div>
  );
}
