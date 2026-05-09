import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary — Vermelho FlowFoods (premium, gastronomia, autoridade)
        primary: '#b91c1c',
        bright:  '#dc2626',
        'primary-dark': '#991b1b',

        // Secondary — Azul Confiança (expertise, profissionalismo)
        secondary: '#1E40AF',
        'secondary-dark': '#1e3a8a',

        // Semânticas
        success: '#16A34A',
        error:   '#DC2626',
        warning: '#D97706',

        // Superfícies — Warm Stone (premium, não corporativo frio)
        surface:   '#FAFAF9',
        'surface-2': '#F5F5F4',
        'surface-3': '#E7E5E4',

        // Texto — Warm Stone escuro
        ink:   '#1C1917',
        'ink-2': '#292524',
        'ink-3': '#44403C',
        'ink-4': '#78716C',
        'ink-5': '#A8A29E',

        // Rodapé escuro (contraste final)
        footer: '#0A0A0A',
      },
      fontFamily: {
        sans:    ['var(--font-sans)',    'Helvetica Neue', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia',        'serif'],
      },
      animation: {
        'scroll-left':  'scroll-left  40s linear infinite',
        'scroll-right': 'scroll-right 35s linear infinite',
      },
      keyframes: {
        'scroll-left': {
          from: { transform: 'translateX(0)' },
          to:   { transform: 'translateX(-50%)' },
        },
        'scroll-right': {
          from: { transform: 'translateX(-50%)' },
          to:   { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
