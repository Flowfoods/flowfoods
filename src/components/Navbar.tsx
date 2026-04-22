"use client";

import { useState, useEffect } from "react";

const navLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Sobre", href: "#sobre" },
  { label: "Cardápio", href: "#cardapio" },
  { label: "Diferenciais", href: "#diferenciais" },
  { label: "Unidades", href: "#unidades" },
  { label: "Contato", href: "#contato" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      id="navbar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: scrolled ? "12px 0" : "20px 0",
        background: scrolled
          ? "rgba(0, 77, 44, 0.95)"
          : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled
          ? "1px solid rgba(140, 198, 63, 0.2)"
          : "none",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <nav
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <a
          href="#inicio"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #8cc63f 0%, #a8e063 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            🍃
          </div>
          <span
            style={{
              fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.5px",
            }}
          >
            Bibi<span style={{ color: "#8cc63f" }}>Sucos</span>
          </span>
        </a>

        {/* Desktop Links */}
        <ul
          style={{
            display: "flex",
            gap: 32,
            listStyle: "none",
            alignItems: "center",
          }}
          className="nav-desktop"
        >
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                style={{
                  color: "rgba(255,255,255,0.85)",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  transition: "color 0.3s",
                  position: "relative",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "#8cc63f")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "rgba(255,255,255,0.85)")
                }
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA Button */}
        <a
          href="https://www.ifood.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-cta"
          style={{
            background: "linear-gradient(135deg, #f7941d 0%, #f26b5e 100%)",
            color: "#fff",
            padding: "12px 28px",
            borderRadius: 9999,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 4px 20px rgba(247, 148, 29, 0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 8px 30px rgba(247, 148, 29, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 4px 20px rgba(247, 148, 29, 0.3)";
          }}
        >
          🛵 Peça Agora
        </a>

        {/* Mobile hamburger */}
        <button
          className="nav-mobile-btn"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
          style={{
            display: "none",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 8,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span
              style={{
                width: 24,
                height: 2,
                background: "#fff",
                borderRadius: 2,
                transition: "all 0.3s",
                transform: mobileOpen ? "rotate(45deg) translateY(7px)" : "none",
              }}
            />
            <span
              style={{
                width: 24,
                height: 2,
                background: "#fff",
                borderRadius: 2,
                transition: "all 0.3s",
                opacity: mobileOpen ? 0 : 1,
              }}
            />
            <span
              style={{
                width: 24,
                height: 2,
                background: "#fff",
                borderRadius: 2,
                transition: "all 0.3s",
                transform: mobileOpen
                  ? "rotate(-45deg) translateY(-7px)"
                  : "none",
              }}
            />
          </div>
        </button>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          className="nav-mobile-menu"
          style={{
            background: "rgba(0, 77, 44, 0.98)",
            backdropFilter: "blur(20px)",
            padding: "24px",
          }}
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: "block",
                padding: "14px 0",
                color: "#fff",
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 500,
                borderBottom: "1px solid rgba(140, 198, 63, 0.15)",
              }}
            >
              {link.label}
            </a>
          ))}
          <a
            href="https://www.ifood.com.br"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              marginTop: 16,
              textAlign: "center",
              background: "linear-gradient(135deg, #f7941d 0%, #f26b5e 100%)",
              color: "#fff",
              padding: "14px",
              borderRadius: 9999,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            🛵 Peça Agora
          </a>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-cta { display: none !important; }
          .nav-mobile-btn { display: block !important; }
        }
      `}</style>
    </header>
  );
}
