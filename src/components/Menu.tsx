"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const categories = [
  {
    title: "Sucos Naturais",
    description: "Mais de 40 combinações de frutas frescas",
    image: "/sucos.png",
    gradient: "linear-gradient(135deg, #8cc63f, #a8e063)",
    emoji: "🍊",
  },
  {
    title: "Açaí Orgânico",
    description: "O melhor açaí do Rio com toppings especiais",
    image: "/acai.png",
    gradient: "linear-gradient(135deg, #5b2c6f, #8e44ad)",
    emoji: "🫐",
  },
  {
    title: "Refeições",
    description: "Grelhados, acompanhamentos e opções fitness",
    image: "/refeicao.png",
    gradient: "linear-gradient(135deg, #006837, #004d2c)",
    emoji: "🥗",
  },
  {
    title: "Sanduíches",
    description: "Naturais, Angus e opções gourmet",
    image: "/sanduiche.png",
    gradient: "linear-gradient(135deg, #f7941d, #fbb040)",
    emoji: "🥪",
  },
  {
    title: "Saladas",
    description: "Monte a sua com ingredientes frescos e premium",
    image: "/salada.png",
    gradient: "linear-gradient(135deg, #1a5276, #2980b9)",
    emoji: "🥬",
  },
];

export default function Menu() {
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
      id="cardapio"
      style={{
        padding: "100px 24px",
        background: "#f5f0e8",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
            Nosso Cardápio
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
            Feito com{" "}
            <span style={{ color: "#006837" }}>ingredientes frescos</span>
          </h2>
          <p
            style={{
              color: "#555",
              fontSize: 17,
              maxWidth: 500,
              margin: "0 auto",
            }}
          >
            Escolha entre nossas categorias e descubra sabores que vão
            transformar seu dia.
          </p>
        </div>

        {/* Grid — Bento-style */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "auto auto",
            gap: 20,
          }}
          className="menu-grid"
        >
          {categories.map((cat, i) => (
            <div
              key={cat.title}
              className={`animate-on-scroll animate-delay-${(i + 1) * 100}`}
              style={{
                position: "relative",
                borderRadius: 24,
                overflow: "hidden",
                cursor: "pointer",
                gridColumn:
                  i === 0 ? "span 2" : i === 3 ? "span 2" : "span 1",
                minHeight: i === 0 || i === 3 ? 320 : 300,
                transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-6px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <Image
                src={cat.image}
                alt={cat.title}
                fill
                style={{
                  objectFit: "cover",
                  transition: "transform 0.6s ease",
                }}
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              {/* Overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)",
                  zIndex: 1,
                }}
              />
              {/* Badge */}
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  left: 20,
                  zIndex: 2,
                  background: "rgba(255,255,255,0.15)",
                  backdropFilter: "blur(10px)",
                  padding: "8px 16px",
                  borderRadius: 9999,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <span style={{ fontSize: 16 }}>{cat.emoji}</span>
                <span
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {cat.title}
                </span>
              </div>
              {/* Info */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: 28,
                  zIndex: 2,
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
                    fontSize: 26,
                    fontWeight: 700,
                    color: "#fff",
                    marginBottom: 6,
                  }}
                >
                  {cat.title}
                </h3>
                <p
                  style={{
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 14,
                  }}
                >
                  {cat.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .menu-grid {
            grid-template-columns: 1fr !important;
          }
          .menu-grid > div {
            grid-column: span 1 !important;
            min-height: 250px !important;
          }
        }
      `}</style>
    </section>
  );
}
