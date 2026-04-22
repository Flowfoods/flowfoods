"use client";

import { useEffect, useRef, useState } from "react";

const testimonials = [
  {
    name: "Carla M.",
    location: "Barra da Tijuca",
    text: "O açaí da Bibi é simplesmente o melhor do Rio! Peço pelo iFood toda semana e nunca me decepciona. Qualidade incomparável!",
    rating: 5,
    avatar: "CM",
  },
  {
    name: "Rafael S.",
    location: "Copacabana",
    text: "Almoço na Bibi quase todo dia. As opções fitness são perfeitas pra quem treina e não quer abrir mão do sabor. Recomendo demais!",
    rating: 5,
    avatar: "RS",
  },
  {
    name: "Ana Paula T.",
    location: "Leblon",
    text: "Os sucos detox da Bibi salvam minha manhã! Frescos, saborosos e com combinações incríveis. Já sou cliente há mais de 10 anos.",
    rating: 5,
    avatar: "AT",
  },
  {
    name: "João Pedro L.",
    location: "Botafogo",
    text: "Melhor sanduíche natural da cidade! O atendimento é sempre excelente e o delivery chega rápido. Nota 10!",
    rating: 5,
    avatar: "JL",
  },
];

export default function Testimonials() {
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

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
      style={{
        padding: "100px 24px",
        background: "linear-gradient(135deg, #004d2c 0%, #006837 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative */}
      <div
        style={{
          position: "absolute",
          top: -100,
          left: -100,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(140,198,63,0.1) 0%, transparent 70%)",
        }}
      />

      <div style={{ maxWidth: 900, margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div className="animate-on-scroll" style={{ textAlign: "center", marginBottom: 50 }}>
          <span
            style={{
              display: "inline-block",
              background: "rgba(140, 198, 63, 0.2)",
              color: "#a8e063",
              padding: "6px 16px",
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Depoimentos
          </span>
          <h2
            style={{
              fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
              fontSize: "clamp(32px, 4vw, 48px)",
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-1px",
            }}
          >
            O que nossos clientes <span style={{ color: "#8cc63f" }}>dizem</span>
          </h2>
        </div>

        {/* Carousel */}
        <div
          className="animate-on-scroll animate-delay-200"
          style={{
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 28,
            padding: "48px 40px",
            textAlign: "center",
            minHeight: 250,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Stars */}
          <div style={{ marginBottom: 20, fontSize: 22, letterSpacing: 4 }}>
            {"⭐".repeat(testimonials[active].rating)}
          </div>

          {/* Quote */}
          <p
            key={active}
            style={{
              color: "rgba(255,255,255,0.9)",
              fontSize: "clamp(16px, 2vw, 20px)",
              lineHeight: 1.7,
              maxWidth: 650,
              fontStyle: "italic",
              marginBottom: 30,
              animation: "fadeInUp 0.5s ease-out",
            }}
          >
            &ldquo;{testimonials[active].text}&rdquo;
          </p>

          {/* Author */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #8cc63f, #a8e063)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#004d2c",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {testimonials[active].avatar}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 16 }}>
                {testimonials[active].name}
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                📍 {testimonials[active].location}
              </div>
            </div>
          </div>
        </div>

        {/* Dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 10,
            marginTop: 28,
          }}
        >
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Depoimento ${i + 1}`}
              style={{
                width: active === i ? 32 : 10,
                height: 10,
                borderRadius: 9999,
                background: active === i ? "#8cc63f" : "rgba(255,255,255,0.3)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
