import type { Servico, CaseStudy, EtapaProcesso, Diferencial, ContactInfo } from '@/types';

export const CONTACT_INFO: ContactInfo = {
  whatsapp: '5521996416060',
  whatsappUrl:
    'https://wa.me/5521996416060?text=Ol%C3%A1!%20Vi%20o%20site%20da%20FlowFoods%20e%20gostaria%20de%20saber%20mais%20sobre%20a%20consultoria.',
  whatsappDisplay: '(21) 99641-6060',
  email: 'rrodolfoacifood@gmail.com',
  // Confirmado pelo Rodolfo em 25/08/2026. É o mesmo perfil que vai em TODA
  // mensagem de abordagem do Barney (fonte: `ledsflowfoods/references/mensagens.md`):
  // se o site e a abordagem divergirem, o dono do restaurante que for conferir
  // quem é o Rodolfo cai num beco sem saída.
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
  '✅ Treinador de 100+ pessoas (sala, cozinha, gerência) — resultado comprovável',
  '✅ Estruturou restaurantes com arquitetos parceiros (desde a concepção)',
  '✅ Especialista em CMV, DRE, margem — restaurante não quebra na sua mão',
];

export const CASES: CaseStudy[] = [
  {
    id: 'bibi-sucos',
    nome: 'Bibi Sucos',
    descricao:
      'Rede de Suco & Açaí — transformação operacional completa com expansão para delivery e implementação do Clube Bibi.',
    desafios:
      'Operação manual, inconsistência de processos, falta de padronização e baixa presença em plataformas de delivery.',
    resultados: [
      '3 unidades ativas com operação sistêmica',
      'iFood integrado 24/7 com +45% receita em 6 meses',
      'SaaS próprio em produção',
      'Clube Bibi — programa de fidelidade ativo',
      'Fichas técnicas e controle de CMV',
      'Treinamento com padronização completa',
    ],
    impacto:
      'De 1 loja caótica para 3 lojas sistêmicas. iFood integrado, fidelidade automatizada, gestão de custos no controle.',
  },
  {
    id: 'balada-mix',
    nome: 'Balada Mix',
    descricao:
      'Hamburgueria Premium — automação completa de delivery e estruturação de marca desde a concepção.',
    desafios:
      'Gerente respondendo pedidos manualmente 15h/dia, marca nova sem posicionamento, cardápio indefinido.',
    resultados: [
      'Automação WhatsApp 100% — n8n responde automaticamente',
      'Tempo de resposta: 5 min (era 45 min)',
      'Ticket médio +R$ 80 após menu otimizado',
      'Taxa de repetição: 40%',
      'Desenvolvimento completo de marca e identidade',
      'Processo de trabalho padronizado',
    ],
    impacto:
      'Gerente supervisiona ao invés de executar. Menos erro, mais tempo livre, ticket médio maior.',
  },
  {
    id: 'casa-severina',
    nome: 'Casa da Severina',
    descricao:
      'Comida Caseira Nordestina — estruturação de cozinha, treinamento e cardápio em 60 dias.',
    desafios:
      'Severina fazia tudo sozinha, equipe sem estrutura, sem cardápio documentado, operação dependente de uma pessoa.',
    resultados: [
      'Estrutura de cozinha planejada e implementada',
      'Cardápio visual com descrições culturais',
      'Treinamento de gerente em 60 dias',
      'Receitas documentadas (padrão garantido)',
      'Equipe operando sem Severina presente',
      'Presença em plataformas de delivery',
    ],
    impacto:
      'Severina agora viaja 1x/mês. O restaurante funciona sem ela presente — foi a primeira vez em 8 anos.',
  },
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
