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
