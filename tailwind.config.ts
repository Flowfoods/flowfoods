import type { Config } from 'tailwindcss';

/**
 * Cor semântica do shell do ERP: lê o token de `src/components/erp/tokens.css`
 * (escopo `.ff-app`, claro/escuro). O valor depois da vírgula é o do tema
 * escuro, para peça do ERP usada fora do shell (o /entrar continua escuro).
 */
const token = (nome: string, escuro: string) => `rgb(var(--ff-${nome}, ${escuro}) / <alpha-value>)`;

/**
 * Cor do site e do Portal do cliente (E5.1, decisão 471): lê `--site-*` de `src/app/globals.css`, claro por padrão e
 * escuro quando o sistema pede, só dentro de `.ff-site`. O valor depois da vírgula é o claro.
 */
const site = (nome: string, claro: string) => `rgb(var(--site-${nome}, ${claro}) / <alpha-value>)`;

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
        // O vermelho por papel (decisão 471, como no ERP): `primary` é o fundo de botão com texto branco (6:1); `realce` é
        // o vermelho de letra pequena (claro #C41522, escuro #F5525A, ≥ 4,5:1; `acento` já é do ERP); `bloco-realce`, o mesmo sobre a faixa
        // escura; `marca` (#EA1D2C) só no filete, na logo e em marcação sem texto.
        primary: site('primary', '196 21 34'),
        'primary-dark': site('primary-dark', '168 17 28'),
        bright: site('primary-dark', '168 17 28'),
        marca: site('marca', '234 29 44'),
        realce: site('realce', '196 21 34'),
        'bloco-realce': site('bloco-realce', '245 82 90'),

        // Semânticas (só no painel privado)
        success: '#16A34A',
        error:   '#DC2626',
        warning: '#D97706',

        // Superfícies — creme e seus tons
        // (no escuro, o fundo vira o quase preto do sistema e o texto vira o creme; o vermelho fica)
        surface: site('surface', '245 240 235'),
        'surface-2': site('surface-2', '237 230 223'),
        'surface-3': site('surface-3', '221 211 200'),
        creme: site('surface', '245 240 235'),
        papel: site('papel', '252 250 248'),

        // Texto — preto e cinzas quentes (ink-5 escureceu: #9A938C sobre o creme dava 2,7:1; agora 4,6:1)
        ink: site('ink', '10 10 10'),
        'ink-2': site('ink-2', '26 26 26'),
        'ink-3': site('ink-3', '61 58 55'),
        'ink-4': site('ink-4', '107 102 97'),
        'ink-5': site('ink-5', '114 108 102'),

        // Faixa de contraste do site (Sinais, Contato): preta no claro; no escuro, um degrau acima do fundo. O texto nela é sempre creme.
        bloco: site('bloco', '10 10 10'),
        'bloco-texto': site('bloco-texto', '245 240 235'),

        // O "preto" do Portal (texto, borda, botão escuro): inverte como o ink.
        footer: site('ink', '10 10 10'),

        // Shell do ERP (/erp e /rodolfo): só tokens, nunca hex na classe. Padrão visual aprovado em 09/11/2026.
        fundo: token('fundo', '24 25 23'),
        lateral: token('lateral', '36 37 33'),
        painel: token('painel', '36 37 33'),
        forte: token('forte', '45 45 41'),
        campo: token('campo', '36 37 33'),
        texto: token('texto', '238 234 224'),
        suave: token('suave', '176 177 166'),
        acao: token('acao', '184 61 51'),
        'acao-hover': token('acao-hover', '166 50 41'),
        // Texto sobre o botão principal (#fffdf8 nos dois temas).
        'sobre-acao': token('sobre-acao', '255 253 248'),
        acento: token('acento', '238 140 126'),
        assinatura: token('marca', '238 140 126'),
        // Superfície de destaque (seleção e o que é do vermelho) e os fundos de sucesso e atenção: sempre com a cor do par.
        destaque: token('destaque', '60 41 38'),
        erro: token('erro', '238 140 126'),
        ok: token('ok', '155 200 170'),
        'ok-fundo': token('ok-fundo', '39 55 44'),
        atencao: token('atencao', '229 187 118'),
        'atencao-fundo': token('atencao-fundo', '57 50 34'),
        // Farol (2.4): cor SÓ no glifo e na palavra do indicador, nunca em borda de card nem em fundo de linha.
        'farol-azul': token('farol-azul', '141 180 220'),
        'farol-verde': token('farol-verde', '74 222 128'),
        'farol-amarelo': token('farol-amarelo', '226 197 90'),
        'farol-laranja': token('farol-laranja', '240 145 58'),
        'farol-vermelho': token('farol-vermelho', '244 101 108'),
        linha: 'var(--ff-linha, #3b3d35)',
        'linha-forte': 'var(--ff-linha-forte, rgb(238 234 224 / 0.2))',
      },
      // Geometria aprovada (tokens em tokens.css): cartão 16, modal 19, popover 13, navegação 12, botão 10, campo 9.
      borderRadius: {
        cartao: 'var(--ff-raio-cartao, 16px)',
        modal: 'var(--ff-raio-modal, 19px)',
        popover: 'var(--ff-raio-popover, 13px)',
        nav: 'var(--ff-raio-nav, 12px)',
        botao: 'var(--ff-raio-botao, 10px)',
        campo: 'var(--ff-raio-campo, 9px)',
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
