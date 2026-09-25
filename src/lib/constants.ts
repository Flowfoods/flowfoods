import type { Servico, EtapaProcesso, ContactInfo, OrigemContato } from '@/types';

/**
 * Conteúdo do site institucional.
 *
 * Tudo aqui vem do briefing do Rodolfo (CLAUDE.md): frentes, método, formato e
 * credenciais. Números só os comprováveis. Nada de promessa de resultado.
 */

/**
 * Um texto de WhatsApp por origem de clique.
 *
 * A conversa já começa no assunto certo, e o Rodolfo sabe de qual botão a
 * pessoa veio sem precisar perguntar.
 */
export const WHATSAPP_TEXTOS: Record<OrigemContato, string> = {
  hero: 'Olá Rodolfo! Vim pelo site da FlowFoods e quero conversar sobre o meu restaurante.',
  diagnostico: 'Olá Rodolfo! Vim pelo site da FlowFoods e quero conversar sobre o meu restaurante.',
  consultoria: 'Olá Rodolfo! Vim pelo site da FlowFoods e quero conversar sobre a consultoria.',
  parceria: 'Olá Rodolfo! Vim pelo site da FlowFoods e quero conversar sobre a consultoria.',
  flutuante: 'Olá Rodolfo! Vim pelo site da FlowFoods e quero saber mais.',
};

export const WHATSAPP_NUMERO = '5521996416060';

export function whatsappUrl(origem: OrigemContato): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_TEXTOS[origem])}`;
}

export const TAGLINE = 'Gastronomia que flui. Negócio que cresce.';

export const CONTACT_INFO: ContactInfo = {
  whatsapp: WHATSAPP_NUMERO,
  whatsappUrl: whatsappUrl('flutuante'),
  whatsappDisplay: '(21) 99641-6060',
  // `email` fica fora até `contato@consultoriaflowfoods.com.br` existir. Ver
  // docs/PENDENCIAS_RODOLFO.md, item 8.
  instagram: 'rrodolfoac',
  instagramUrl: 'https://instagram.com/rrodolfoac',
  linkedin: 'Rodolfo Cavalcante',
  linkedinUrl: 'https://linkedin.com/in/rodolfo-cavalcante',
};

/** As seis frentes, na ordem do briefing. */
export const SERVICOS: Servico[] = [
  {
    id: 'estrutura',
    titulo: 'Estrutura de restaurante',
    descricao:
      'Layout, fluxo de cozinha, equipamentos e fornecedores. Para quem vai abrir e para quem precisa arrumar a casa que já existe.',
    icone: '',
    beneficios: ['Operação que aguenta o pico'],
  },
  {
    id: 'ifood',
    titulo: 'iFood e delivery',
    descricao:
      'Cardápio, precificação, campanhas, avaliações e leitura dos relatórios. O canal próprio ao lado do iFood, sem depender de um só.',
    icone: '',
    beneficios: ['Delivery que dá margem, não só volume'],
  },
  {
    id: 'treinamento',
    titulo: 'Treinamento de equipes',
    descricao:
      'Salão, cozinha e liderança treinados no padrão da casa, com roteiro, checklist e acompanhamento. O padrão se mantém quando o dono não está.',
    icone: '',
    beneficios: ['Equipe que sustenta o padrão'],
  },
  {
    id: 'financeiro',
    titulo: 'Gestão financeira',
    descricao:
      'DRE mensal, CMV, ficha técnica e margem por produto. Decisão com número na mesa, não com sensação.',
    icone: '',
    beneficios: ['Dado antes de opinião'],
  },
  {
    id: 'crm',
    titulo: 'Fidelidade e CRM',
    descricao:
      'Programa de fidelidade com cadastro de verdade: quem compra, com que frequência, quanto gasta. Retenção antes de perder o cliente.',
    icone: '',
    beneficios: ['Cliente que volta custa menos'],
  },
  {
    id: 'saas',
    titulo: 'Sistemas com IA',
    descricao:
      'Automação de rotinas do restaurante onde faz sentido: pedidos, cardápio, financeiro e fidelidade conversando entre si.',
    icone: '',
    beneficios: ['Menos planilha solta, mais rotina'],
  },
];

/** O ciclo de trabalho. Não é linha reta: o acompanhamento reabre o diagnóstico. */
export const PROCESSO: EtapaProcesso[] = [
  {
    numero: '01',
    titulo: 'Diagnóstico',
    descricao:
      'Leitura da operação, dos números, do cardápio, dos canais, da cozinha e do que os sócios dizem. Duas semanas no início e a cada novo ciclo.',
  },
  {
    numero: '02',
    titulo: 'Plano de ação',
    descricao:
      'Prioridades, responsáveis e prazos definidos junto com os sócios. Os temas andam na ordem do que mais pesa para a marca.',
  },
  {
    numero: '03',
    titulo: 'Execução e treinamento',
    descricao:
      'Implementação junto com a equipe, dentro da rotina da casa. O consultor conduz e ensina; a casa executa e mantém.',
  },
  {
    numero: '04',
    titulo: 'Acompanhamento',
    descricao: 'Reunião mensal com relatório do que andou, do que travou e do que vem. E o ciclo recomeça.',
  },
];

/** Regras da casa, ditas em voz alta. */
export const PRINCIPIOS = [
  {
    titulo: 'Dado antes de opinião',
    texto: 'Sem número, é hipótese, e é apresentada como hipótese. "Não tenho" e "não sei" viram item do plano.',
  },
  {
    titulo: 'Nada é aplicado sem estar combinado',
    texto: 'Cada ação tem responsável, prazo e forma de medir. O que a operação não absorve não entra no plano.',
  },
  {
    titulo: 'Resultado é trabalho conjunto',
    texto: 'Ninguém promete faturamento. O consultor conduz e ensina; a casa executa e mantém.',
  },
];

/** Como a consultoria funciona no dia a dia. */
export const FORMATO = {
  itens: [
    { rotulo: 'Ritmo', valor: 'Ciclo contínuo, sem pacote fechado' },
    { rotulo: 'Presença', valor: '2 visitas presenciais por mês' },
    { rotulo: 'Prestação de contas', valor: '1 reunião mensal com relatório' },
    { rotulo: 'Compromisso', valor: 'Mínimo de 3 meses, aviso prévio de 15 dias' },
    { rotulo: 'Investimento', valor: 'Definido depois do diagnóstico inicial, por grupo' },
  ],
  foraDoEscopo: [
    'Gestão de Instagram e redes sociais',
    'Criação de sistemas e ferramentas de IA',
    'Contratação de terceiros: foto, vídeo, impressão e software',
  ],
};

/** Credenciais verificáveis do Rodolfo. */
export const CREDENCIAIS = [
  'Chef formado pela UNISUAM',
  'Pós-graduado em Gestão de Restaurantes pela Estácio',
  '8 anos na Balada Mix',
  'Instrutor no Instituto Gourmet',
  'Gestor de delivery, fidelidade e IA numa rede carioca de 16 lojas e 5 marcas',
  'Conselheiro do Fórum de Restaurantes do iFood',
];

/** Perguntas que costumam trazer um dono até aqui. */
export const SINAIS = [
  'A venda caiu contra o ano passado e ninguém sabe dizer exatamente por quê.',
  'O iFood virou o único canal, e a margem foi embora na taxa.',
  'O padrão só se mantém quando o sócio está no salão.',
  'Tem faturamento, mas não tem DRE. Tem cliente, mas não tem cadastro.',
];
