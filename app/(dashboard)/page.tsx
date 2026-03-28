const pageBg = "#f7f4ed";
const textPrimary = "#2c2825";
const textMuted = "#5c5650";

const shadowSoft = "0 4px 20px rgba(44, 40, 37, 0.06)";
const shadowCard = "0 2px 14px rgba(44, 40, 37, 0.05)";

const metricCards: { label: string; value: string; bg: string; border: string }[] =
  [
    {
      label: "Caja disponible",
      value: "$120.000",
      bg: "#e8eef6",
      border: "rgba(100, 120, 150, 0.12)",
    },
    {
      label: "Ventas del mes",
      value: "$340.000",
      bg: "#e5efe8",
      border: "rgba(90, 120, 100, 0.12)",
    },
    {
      label: "Cobranzas pendientes",
      value: "$90.000",
      bg: "#f3e9e2",
      border: "rgba(140, 110, 95, 0.12)",
    },
    {
      label: "Gastos del mes",
      value: "$210.000",
      bg: "#ebe7f4",
      border: "rgba(110, 100, 140, 0.12)",
    },
  ];

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: "16px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: textPrimary,
};

const sectionPanelStyle = (
  bg: string,
  borderColor: string
): React.CSSProperties => ({
  backgroundColor: bg,
  border: `1px solid ${borderColor}`,
  borderRadius: "16px",
  padding: "22px 24px",
  boxShadow: shadowSoft,
});

export default function DashboardPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: pageBg,
        color: textPrimary,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
        padding: "32px 24px 56px",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      <header
        style={{
          marginBottom: "40px",
          paddingBottom: "28px",
          borderBottom: "1px solid rgba(44, 40, 37, 0.08)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(26px, 4vw, 32px)",
            fontWeight: 700,
            lineHeight: 1.2,
            color: textPrimary,
            letterSpacing: "-0.02em",
          }}
        >
          Summer87 Copilot
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "16px",
            color: textMuted,
            fontWeight: 500,
          }}
        >
          Panel ejecutivo
        </p>
      </header>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>📊 Métricas clave</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "18px",
          }}
        >
          {metricCards.map((item) => (
            <div
              key={item.label}
              style={{
                backgroundColor: item.bg,
                border: `1px solid ${item.border}`,
                borderRadius: "14px",
                padding: "22px 20px",
                boxShadow: shadowCard,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 600,
                  color: textMuted,
                  letterSpacing: "0.02em",
                }}
              >
                {item.label}
              </p>
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: textPrimary,
                  letterSpacing: "-0.02em",
                }}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>🚨 Alertas</h2>
        <ul
          style={{
            ...sectionPanelStyle("#faeee8", "rgba(180, 120, 100, 0.15)"),
            margin: 0,
            padding: "22px 24px 22px 40px",
            listStyle: "disc",
          }}
        >
          {[
            "Caja en riesgo en 12 días",
            "3 clientes concentran el 65% de la cobranza",
            "Gastos crecieron 18% este mes",
          ].map((text) => (
            <li
              key={text}
              style={{
                marginBottom: "12px",
                fontSize: "15px",
                lineHeight: 1.55,
                color: textPrimary,
              }}
            >
              {text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 style={sectionTitleStyle}>✅ Acciones recomendadas</h2>
        <ul
          style={{
            ...sectionPanelStyle("#e8f1ec", "rgba(90, 130, 105, 0.14)"),
            margin: 0,
            padding: "22px 24px 22px 40px",
            listStyle: "decimal",
          }}
        >
          {[
            "Llamar a Cliente A (deuda alta)",
            "Revisar gastos administrativos",
            "Priorizar cobranzas esta semana",
          ].map((text) => (
            <li
              key={text}
              style={{
                marginBottom: "12px",
                fontSize: "15px",
                lineHeight: 1.55,
                color: textPrimary,
              }}
            >
              {text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
