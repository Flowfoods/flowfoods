"use client";

import Image from "next/image";

export default function Hero() {
  return (
    <section
      id="inicio"
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Background Image */}
      <Image
        src="/hero-bg.png"
        alt="Sucos naturais e frutas tropicais"
        fill
        priority
        style={{ objectFit: "cover", objectPosition: "center" }}
        quality={90}
      />

      {/* Dark Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,77,44,0.7) 0%, rgba(0,77,44,0.5) 40%, rgba(0,0,0,0.6) 100%)",
          zIndex: 1,
        }}
      />

      {/* Decorative circles */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(140,198,63,0.15) 0%, transparent 70%)",
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -50,
          left: -50,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(247,148,29,0.1) 0%, transparent 70%)",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          maxWidth: 800,
          padding: "0 24px",
          animation: "fadeInUp 1s ease-out",
        }}
      >
        <span
          style={{
            display: "inline-block",
            background: "rgba(140, 198, 63, 0.2)",
            border: "1px solid rgba(140, 198, 63, 0.4)",
            color: "#a8e063",
            padding: "8px 20px",
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "2px",
            textTransform: "uppercase",
            marginBottom: 24,
            backdropFilter: "blur(10px)",
          }}
        >
          🌴 Verão o Ano Inteiro
        </span>

        <h1
          style={{
            fontFamily: "var(--font-outfit), 'Outfit', sans-serif",
            fontSize: "clamp(40px, 7vw, 80px)",
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.05,
            letterSpacing: "-2px",
            marginBottom: 20,
          }}
        >
          Sabor que vem
          <br />
          da{" "}
          <span
            style={{
              background:
                "linear-gradient(135deg, #8cc63f 0%, #a8e063 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            natureza
          </span>
        </h1>

        <p
          style={{
            color: "rgba(255,255,255,0.8)",
            fontSize: "clamp(16px, 2vw, 20px)",
            lineHeight: 1.6,
            maxWidth: 560,
            margin: "0 auto 40px",
          }}
        >
          Há mais de 30 anos levando o melhor da alimentação saudável
          com o estilo de vida carioca. Sucos naturais, açaí orgânico e
          refeições equilibradas.
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
              background:
                "linear-gradient(135deg, #f7941d 0%, #f26b5e 100%)",
              color: "#fff",
              padding: "16px 36px",
              borderRadius: 9999,
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.5px",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 4px 30px rgba(247, 148, 29, 0.4)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            🛵 Pedir pelo iFood
          </a>
          <a
            href="#cardapio"
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "2px solid rgba(255,255,255,0.3)",
              color: "#fff",
              padding: "16px 36px",
              borderRadius: 9999,
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 600,
              transition: "all 0.3s",
              backdropFilter: "blur(10px)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            📋 Ver Cardápio
          </a>
        </div>
      </div>

      {/* Wave Divider */}
      <div
        style={{
          position: "absolute",
          bottom: -1,
          left: 0,
          width: "100%",
          overflow: "hidden",
          lineHeight: 0,
          zIndex: 3,
        }}
      >
        <svg
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          style={{ width: "100%", height: 80, display: "block" }}
        >
          <path
            d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z"
            fill="#fff"
            opacity="0.8"
          />
          <path
            d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-49.24V0Z"
            fill="#fff"
            opacity="0.5"
          />
          <path
            d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z"
            fill="#fff"
          />
        </svg>
      </div>
    </section>
  );
}
