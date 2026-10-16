/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1.2 (ficha técnica): a foto vai pela server action do formulário. O
  // servidor confere tipo (pelos bytes) e tamanho (8 MB); o navegador já
  // reduz a foto antes. O padrão do Next (1 MB) recusaria foto de celular.
  experimental: {
    serverActions: { bodySizeLimit: '9mb' },
  },
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
