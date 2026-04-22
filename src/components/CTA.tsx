"use client";

export default function CTA() {
  return (
    <section
      style={{
        padding: "100px 24px",
        background:
          "linear-gradient(135deg, #f7941d 0%, #f26b5e 50%, #e74c3c 100%)",
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}
    >
      {/* Decorative circles */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -40,
          left: -40,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
        }}
      />

      <div
        style={{
          maxWidth: 700,
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 60, display: "block", marginBottom: 20 }}>
          🛵
        </span>
        <h2
          style={{
            fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.1,
            letterSpacing: "-1px",
            marginBottom: 16,
          }}
        >
          Bateu a fome?
        </h2>
        <p
          style={{
            color: "rgba(255,255,255,0.9)",
            fontSize: "clamp(16px, 2vw, 20px)",
            lineHeight: 1.6,
            marginBottom: 40,
            maxWidth: 500,
            margin: "0 auto 40px",
          }}
        >
          Peça agora pelo iFood e receba o melhor da Bibi Sucos no conforto da
          sua casa. Delivery rápido e com a mesma qualidade de sempre!
        </p>

        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="https://www.ifood.com.br"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#fff",
              color: "#f7941d",
              padding: "18px 40px",
              borderRadius: 9999,
              textDecoration: "none",
              fontSize: 17,
              fontWeight: 700,
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Pedir pelo iFood
          </a>
          <a
            href="https://wa.me/5521999999999"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "2px solid rgba(255,255,255,0.4)",
              color: "#fff",
              padding: "18px 40px",
              borderRadius: 9999,
              textDecoration: "none",
              fontSize: 17,
              fontWeight: 600,
              transition: "all 0.3s",
              backdropFilter: "blur(10px)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            💬 WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
