import type { Config } from 'tailwindcss';

/**
 * Cor semântica do shell do ERP: lê o token de `src/components/erp/tokens.css`
 * (escopo `.ff-app`, claro/escuro). O valor depois da vírgula é o do tema
 * escuro, para peça do ERP usada fora do shell (o /entrar continua escuro).
 */
const token = (nome: string, escuro: string) => `rgb(var(--ff-${nome}, ${escuro}) / <alpha-value>)`;

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Identidade FlowFoods: creme, preto e o vermelho como único acento.
        primary: '#EA1D2C',
        bright:  '#F2323F',
        'primary-dark': '#C41522',
        marca: '#EA1D2C',

        // Semânticas (só no painel privado)
        success: '#16A34A',
        error:   '#DC2626',
        warning: '#D97706',

        // Superfícies — creme e seus tons
        surface:   '#F5F0EB',
        'surface-2': '#EDE6DF',
        'surface-3': '#DDD3C8',
        creme: '#F5F0EB',
        papel: '#FCFAF8',

        // Texto — preto e cinzas quentes
        ink:   '#0A0A0A',
        'ink-2': '#1A1A1A',
        'ink-3': '#3D3A37',
        'ink-4': '#6B6661',
        'ink-5': '#9A938C',

        // Rodapé e painel privado
        footer: '#0A0A0A',

        // Shell do ERP (/erp e /rodolfo): só tokens, nunca hex na classe.
        fundo: token('fundo', '14 13 12'),
        lateral: token('lateral', '10 10 10'),
        painel: token('painel', '22 21 19'),
        forte: token('forte', '31 29 27'),
        campo: token('campo', '9 9 8'),
        texto: token('texto', '245 240 235'),
        suave: token('suave', '163 156 149'),
        acao: token('acao', '196 21 34'),
        'acao-hover': token('acao-hover', '214 26 39'),
        acento: token('acento', '234 29 44'),
        assinatura: token('marca', '242 50 63'),
        erro: token('erro', '245 66 77'),
        ok: token('ok', '74 222 128'),
        atencao: token('atencao', '245 158 11'),
        // Farol (2.4): cor SÓ no glifo e na palavra do indicador, nunca em borda de card nem em fundo de linha.
        'farol-azul': token('farol-azul', '141 180 220'),
        'farol-verde': token('farol-verde', '74 222 128'),
        'farol-amarelo': token('farol-amarelo', '226 197 90'),
        'farol-laranja': token('farol-laranja', '240 145 58'),
        'farol-vermelho': token('farol-vermelho', '245 66 77'),
        linha: 'var(--ff-linha, rgb(245 240 235 / 0.09))',
        'linha-forte': 'var(--ff-linha-forte, rgb(245 240 235 / 0.18))',
      },
      fontFamily: {
        // Títulos em Gelasio, texto em Libre Franklin — o site inteiro e o portal.
        sans:    ['var(--font-franklin)', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['var(--font-gelasio)',  'Georgia', 'serif'],
        serifa:  ['var(--font-gelasio)',  'Georgia', 'serif'],
        franklin: ['var(--font-franklin)', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
