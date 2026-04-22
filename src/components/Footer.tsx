"use client";

export default function Footer() {
  return (
    <footer
      id="contato"
      style={{
        background: "#0a1f14",
        color: "#fff",
        padding: "60px 24px 30px",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 40,
        }}
        className="footer-grid"
      >
        {/* Brand */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #8cc63f, #a8e063)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              🍃
            </div>
            <span
              style={{
                fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              Bibi<span style={{ color: "#8cc63f" }}>Sucos</span>
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.7, maxWidth: 280 }}>
            Há mais de 30 anos levando sabor e saúde com o estilo de vida carioca.
            O melhor da alimentação saudável no Rio de Janeiro.
          </p>
          {/* Social */}
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            {[
              { icon: "📸", label: "Instagram", url: "https://www.instagram.com/bibisucos/" },
              { icon: "📘", label: "Facebook", url: "https://www.facebook.com/bibisucos/" },
              { icon: "💬", label: "WhatsApp", url: "https://wa.me/5521999999999" },
            ].map((social) => (
              <a
                key={social.label}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  textDecoration: "none",
                  transition: "all 0.3s",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Links */}
        <div>
          <h4
            style={{
              fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#8cc63f",
              marginBottom: 20,
            }}
          >
            Navegação
          </h4>
          {["Início", "Sobre", "Cardápio", "Diferenciais", "Unidades"].map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
              style={{
                display: "block",
                color: "rgba(255,255,255,0.6)",
                textDecoration: "none",
                fontSize: 14,
                padding: "6px 0",
                transition: "color 0.3s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#8cc63f")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "rgba(255,255,255,0.6)")
              }
            >
              {link}
            </a>
          ))}
        </div>

        {/* Horários */}
        <div>
          <h4
            style={{
              fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#8cc63f",
              marginBottom: 20,
            }}
          >
            Horários
          </h4>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.8 }}>
            Seg a Sex: 7h – 22h
            <br />
            Sábado: 8h – 22h
            <br />
            Domingo: 8h – 20h
          </p>
        </div>

        {/* Contato */}
        <div>
          <h4
            style={{
              fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#8cc63f",
              marginBottom: 20,
            }}
          >
            Contato
          </h4>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.8 }}>
            📞 (21) 3232-0000
            <br />
            📧 contato@bibisucos.com.br
            <br />
            📍 Rio de Janeiro, RJ
          </p>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          maxWidth: 1100,
          margin: "40px auto 0",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingTop: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          © 2026 Bibi Sucos. Todos os direitos reservados.
        </p>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          Feito com 💚 por FlowFoods
        </p>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
            text-align: center;
          }
          .footer-grid > div > div:first-child {
            justify-content: center;
          }
          .footer-grid > div > div:last-child {
            justify-content: center;
          }
        }
      `}</style>
    </footer>
  );
}
