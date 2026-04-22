import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bibi Sucos | Alimentação Saudável • Sucos Naturais • Açaí Orgânico",
  description:
    "Há mais de 30 anos levando o melhor da alimentação saudável com o estilo de vida carioca. Sucos naturais, açaí orgânico, refeições equilibradas e delivery rápido no Rio de Janeiro.",
  keywords: [
    "Bibi Sucos",
    "sucos naturais",
    "açaí orgânico",
    "alimentação saudável",
    "delivery Rio de Janeiro",
    "restaurante saudável",
  ],
  openGraph: {
    title: "Bibi Sucos | Sabor que vem da Natureza",
    description:
      "Sucos naturais, açaí orgânico e refeições saudáveis. Delivery rápido no Rio de Janeiro.",
    type: "website",
    locale: "pt_BR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${outfit.variable} antialiased`}
      style={{ scrollBehavior: "smooth" }}
    >
      <body
        style={{
          fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
          margin: 0,
          padding: 0,
        }}
      >
        {children}
      </body>
    </html>
  );
}
