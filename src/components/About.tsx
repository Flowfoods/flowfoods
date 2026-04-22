"use client";

import { useEffect, useRef } from "react";

const stats = [
  { number: "30+", label: "Anos de história" },
  { number: "20+", label: "Unidades" },
  { number: "100+", label: "Opções no cardápio" },
  { number: "1M+", label: "Clientes atendidos" },
];

export default function About() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.querySelectorAll(".animate-on-scroll").forEach((el) => {
              el.classList.add("visible");
            });
          }
        });
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="sobre"
      style={{
        padding: "100px 24px",
        background: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative leaf */}
      <div
        style={{
          position: "absolute",
          top: 40,
          right: -60,
          fontSize: 200,
          opacity: 0.04,
          transform: "rotate(-20deg)",
          pointerEvents: "none",
        }}
      >
        🍃
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          className="animate-on-scroll"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 60,
            alignItems: "center",
          }}
        >
          {/* Left — Text */}
          <div>
            <span
              style={{
                display: "inline-block",
                background:
                  "linear-gradient(135deg, rgba(140,198,63,0.15), rgba(168,224,99,0.15))",
                color: "#006837",
                padding: "6px 16px",
                borderRadius: 9999,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Nossa História
            </span>
            <h2
              style={{
                fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
                fontSize: "clamp(32px, 4vw, 48px)",
                fontWeight: 800,
                color: "#1a1a1a",
                lineHeight: 1.1,
                letterSpacing: "-1px",
                marginBottom: 20,
              }}
            >
              Tradição carioca em{" "}
              <span style={{ color: "#006837" }}>alimentação saudável</span>
            </h2>
            <p
              style={{
                color: "#555",
                fontSize: 17,
                lineHeight: 1.8,
                marginBottom: 16,
              }}
            >
              Nascida no coração do Rio de Janeiro, a <strong>Bibi Sucos</strong>{" "}
              é referência em alimentação rápida e saudável há mais de três
              décadas. Nossa missão é oferecer o melhor da natureza com o estilo
              de vida descontraído e vibrante da cidade maravilhosa.
            </p>
            <p
              style={{
                color: "#555",
                fontSize: 17,
                lineHeight: 1.8,
                marginBottom: 30,
              }}
            >
              De sucos naturais com dezenas de combinações ao nosso consagrado
              açaí orgânico, cada produto é preparado com ingredientes frescos e
              selecionados. Somos mais que uma rede — somos um estilo de vida.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  background: "#006837",
                  color: "#fff",
                  padding: "6px 14px",
                  borderRadius: 9999,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                🌱 100% Natural
              </span>
              <span
                style={{
                  background: "linear-gradient(135deg, #5b2c6f, #8e44ad)",
                  color: "#fff",
                  padding: "6px 14px",
                  borderRadius: 9999,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                🫐 Açaí Orgânico
              </span>
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #f7941d, #f26b5e)",
                  color: "#fff",
                  padding: "6px 14px",
                  borderRadius: 9999,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                🏖️ Lifestyle Carioca
              </span>
            </div>
          </div>

          {/* Right — Stats Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
            }}
          >
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={`animate-on-scroll animate-delay-${(i + 1) * 100}`}
                style={{
                  background:
                    i === 0
                      ? "linear-gradient(135deg, #004d2c, #006837)"
                      : i === 1
                      ? "linear-gradient(135deg, #5b2c6f, #8e44ad)"
                      : "#f5f0e8",
                  padding: 32,
                  borderRadius: 24,
                  textAlign: "center",
                  transition: "transform 0.3s ease",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
                    fontSize: 44,
                    fontWeight: 800,
                    color: i < 2 ? "#8cc63f" : "#006837",
                    lineHeight: 1,
                    marginBottom: 8,
                  }}
                >
                  {stat.number}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: i < 2 ? "rgba(255,255,255,0.8)" : "#555",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          #sobre > div > div { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
