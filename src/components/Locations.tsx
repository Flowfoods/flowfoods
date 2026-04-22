"use client";

import { useEffect, useRef } from "react";

const locations = [
  {
    name: "Barra da Tijuca",
    address: "Av. das Américas, 4666 — BarraShopping",
    hours: "Seg a Dom: 10h – 22h",
    mapUrl: "https://maps.google.com/?q=Bibi+Sucos+Barra+da+Tijuca",
  },
  {
    name: "Copacabana",
    address: "Av. Nossa Sra. de Copacabana, 1418",
    hours: "Seg a Dom: 7h – 23h",
    mapUrl: "https://maps.google.com/?q=Bibi+Sucos+Copacabana",
  },
  {
    name: "Leblon",
    address: "Rua Dias Ferreira, 45",
    hours: "Seg a Dom: 7h – 23h",
    mapUrl: "https://maps.google.com/?q=Bibi+Sucos+Leblon",
  },
  {
    name: "Ipanema",
    address: "Rua Visconde de Pirajá, 595",
    hours: "Seg a Dom: 7h – 23h",
    mapUrl: "https://maps.google.com/?q=Bibi+Sucos+Ipanema",
  },
];

export default function Locations() {
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
      id="unidades"
      style={{
        padding: "100px 24px",
        background: "#f5f0e8",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div className="animate-on-scroll" style={{ textAlign: "center", marginBottom: 60 }}>
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
            Nossas Unidades
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
            Sempre <span style={{ color: "#006837" }}>perto de você</span>
          </h2>
          <p style={{ color: "#555", fontSize: 17, maxWidth: 480, margin: "0 auto" }}>
            Com mais de 20 unidades no Rio de Janeiro, tem sempre uma Bibi
            pertinho. Cada loja é pensada para você se sentir em casa.
          </p>
        </div>

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 20,
          }}
          className="locations-grid"
        >
          {locations.map((loc, i) => (
            <a
              key={loc.name}
              href={loc.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`animate-on-scroll animate-delay-${(i + 1) * 100}`}
              style={{
                background: "#fff",
                borderRadius: 24,
                padding: 32,
                textDecoration: "none",
                border: "1px solid #eee",
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-6px)";
                e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,104,55,0.1)";
                e.currentTarget.style.borderColor = "#8cc63f";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = "#eee";
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: "linear-gradient(135deg, #004d2c, #006837)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                }}
              >
                📍
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#1a1a1a",
                }}
              >
                {loc.name}
              </h3>
              <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>
                {loc.address}
              </p>
              <p
                style={{
                  color: "#006837",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                🕐 {loc.hours}
              </p>
              <span
                style={{
                  color: "#006837",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: "auto",
                }}
              >
                Ver no mapa →
              </span>
            </a>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .locations-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .locations-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </section>
  );
}
