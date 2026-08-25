export default function Sobre() {
  return (
    <section id="sobre" className="bg-white">

      {/* Bloco 1 — Intro */}
      <div className="py-20 md:py-28 px-5 md:px-8 lg:px-12 border-b border-surface-3">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">

          <div>
            <p className="text-xs font-semibold tracking-[0.4em] uppercase text-ink-5 mb-8 flex items-center gap-4">
              <span>SOBRE NÓS</span>
              <span className="flex-1 h-px bg-surface-3" />
            </p>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 bg-primary flex items-center justify-center flex-shrink-0">
                <span className="font-display font-bold text-white text-xl leading-none">FF</span>
              </div>
              <span className="font-display font-bold text-2xl tracking-widest text-ink">FLOWFOODS</span>
            </div>

            <h2 className="font-display font-bold leading-none uppercase">
              <span className="block text-[clamp(2.5rem,7vw,5rem)] text-ink">A CONSULTORIA</span>
              <span className="block text-[clamp(2.5rem,7vw,5rem)] text-primary">QUE OPERA.</span>
            </h2>
          </div>

          <div className="lg:pt-20 space-y-5">
            <p className="text-ink-4 leading-relaxed">
              <strong className="text-ink font-semibold">FlowFoods</strong> é uma consultoria
              gastronômica nascida da experiência real de quem viveu, todos os dias por mais de uma
              década, os desafios do food service brasileiro. Não é uma consultoria que{' '}
              <em>visita</em> restaurantes. É uma consultoria{' '}
              <strong className="text-primary font-semibold">construída por quem operou</strong>{' '}
              dezenas deles, do chão de cozinha à liderança de redes.
            </p>
            <p className="text-ink-4 leading-relaxed">
              Nosso propósito é simples:{' '}
              <strong className="text-ink font-semibold">
                traduzir 14 anos de operação real em sistemas, processos e estratégias
              </strong>{' '}
              que cabem na rotina de qualquer restaurante. Da padronização de cardápio à integração
              com iFood. Do clube de fidelidade às automações com inteligência artificial.
            </p>
            <p className="text-ink-4 leading-relaxed">
              Cada serviço da FlowFoods existe porque já{' '}
              <strong className="text-ink font-semibold">resolveu um problema real</strong>, em uma
              operação real, com resultado mensurável.
            </p>
          </div>
        </div>
      </div>

      {/* Bloco 2 — Empresa + Fundador */}
      <div className="px-5 md:px-8 lg:px-12 border-b border-surface-3">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-px bg-surface-3">

          {/* A Empresa */}
          <div className="bg-white overflow-hidden">
            <div className="relative h-52 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/galeria/foto-2.jpg"
                alt="FlowFoods em campo"
                className="w-full h-full object-cover object-center opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
            </div>
            <div className="p-6 md:p-10 lg:p-14">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 bg-primary/10 border border-primary/25 flex items-center justify-center">
                  <span className="font-display font-bold text-primary text-sm leading-none">FF</span>
                </div>
                <p className="text-xs font-semibold tracking-[0.3em] uppercase text-ink-5">A Empresa</p>
              </div>
              <h3 className="font-display font-bold uppercase leading-none mb-6">
                <span className="block text-[clamp(1.8rem,4vw,2.5rem)] text-ink">QUEM É A</span>
                <span className="block text-[clamp(1.8rem,4vw,2.5rem)] text-primary">FLOWFOODS</span>
              </h3>
              <p className="text-ink-4 text-sm leading-relaxed mb-4">
                Consultoria especializada em food service com sede no{' '}
                <strong className="text-ink">Rio de Janeiro</strong>, atuando em seis frentes:
                estrutura de restaurante, iFood e delivery, treinamento de equipe, gestão
                financeira, fidelidade e CRM, e sistemas com IA.
              </p>
              <p className="text-ink-4 text-sm leading-relaxed">
                Atendemos desde restaurantes independentes até redes com múltiplas unidades — sempre
                com diagnóstico personalizado e implementação prática.
              </p>
            </div>
          </div>

          {/* O Fundador */}
          <div className="bg-white overflow-hidden">
            <div className="relative h-52 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/galeria/foto-1.jpg"
                alt="Rodolfo Cavalcante — Fundador FlowFoods"
                className="w-full h-full object-cover object-top opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
            </div>
            <div className="p-6 md:p-10 lg:p-14">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 bg-primary/10 border border-primary/25 flex items-center justify-center">
                  <span className="font-display font-bold text-primary text-sm leading-none">RC</span>
                </div>
                <p className="text-xs font-semibold tracking-[0.3em] uppercase text-ink-5">O Fundador</p>
              </div>
              <h3 className="font-display font-bold uppercase leading-none mb-6">
                <span className="block text-[clamp(1.8rem,4vw,2.5rem)] text-ink">QUEM É RODOLFO</span>
                <span className="block text-[clamp(1.8rem,4vw,2.5rem)] text-primary">CAVALCANTE</span>
              </h3>
              <p className="text-ink-4 text-sm leading-relaxed mb-4">
                Chef, gestor, consultor e desenvolvedor com{' '}
                <strong className="text-primary">14 anos contínuos</strong> no food service carioca.
                Estruturou dark kitchens, geriu o delivery de 16 lojas da rede Bibi Sucos,
                planejou inaugurações e estruturou clube de fidelidade.
              </p>
              <p className="text-ink-4 text-sm leading-relaxed">
                Membro do <strong className="text-ink">Fórum iFood</strong>, participante em eventos
                nacionais no iFood e professor formador de novos profissionais. Pós-graduado em Gestão de
                Restaurante.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bloco 3 — Tags */}
      <div className="py-16 px-5 md:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            {['Chef', 'Gestor', 'Consultor', 'Desenvolvedor'].map((tag, i, arr) => (
              <span key={tag} className="flex items-center gap-3">
                <span className="text-xs font-semibold tracking-[0.35em] uppercase text-ink-5">{tag}</span>
                {i < arr.length - 1 && <span className="text-surface-3">·</span>}
              </span>
            ))}
          </div>
          <p className="text-ink-4 text-lg md:text-xl leading-relaxed max-w-3xl font-sans">
            Chef de formação, gestor do delivery de 16 lojas, conselheiro do Fórum iFood e
            desenvolvedor dos próprios sistemas.{' '}
            <strong className="text-ink">
              Não é só gestor. Não é só técnico. Não é só estrategista.
            </strong>{' '}
            Com <strong className="text-primary">14 anos de trajetória contínua</strong>, passou
            pelo chão de cozinha, pela liderança de redes e pelo palco do iFood.
          </p>
        </div>
      </div>

    </section>
  );
}
