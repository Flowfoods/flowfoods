import ModalTriggerButton from '@/components/ModalTriggerButton';
import type { OrigemContato } from '@/types';

const PACOTES: {
  id: string;
  numero: string;
  titulo: string;
  subtitulo: string;
  descricao: string;
  inclui: string[];
  destaque: boolean;
  preco: string;
  cta: string;
  origem: OrigemContato;
}[] = [
  {
    id: 'diagnostico',
    numero: '01',
    titulo: 'Diagnóstico Gratuito',
    subtitulo: 'O primeiro passo',
    descricao:
      'Uma conversa de 30 minutos, online. Antes dela, eu analiso a sua loja no iFood. Depois dela, você recebe por escrito as 3 prioridades do seu negócio — mesmo que não contrate nada.',
    inclui: [
      'Análise prévia da sua loja no iFood',
      'Conversa de 30 min, online',
      '3 prioridades por escrito, no WhatsApp',
      'Sem compromisso',
    ],
    destaque: false,
    preco: 'Gratuito',
    cta: 'Agendar diagnóstico gratuito',
    origem: 'diagnostico',
  },
  {
    id: 'consultoria',
    numero: '02',
    titulo: 'Consultoria',
    subtitulo: 'Transformação completa',
    descricao:
      'O pacote completo para restaurantes que querem crescer de forma estruturada. Cada etapa é adaptada à realidade do seu negócio — sem prazo engessado, no ritmo que faz sentido para a sua operação.',
    inclui: [
      'Diagnóstico completo presencial (visita técnica, DRE/CMV, iFood, relatório + plano de ação em PDF)',
      'Otimização iFood e delivery',
      'Treinamento de equipe',
      'Gestão financeira + CMV',
      'Acompanhamento contínuo',
      'Suporte por WhatsApp',
    ],
    destaque: true,
    preco: 'Sob consulta',
    cta: 'Quero a Consultoria',
    origem: 'consultoria',
  },
  {
    id: 'parceria',
    numero: '03',
    titulo: 'Parceria',
    subtitulo: 'Crescimento contínuo',
    descricao:
      'Para quem quer ir além. Gestão estratégica contínua com SaaS personalizado, CRM, automações e reuniões mensais de performance.',
    inclui: [
      'Tudo da Consultoria',
      'SaaS personalizado com IA',
      'Programa de fidelidade (CRM)',
      'Automação WhatsApp + n8n',
      'Reuniões mensais de performance',
      'Expansão e escala de unidades',
    ],
    destaque: false,
    preco: 'Sob consulta',
    cta: 'Falar sobre Parceria',
    origem: 'parceria',
  },
];

export default function Investimento() {
  return (
    <section id="investimento" className="bg-surface py-20 md:py-28 px-5 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto">

        <div className="mb-16 md:mb-20" data-reveal>
          <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-4">Investimento</p>
          <h2 className="font-display leading-none mb-6">
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink uppercase">QUANTO</span>
            <span className="block text-[clamp(2.5rem,8vw,5rem)] text-ink-5 uppercase">CUSTA?</span>
          </h2>
          <p className="text-ink-4 text-base max-w-xl leading-relaxed">
            Cada restaurante é diferente. O diagnóstico gratuito define o escopo certo e o investimento exato para o seu negócio.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PACOTES.map((p, i) => (
            <div
              key={p.id}
              data-reveal
              data-delay={String(i + 1)}
              className={`flex flex-col border transition-all duration-300 group ${
                p.destaque
                  ? 'border-primary bg-white shadow-[0_8px_32px_rgba(249,115,22,0.12)]'
                  : 'border-surface-3 bg-white hover:border-primary/40'
              }`}
            >
              {p.destaque && (
                <div className="bg-primary px-6 py-2">
                  <p className="text-white text-[10px] font-semibold uppercase tracking-[0.3em]">Mais escolhido</p>
                </div>
              )}

              <div className="p-6 md:p-8 flex flex-col flex-1">
                <div className="mb-6">
                  <span className="font-display text-[10px] text-ink-5 tracking-widest uppercase">{p.numero}</span>
                  <h3 className={`font-display text-2xl md:text-3xl uppercase leading-tight mt-1 ${p.destaque ? 'text-primary' : 'text-ink'}`}>
                    {p.titulo}
                  </h3>
                  <p className="text-ink-5 text-xs uppercase tracking-wider mt-1">{p.subtitulo}</p>
                </div>

                <p className="text-ink-4 text-sm leading-relaxed mb-6">{p.descricao}</p>

                <div className="mb-8 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-5 mb-3">Inclui</p>
                  <ul className="space-y-2">
                    {p.inclui.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-ink-4">
                        <span className="flex-shrink-0 text-primary font-bold mt-0.5">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-surface-3 pt-6">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-5 mb-3">Investimento</p>
                  <p className="font-display text-xl text-ink uppercase mb-4">{p.preco}</p>
                  <ModalTriggerButton
                    origem={p.origem}
                    className={`w-full py-3.5 text-xs font-semibold uppercase tracking-widest transition-all duration-200 active:scale-[0.98] ${
                      p.destaque
                        ? 'bg-primary hover:bg-primary-dark text-white'
                        : 'border border-surface-3 hover:border-primary text-ink-4 hover:text-primary'
                    }`}
                  >
                    {p.cta}
                  </ModalTriggerButton>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Convite ao primeiro passo — sem escassez inventada. */}
        <div
          data-reveal
          className="border border-primary/20 bg-primary/5 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div>
            <p className="font-display italic text-ink text-base md:text-lg">
              Comece pelo <strong>diagnóstico gratuito</strong>. Se não fizer sentido seguir, você
              fica com as 3 prioridades do mesmo jeito.
            </p>
            <p className="text-ink-5 text-sm mt-1">
              Diagnóstico gratuito · 30 min online · Sem compromisso
            </p>
          </div>
          <ModalTriggerButton
            origem="diagnostico"
            className="flex-shrink-0 bg-primary hover:bg-primary-dark text-white font-semibold text-xs px-7 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
          >
            Agendar diagnóstico gratuito
          </ModalTriggerButton>
        </div>

      </div>
    </section>
  );
}
