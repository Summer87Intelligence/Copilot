"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { getCurrentAppUserContext } from "@/lib/current-user-context";
import { supabase } from "@/lib/supabase-client";
import { messageWarning } from "@/styles/ui";
import type { CurrentAppUserContext } from "@/types/current-user-context";

const pageBg = "#f7f4ed";
const textPrimary = "#2c2825";
const panelBg = "#f2efe8";
const panelBorder = "rgba(120, 100, 80, 0.12)";
const muted = "rgba(44, 40, 37, 0.6)";

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<CurrentAppUserContext>(null);
  const [signingOut, setSigningOut] = useState(false);

  const refreshContext = useCallback(async () => {
    const next = await getCurrentAppUserContext();
    setContext(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await getCurrentAppUserContext();
        if (!cancelled) setContext(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshContext();
    });
    return () => subscription.unsubscribe();
  }, [refreshContext]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      setContext(null);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: pageBg,
        color: textPrimary,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
        padding: "32px 24px 56px",
        maxWidth: "640px",
        margin: "0 auto",
      }}
    >
      <p style={{ margin: "0 0 20px", fontSize: "14px" }}>
        <Link
          href="/"
          style={{ color: "rgba(90, 75, 120, 0.9)", textDecoration: "none" }}
        >
          ← Volver al inicio
        </Link>
      </p>

      <h1
        style={{
          margin: "0 0 24px",
          fontSize: "26px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        Mi cuenta
      </h1>

      {loading ? (
        <p style={{ margin: 0, color: muted }}>Cargando sesión…</p>
      ) : context === null ? (
        <section
          style={{
            backgroundColor: panelBg,
            border: `1px solid ${panelBorder}`,
            borderRadius: "16px",
            padding: "22px 24px",
          }}
        >
          <p style={{ margin: 0, fontSize: "16px", lineHeight: 1.55 }}>
            No hay usuario autenticado. Iniciá sesión para ver tu cuenta y la
            vinculación con la app.
          </p>
          <p style={{ margin: "14px 0 0", fontSize: "14px", color: muted }}>
            Si usás magic link, abrí el enlace desde el mismo navegador.
          </p>
          <p style={{ margin: "16px 0 0" }}>
            <Link
              href="/login"
              style={{
                color: "rgba(90, 75, 120, 0.95)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Ir a iniciar sesión →
            </Link>
          </p>
        </section>
      ) : (
        <>
          <section
            style={{
              backgroundColor: panelBg,
              border: `1px solid ${panelBorder}`,
              borderRadius: "16px",
              padding: "22px 24px",
              marginBottom: "18px",
            }}
          >
            <dl style={{ margin: 0, display: "grid", gap: "14px" }}>
              <div>
                <dt
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: muted,
                  }}
                >
                  Email (Supabase Auth)
                </dt>
                <dd style={{ margin: "6px 0 0", fontSize: "16px" }}>
                  {context.authUser.email ?? "—"}
                </dd>
              </div>

              {context.appUser ? (
                <>
                  <div>
                    <dt
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: muted,
                      }}
                    >
                      Nombre (app_users)
                    </dt>
                    <dd style={{ margin: "6px 0 0", fontSize: "16px" }}>
                      {context.appUser.full_name}
                    </dd>
                  </div>
                  <div>
                    <dt
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: muted,
                      }}
                    >
                      Rol
                    </dt>
                    <dd style={{ margin: "6px 0 0", fontSize: "16px" }}>
                      {context.appUser.role}
                    </dd>
                  </div>
                  <div>
                    <dt
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: muted,
                      }}
                    >
                      companyId
                    </dt>
                    <dd
                      style={{
                        margin: "6px 0 0",
                        fontSize: "15px",
                        fontFamily: "ui-monospace, monospace",
                        wordBreak: "break-all",
                      }}
                    >
                      {context.companyId ?? "—"}
                    </dd>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: "4px",
                    padding: "14px 16px",
                    backgroundColor: messageWarning.background,
                    border: `1px solid ${messageWarning.border}`,
                    borderRadius: "12px",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      lineHeight: 1.55,
                      fontWeight: 600,
                    }}
                  >
                    Sesión activa, sin fila en app_users
                  </p>
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: "14px",
                      lineHeight: 1.5,
                      color: messageWarning.text,
                    }}
                  >
                    Tu email de acceso no coincide con ningún registro en{" "}
                    <code style={{ fontSize: "13px" }}>app_users</code>. El
                    dashboard seguirá usando la empresa demo o mocks hasta que
                    exista esa vinculación.
                  </p>
                </div>
              )}
            </dl>
          </section>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            style={{
              padding: "12px 22px",
              borderRadius: "12px",
              border: "1px solid rgba(44, 40, 37, 0.18)",
              backgroundColor: "#faf8f5",
              color: textPrimary,
              fontSize: "15px",
              fontWeight: 600,
              cursor: signingOut ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </>
      )}
    </main>
  );
}
