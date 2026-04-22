"use client";

import { useEffect, useRef } from "react";

const features = [
  {
    icon: "🌿",
    title: "Ingredientes Frescos",
    description:
      "Selecionamos diariamente os melhores ingredientes para garantir qualidade e sabor em cada prato.",
    color: "#006837",
    bg: "rgba(0, 104, 55, 0.08)",
  },
  {
    icon: "🫐",
    title: "Açaí 100% Orgânico",
    description:
      "Nosso açaí vem direto do Pará, sem conservantes, com certificação orgânica e sabor incomparável.",
    color: "#5b2c6f",
    bg: "rgba(91, 44, 111, 0.08)",
  },
  {
    icon: "🛵",
    title: "Delivery Rápido",
    description:
      "Peça pelo iFood ou WhatsApp e receba em casa com a mesma qualidade de nossas lojas.",
    color: "#f7941d",
    bg: "rgba(247, 148, 29, 0.08)",
  },
  {
    icon: "⭐",
    title: "Bibi Clube",
    description:
      "Programa de fidelidade com cashback, brindes exclusivos e benefícios em todas as unidades.",
    color: "#f26b5e",
    bg: "rgba(242, 107, 94, 0.08)",
  },
  {
    icon: "💪",
    title: "Opções Fitness",
    description:
      "Cardápio com contagem calórica, opções low carb, veganas e para dietas especiais.",
    color: "#1a5276",
    bg: "rgba(26, 82, 118, 0.08)",
  },
  {
    icon: "🏖️",
    title: "Estilo Carioca",
    description:
      "Ambientes descontraídos inspirados na praia, onde você se sente de férias o ano inteiro.",
    color: "#8cc63f",
    bg: "rgba(140, 198, 63, 0.08)",
  },
];

export default function Features() {
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
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="diferenciais"
      style={{
        padding: "100px 24px",
        background: "#fff",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div
          className="animate-on-scroll"
          style={{ textAlign: "center", marginBottom: 60 }}
        >
          <span
            style={{
              display: "inline-block",
              background: "rgba(0, 104, 55, 0.1)",
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
            Por que escolher a Bibi
          </span>
          <h2
            style={{
              fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
              fontSize: "clamp(32px, 4vw, 48px)",
              fontWeight: 800,
              color: "#1a1a1a",
              letterSpacing: "-1px",
              marginBottom: 12,
            }}
          >
            Nossos{" "}
            <span style={{ color: "#006837" }}>diferenciais</span>
          </h2>
        </div>

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
          }}
          className="features-grid"
        >
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className={`animate-on-scroll animate-delay-${(i + 1) * 100}`}
              style={{
                background: "#fff",
                border: "1px solid #eee",
                borderRadius: 24,
                padding: 36,
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-6px)";
                e.currentTarget.style.boxShadow =
                  "0 12px 40px rgba(0,0,0,0.08)";
                e.currentTarget.style.borderColor = feat.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = "#eee";
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  background: feat.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  marginBottom: 20,
                }}
              >
                {feat.icon}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  marginBottom: 10,
                }}
              >
                {feat.title}
              </h3>
              <p
                style={{
                  color: "#666",
                  fontSize: 15,
                  lineHeight: 1.7,
                }}
              >
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .features-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .features-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}
