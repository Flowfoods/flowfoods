"use client";

import { useEffect, useRef } from "react";

const instagramPosts = [
  { emoji: "🥤", caption: "Suco detox da manhã", color: "#8cc63f" },
  { emoji: "🫐", caption: "Açaí na tigela XL", color: "#5b2c6f" },
  { emoji: "🥗", caption: "Salada do chef", color: "#006837" },
  { emoji: "🥪", caption: "Sanduíche Angus", color: "#f7941d" },
  { emoji: "🧃", caption: "Vitamina tropical", color: "#f26b5e" },
  { emoji: "🍲", caption: "Bowl de salmão", color: "#1a5276" },
];

export default function Instagram() {
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
      style={{
        padding: "80px 24px",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div
          className="animate-on-scroll"
          style={{
            textAlign: "center",
            marginBottom: 48,
          }}
        >
          <span
            style={{
              display: "inline-block",
              background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            @bibisucos
          </span>
          <h2
            style={{
              fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
              fontSize: "clamp(28px, 3.5vw, 42px)",
              fontWeight: 800,
              color: "#1a1a1a",
              letterSpacing: "-1px",
              marginBottom: 8,
            }}
          >
            Siga a gente no{" "}
            <span
              style={{
                background:
                  "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Instagram
            </span>
          </h2>
          <p style={{ color: "#888", fontSize: 15 }}>
            Acompanhe nosso dia a dia e fique por dentro das novidades
          </p>
        </div>

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 12,
          }}
          className="instagram-grid"
        >
          {instagramPosts.map((post, i) => (
            <a
              key={i}
              href="https://www.instagram.com/bibisucos/"
              target="_blank"
              rel="noopener noreferrer"
              className={`animate-on-scroll animate-delay-${(i + 1) * 100}`}
              style={{
                position: "relative",
                aspectRatio: "1",
                borderRadius: 16,
                background: `linear-gradient(135deg, ${post.color}22, ${post.color}11)`,
                border: `1px solid ${post.color}20`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                textDecoration: "none",
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
                e.currentTarget.style.boxShadow = `0 12px 30px ${post.color}25`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <span style={{ fontSize: 40 }}>{post.emoji}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: post.color,
                  textAlign: "center",
                  padding: "0 8px",
                }}
              >
                {post.caption}
              </span>
            </a>
          ))}
        </div>

        {/* Follow Button */}
        <div
          className="animate-on-scroll animate-delay-300"
          style={{ textAlign: "center", marginTop: 36 }}
        >
          <a
            href="https://www.instagram.com/bibisucos/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background:
                "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
              color: "#fff",
              padding: "14px 32px",
              borderRadius: 9999,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.5px",
              transition: "all 0.3s",
              boxShadow: "0 4px 20px rgba(253, 29, 29, 0.25)",
            }}
          >
            📸 Seguir @bibisucos
          </a>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .instagram-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
        @media (max-width: 480px) {
          .instagram-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}
