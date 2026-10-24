'use client';

/**
 * Ajuda contextual no shell (0.6): a ajuda da tela, o botão "?" e a gaveta.
 * Desde 24/10/2026 a explicação da tela abre no card flutuante (ver
 * `pontos.tsx`); aqui fica a linha que o abre e o caminho sem JavaScript.
 *
 * A caixa é desenhada JUNTO com a página, no HTML do servidor, com a
 * preferência que o layout leu com a sessão: quem fechou ou desligou nunca vê a
 * caixa piscar. Os dois botões dela são formulários de verdade (server action):
 * sem JavaScript a linha abre o texto ali mesmo e o "Não mostrar novamente" funciona (a
 * página recarrega sem ela). Com JavaScript, ela some na hora (otimista).
 *
 * A pergunta da 1ª vez ("manter ou desligar") mora DENTRO da primeira caixa,
 * sem modal: quem está contando de luva não pode ser travado. Sem resposta,
 * as dicas ficam ligadas.
 */

import Link from 'next/link';
import { useEffect, useId, useRef, type FormEvent } from 'react';
import { itemFechado, PONTO_DA_TELA, type EntradaParaATela, type PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import { usePontos } from './pontos';
import { Dialogo } from '../ui/Dialogo';
import { classeDeBotao, LINK_DE_TEXTO } from '../ui/estilos';
import { Selo } from '../ui/superficies';
import type { AjudaDoShell } from './tipos';

/** Mudança otimista: vale só enquanto a preferência do servidor for a mesma da hora do clique. */
export interface Otimista {
  assinatura: string;
  fechadas: string[];
  dicasLigadas?: boolean;
  escolhida?: boolean;
}

export function assinaturaDaPreferencia(p: PreferenciaDeAjuda | null): string {
  return p ? `${p.dicasLigadas ? 1 : 0}${p.escolhida ? 1 : 0}|${p.fechadas.join(',')}` : '';
}

export function preferenciaEfetiva(base: PreferenciaDeAjuda | null, o: Otimista | null): PreferenciaDeAjuda | null {
  if (!base) return null;
  if (!o || o.assinatura !== assinaturaDaPreferencia(base)) return base;
  return {
    dicasLigadas: o.dicasLigadas ?? base.dicasLigadas,
    escolhida: o.escolhida ?? base.escolhida,
    fechadas: [...base.fechadas, ...o.fechadas],
    pontos: base.pontos,
  };
}

/** A pergunta da 1ª vez ("manter ou desligar"), dentro do card da tela: sem modal, quem está de luva não é travado. */
export function PerguntaDasDicas({
  acoes,
  aoEscolher,
}: {
  acoes: NonNullable<AjudaDoShell['acoes']>;
  aoEscolher: (valor: 'manter' | 'desligar') => void;
}) {
  function aoEnviarEscolha(e: FormEvent<HTMLFormElement>) {
    const quem = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    if (quem === 'manter' || quem === 'desligar') aoEscolher(quem);
  }
  return (
    <form action={acoes.dicas} onSubmit={aoEnviarEscolha} className="mt-4 border-t border-linha pt-3">
      <p className="text-[14px] font-medium text-texto">Quer as dicas de como usar cada tela?</p>
      <p className="mt-0.5 text-[13px] text-suave">
        Dá para mudar depois em{' '}
        <Link href="/erp/acesso" className={LINK_DE_TEXTO}>
          Seu acesso
        </Link>
        .
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" name="dicas" value="manter" className={classeDeBotao('primario')}>
          Manter as dicas
        </button>
        <button type="submit" name="dicas" value="desligar" className={classeDeBotao('secundario')}>
          Desligar
        </button>
      </div>
    </form>
  );
}

/**
 * Ajuda da TELA (reorganização de 24/10/2026): no lugar da caixa fixa de texto
 * embaixo do título, uma linha discreta "Como funciona esta tela". Com
 * JavaScript, ela abre o card flutuante (o ponto `tela`, com a regra de 1ª
 * visita e 7 dias); sem JavaScript, é um <details> que abre ali mesmo, com os
 * mesmos formulários — nada deixa de funcionar.
 *
 * `estado` nulo = a pessoa fechou esta versão, desligou as dicas ou é o
 * nível 1: a linha continua (a ajuda manual vale sempre), sem abrir sozinha
 * e sem "Não mostrar novamente".
 */
export function CaixaDeAula({
  entrada,
  estado,
  acoes,
  aoFechar,
  aoEscolher,
}: {
  entrada: EntradaParaATela;
  estado: { mudou: boolean; perguntar: boolean } | null;
  acoes: AjudaDoShell['acoes'];
  aoFechar: (caixa: string) => void;
  aoEscolher: (valor: 'manter' | 'desligar') => void;
}) {
  const id = useId();
  const caixa = itemFechado(entrada);
  const { tem, abrir, registrar, ativo, chave } = usePontos();
  const resumo = useRef<HTMLElement>(null);
  const comCard = tem(PONTO_DA_TELA);
  useEffect(() => {
    if (!comCard || !resumo.current) return;
    return registrar(PONTO_DA_TELA, resumo.current);
  }, [comCard, registrar]);
  const aberto = ativo === `${chave}.${PONTO_DA_TELA}`;

  return (
    <section
      aria-labelledby={id}
      data-ajuda-tela={entrada.chave}
      {...(estado ? { 'data-ajuda-caixa': entrada.chave } : {})}
      className="group/aula"
    >
      <details className="group">
        <summary
          ref={resumo}
          data-ponto={PONTO_DA_TELA}
          aria-haspopup={comCard ? 'dialog' : undefined}
          aria-expanded={comCard ? aberto : undefined}
          onClick={(e) => {
            if (!comCard) return;
            e.preventDefault();
            abrir(PONTO_DA_TELA, e.currentTarget);
          }}
          className="ff-transicao inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[5px] text-[13px] font-medium text-suave hover:text-texto sm:min-h-8 [&::-webkit-details-marker]:hidden"
        >
          <span
            aria-hidden
            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold leading-none ${aberto ? 'border-texto bg-texto text-fundo' : 'border-current'}`}
          >
            ?
          </span>
          <h2 id={id} className="text-[13px] font-medium underline decoration-linha-forte underline-offset-4">
            Como funciona esta tela<span className="sr-only">{` · ${entrada.titulo}`}</span>
          </h2>
          {estado?.mudou && (
            <Selo tom="alerta">
              Mudou<span className="sr-only"> desde a última vez que você leu</span>
            </Selo>
          )}
        </summary>
        {/* Sem JavaScript: o texto abre aqui mesmo. Com JavaScript, quem abre é o card. */}
        <div className="mt-2 rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
          <div className="max-w-prose space-y-1.5 text-[14px] leading-relaxed text-suave">
            {entrada.aula.map((t, n) => (
              <p key={n}>{t}</p>
            ))}
          </div>
          {estado?.perguntar && acoes && <PerguntaDasDicas acoes={acoes} aoEscolher={aoEscolher} />}
          {estado && acoes && (
            <form action={acoes.fechar} onSubmit={() => aoFechar(caixa)} className="mt-4">
              <input type="hidden" name="caixa" value={caixa} />
              <button type="submit" className={classeDeBotao('fantasma')}>
                Não mostrar novamente
              </button>
            </form>
          )}
        </div>
      </details>
    </section>
  );
}

export function GavetaDeAjuda({
  aberta,
  aoFechar,
  entrada,
  secao,
  outras,
  preferencia,
  acoes,
  contato,
  voltarPara,
  aoReligar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  entrada: EntradaParaATela;
  secao: string | null;
  outras: { area: string; telas: { href: string; rotulo: string }[] } | null;
  preferencia: PreferenciaDeAjuda | null;
  acoes: AjudaDoShell['acoes'];
  contato: AjudaDoShell['contato'];
  voltarPara: React.RefObject<HTMLElement | null>;
  aoReligar: () => void;
}) {
  // Rola até a seção pedida (o link "Como a conta é feita") e a destaca.
  useEffect(() => {
    if (!aberta || !secao) return;
    const el = document.getElementById(`ajuda-${secao}`);
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [aberta, secao]);

  return (
    <Dialogo
      id="ff-ajuda"
      aberto={aberta}
      aoFechar={aoFechar}
      titulo={entrada.titulo}
      gaveta
      lado="direita"
      sheet
      className="ff-veu-de-ajuda"
      focoNoTitulo
      voltarPara={voltarPara}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-suave">Ajuda desta tela</p>

        <div className="max-w-prose space-y-2 text-[14px] leading-relaxed text-texto">
          {entrada.aula.map((t, n) => (
            <p key={n}>{t}</p>
          ))}
        </div>

        {entrada.secoes.map((s) => (
          <section
            key={s.id}
            id={`ajuda-${s.id}`}
            aria-labelledby={`ajuda-${s.id}-t`}
            className={`rounded-[10px] border px-3 py-3 ${secao === s.id ? 'border-linha-forte bg-texto/[0.03]' : 'border-linha'}`}
          >
            <h3 id={`ajuda-${s.id}-t`} className="text-[13px] font-semibold">
              {s.titulo}
            </h3>
            <div className="mt-2 max-w-prose space-y-2 text-[13px] leading-relaxed text-suave">
              {s.blocos.map((t, n) => (
                <p key={n}>{t}</p>
              ))}
            </div>
          </section>
        ))}

        {outras && outras.telas.length > 0 && (
          <nav aria-label={`Outras telas de ${outras.area}`}>
            <h3 className="text-[13px] font-semibold">Outras telas de {outras.area}</h3>
            <ul className="mt-1">
              {outras.telas.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="ff-transicao flex min-h-11 items-center text-[14px] text-texto underline-offset-4 hover:underline focus-visible:underline sm:min-h-9">
                    {t.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="space-y-2 border-t border-linha pt-4 text-[13px] text-suave">
          <p>
            Ainda com dúvida?{' '}
            <a href={contato.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-texto underline decoration-texto/30 underline-offset-4 hover:decoration-texto">
              Fale com a FlowFoods
            </a>
            <span className="mt-0.5 block tabular-nums">WhatsApp {contato.display}</span>
          </p>
          {preferencia && !preferencia.dicasLigadas && acoes && (
            <form action={acoes.dicas} onSubmit={aoReligar} className="flex flex-wrap items-center gap-x-2">
              <span>As dicas estão desligadas.</span>
              <button type="submit" name="dicas" value="ligar" className={`${LINK_DE_TEXTO} min-h-11 sm:min-h-8`}>
                Religar
              </button>
            </form>
          )}
        </div>
      </div>
    </Dialogo>
  );
}
