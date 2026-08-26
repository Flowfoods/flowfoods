import type {
  Servico,
  EtapaProcesso,
  Diferencial,
  ContactInfo,
  OrigemContato,
} from '@/types';

/**
 * Um texto de WhatsApp por origem de clique.
 *
 * Serve para duas coisas: a conversa já começa no assunto certo, e o Rodolfo sabe de qual
 * botão do site a pessoa veio sem precisar perguntar.
 */
export const WHATSAPP_TEXTOS: Record<OrigemContato, string> = {
  hero: 'Olá Rodolfo! Vim pelo site da FlowFoods e quero agendar o diagnóstico gratuito de 30 min.',
  diagnostico:
    'Olá Rodolfo! Vim pelo site da FlowFoods e quero agendar o diagnóstico gratuito de 30 min.',
  consultoria:
    'Olá Rodolfo! Vim pelo site da FlowFoods e quero conversar sobre a Consultoria completa.',
  parceria: 'Olá Rodolfo! Vim pelo site da FlowFoods e quero conversar sobre a Parceria contínua.',
  flutuante: 'Olá Rodolfo! Vim pelo site da FlowFoods e quero saber mais.',
};

export const WHATSAPP_NUMERO = '5521996416060';

export function whatsappUrl(origem: OrigemContato): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_TEXTOS[origem])}`;
}

export const CONTACT_INFO: ContactInfo = {
  whatsapp: WHATSAPP_NUMERO,
  whatsappUrl: whatsappUrl('flutuante'),
  whatsappDisplay: '(21) 99641-6060',
  // `email` fica fora até `contato@consultoriaflowfoods.com.br` existir. Ver
  // sites/flowfoods/docs/PENDENCIAS_RODOLFO.md, item 8.
  instagram: 'rrodolfoac',
  instagramUrl: 'https://instagram.com/rrodolfoac',
  linkedin: 'Rodolfo Cavalcante',
  linkedinUrl: 'https://linkedin.com/in/rodolfo-cavalcante',
};

export const SERVICOS: Servico[] = [
  {
    id: 'estrutura',
    titulo: 'Estrutura de Restaurante',
    descricao:
      'Planejamento de layout, equipamentos, fornecedores e treinamento operacional. Parceria com arquitetos. Do zero até abrir a porta.',
    icone: '',
    beneficios: ['Restaurante pronto para crescer desde o dia 1'],
  },
  {
    id: 'ifood',
    titulo: 'iFood & Delivery',
    descricao:
      'Gestão completa do iFood: da criação da conta e cadastro do cardápio até a operação mensal — precificação, fotos, campanhas, avaliações e relatórios de desempenho.',
    icone: '',
    beneficios: ['Presença profissional no iFood, do zero ao dia a dia'],
  },
  {
    id: 'treinamento',
    titulo: 'Treinamento de Equipe',
    descricao:
      'Capacitação de sala, cozinha, gerência e subgerência. Workshop presencial + mentoria contínua.',
    icone: '',
    beneficios: ['Equipe que VENDE e não erra'],
  },
  {
    id: 'financeiro',
    titulo: 'Gestão Financeira',
    descricao:
      'Estruturação do DRE mensal, controle de CMV, precificação por ficha técnica e análise de margem por produto — para que cada decisão seja tomada com base em números, não em intuição.',
    icone: '',
    beneficios: ['Dados governam. Chega de achismo.'],
  },
  {
    id: 'crm',
    titulo: 'Fidelidade & CRM',
    descricao:
      'Implantação de programa de fidelidade personalizado com captação estruturada de dados: quem é seu cliente, com que frequência compra e qual é o ticket médio. Escuta ativa via NPS e automação de retenção para agir antes de perder o cliente — não depois.',
    icone: '',
    beneficios: ['Menos custo de aquisição. Mais cliente recorrente.'],
  },
  {
    id: 'saas',
    titulo: 'SaaS Personalizado com IA',
    descricao:
      'Desenvolvimento de sistema sob medida para a realidade do seu restaurante — com inteligência artificial integrada onde faz sentido: automação de pedidos, gestão de cardápio, controle financeiro, fidelidade e RH em uma única plataforma. Nada genérico. Tudo pensado para o seu negócio.',
    icone: '',
    beneficios: ['Uma plataforma. Sem mais cacos.'],
  },
];

export const CREDENCIAIS = [
  '✅ Conselheiro do Fórum iFood — ajudou no DESIGN da plataforma (não é usuário comum)',
  '✅ Une tecnologia e operação — sistemas digitais desenvolvidos especificamente para o food service',
  '✅ Treinador de 100+ profissionais (sala, cozinha, gerência)',
  '✅ Estruturou restaurantes com arquitetos parceiros (desde a concepção)',
  '✅ Especialista em CMV, DRE, margem — restaurante não quebra na sua mão',
];

export const PROCESSO: EtapaProcesso[] = [
  {
    numero: '01',
    titulo: 'Diagnóstico',
    descricao:
      'Análise profunda da operação: financeiro, iFood, equipe, processos. Identificamos exatamente onde o dinheiro está saindo.',
  },
  {
    numero: '02',
    titulo: 'Planejamento',
    descricao:
      'Estratégia personalizada com metas claras e prazos definidos. Sem receita genérica — cada restaurante é diferente.',
  },
  {
    numero: '03',
    titulo: 'Implementação',
    descricao:
      'Execução das ações planejadas com acompanhamento próximo, validações em campo e ajustes conforme a realidade do negócio — sem receita pronta, no ritmo certo para cada operação.',
  },
  {
    numero: '04',
    titulo: 'Treinamento',
    descricao:
      'Capacitação de toda a equipe — atendimento, cozinha e liderança — para que os resultados conquistados sejam mantidos e evoluídos sem depender exclusivamente do consultor.',
  },
  {
    numero: '05',
    titulo: 'Acompanhamento',
    descricao:
      'Monitoramento contínuo via WhatsApp e reuniões mensais. Suporte estratégico e melhoria permanente.',
  },
];

export const DIFERENCIAIS: Diferencial[] = [
  {
    icone: '★',
    titulo: '14 Anos de Operação Real',
    descricao:
      'Rodolfo não é consultor que "visita" restaurantes. Ele operou dezenas deles — do chão de cozinha à liderança de redes.',
  },
  {
    icone: '◎',
    titulo: 'Metodologia Comprovada',
    descricao:
      'Processos desenvolvidos em projetos reais, com resultados documentados e replicáveis. Não é teoria — é o que funcionou.',
  },
  {
    icone: '↑',
    titulo: 'Foco em Rentabilidade',
    descricao:
      'Crescimento com saúde financeira — CMV controlado, margem preservada, operação sustentável. Não adianta vender mais e ganhar menos.',
  },
  {
    icone: '∞',
    titulo: 'Parceria, Não Consultoria',
    descricao:
      'Acompanhamento pós-implementação que garante evolução. "Você cresce, a gente cresce junto." — Rodolfo Cavalcante.',
  },
];
