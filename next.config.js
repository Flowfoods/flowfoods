/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server actions no limite padrão do Next (1 MB). A foto da ficha técnica
  // (até 8 MB) vai pela rota própria `/erp/fichas/fotos`, que confere a
  // sessão ANTES de ler o corpo (1.3; antes era um limite global de 9 MB).
  // 1.1 (shell): as abas do parceiro no nível 1 ganharam os nomes do /erp.
  // Favorito antigo continua chegando.
  async redirects() {
    return [
      { source: '/rodolfo/erp/:slug/estrutura', destination: '/rodolfo/erp/:slug/lojas', permanent: false },
      { source: '/rodolfo/erp/:slug/acessos', destination: '/rodolfo/erp/:slug/equipe', permanent: false },
    ];
  },
};

module.exports = nextConfig;
