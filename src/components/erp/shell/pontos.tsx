'use client';

/**
 * Pontos de ajuda (prioridade nº 1 de 23/10/2026): a explicação mora junto do
 * campo, seção ou ação, num card flutuante — no lugar do texto didático fixo.
 *
 * Regras (Rodolfo, 23/10):
 *  - uma ajuda aberta por vez; abrir outra troca o conteúdo, não empilha;
 *  - abre sozinha na 1ª visita ao contexto e volta a ficar elegível 7 dias
 *    depois da última abertura automática (no máximo UMA abertura automática
 *    por visita à tela, para não virar fila de popups);
 *  - X / Escape dispensa agora, sem perder nada do formulário; "Não mostrar
 *    novamente" corta a abertura automática; o botão do campo abre sempre;
 *  - abertura automática não rouba o foco de quem está digitando; abertura
 *    manual leva o foco ao card e, ao fechar, devolve ao botão que abriu.
 *
 * O card é não modal: a página continua usável atrás dele. A decisão "abre
 * sozinho?" é a mesma conta do servidor (`estadoDoPonto`), com o dia que o
 * servidor mandou (`hoje`), nunca o relógio do aparelho.
 */

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { estadoDoPonto, itemDoPonto, type PontoParaATela, type PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import { classeDeBotao } from '../ui/estilos';
import type { AjudaDoShell } from './tipos';

/** Espera antes da abertura automática: a tela termina de montar e a pessoa se situa. */
const ESPERA_DA_ABERTURA_AUTOMATICA_MS = 1200;

interface ContextoDosPontos {
  /** Chave da entrada da tela ("insumo-novo"): o id completo do ponto é "chave.ponto". */
  chave: string | null;
  /** O ponto existe para esta pessoa nesta tela (permissão e registro)? */
  tem: (ponto: string) => boolean;
  titulo: (ponto: string) => string | null;
  /** Id completo do ponto aberto agora. */
  ativo: string | null;
  abrir: (ponto: string, origem: HTMLElement) => void;
  registrar: (ponto: string, el: HTMLElement) => () => void;
}

const Contexto = createContext<ContextoDosPontos>({
  chave: null,
  tem: () => false,
  titulo: () => null,
  ativo: null,
  abrir: () => {},
  registrar: () => () => {},
});

export function usePontos() {
  return useContext(Contexto);
}

export function ProvedorDosPontos({
  chave,
  pontos,
  caminho,
  preferencia,
  ajuda,
  podeAbrirSozinho,
  aoVerPassoAPasso,
  children,
}: {
  chave: string | null;
  pontos: PontoParaATela[];
  caminho: string;
  preferencia: PreferenciaDeAjuda | null;
  ajuda: AjudaDoShell | undefined;
  /** Falso quando outra ajuda já ocupa a tela (a caixa "Como funciona" ou a gaveta). */
  podeAbrirSozinho: boolean;
  aoVerPassoAPasso: (secao: string, origem: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const porId = useMemo(() => new Map(pontos.map((p) => [p.id, p])), [pontos]);
  const [ativo, setAtivo] = useState<{ id: string; automatico: boolean } | null>(null);
  // O que esta aba já gravou e o servidor ainda não devolveu (vale até a próxima navegação).
  const [gravados, setGravados] = useState<string[]>([]);
  // Dispensados no X nesta visita: não voltam sozinhos agora (voltam pelo botão do campo).
  const dispensados = useRef<Set<string>>(new Set());
  const origem = useRef<HTMLElement | null>(null);
  const registrados = useRef<Map<string, Set<HTMLElement>>>(new Map());
  const abriuSozinhoNestaVisita = useRef(false);

  const idCompleto = useCallback((ponto: string) => (chave ? `${chave}.${ponto}` : ''), [chave]);

  // Trocar de tela: fecha o card e libera a abertura automática da próxima tela.
  useEffect(() => {
    setAtivo(null);
    dispensados.current = new Set();
    abriuSozinhoNestaVisita.current = false;
  }, [caminho]);

  const preferenciaComGravados = useMemo<PreferenciaDeAjuda | null>(
    () => (preferencia ? { ...preferencia, pontos: [...preferencia.pontos, ...gravados] } : null),
    [preferencia, gravados],
  );

  const fechar = useCallback((devolverFoco: boolean) => {
    setAtivo((a) => {
      if (a) dispensados.current.add(a.id);
      return null;
    });
    if (devolverFoco && origem.current?.isConnected) origem.current.focus();
  }, []);

  const abrir = useCallback(
    (ponto: string, el: HTMLElement) => {
      const id = idCompleto(ponto);
      if (!porId.has(id)) return;
      origem.current = el;
      setAtivo({ id, automatico: false });
    },
    [idCompleto, porId],
  );

  const registrar = useCallback(
    (ponto: string, el: HTMLElement) => {
      const id = idCompleto(ponto);
      const lista = registrados.current.get(id) ?? new Set<HTMLElement>();
      lista.add(el);
      registrados.current.set(id, lista);
      return () => {
        lista.delete(el);
        if (lista.size === 0) registrados.current.delete(id);
      };
    },
    [idCompleto],
  );

  // Abertura automática: o primeiro ponto elegível, na ordem em que aparece na tela, uma vez por visita.
  const hoje = ajuda?.hoje ?? 0;
  const acoes = ajuda?.acoes ?? null;
  useEffect(() => {
    if (!acoes || !preferenciaComGravados || !podeAbrirSozinho || ativo || abriuSozinhoNestaVisita.current) return;
    const t = window.setTimeout(() => {
      if (abriuSozinhoNestaVisita.current || document.querySelector('dialog[open]')) return;
      const candidatos = Array.from(registrados.current.entries())
        .filter(([id]) => porId.has(id) && !dispensados.current.has(id) && estadoDoPonto(id, preferenciaComGravados, hoje) === 'elegivel')
        .map(([id, els]) => ({ id, el: primeiroVisivel(els) }))
        .filter((c): c is { id: string; el: HTMLElement } => c.el !== null)
        .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const escolhido = candidatos[0];
      if (!escolhido) return;
      abriuSozinhoNestaVisita.current = true;
      origem.current = escolhido.el;
      setAtivo({ id: escolhido.id, automatico: true });
      setGravados((g) => [...g, itemDoPonto(escolhido.id, hoje)]);
      void acoes.pontoVisto(escolhido.id).catch(() => {});
    }, ESPERA_DA_ABERTURA_AUTOMATICA_MS);
    return () => window.clearTimeout(t);
  }, [acoes, preferenciaComGravados, podeAbrirSozinho, ativo, porId, hoje, caminho]);

  const valor = useMemo<ContextoDosPontos>(
    () => ({
      chave,
      tem: (ponto) => porId.has(idCompleto(ponto)),
      titulo: (ponto) => porId.get(idCompleto(ponto))?.titulo ?? null,
      ativo: ativo?.id ?? null,
      abrir,
      registrar,
    }),
    [chave, porId, idCompleto, ativo, abrir, registrar],
  );

  const pontoAtivo = ativo ? porId.get(ativo.id) ?? null : null;

  return (
    <Contexto.Provider value={valor}>
      {children}
      {pontoAtivo && ativo && (
        <CardDeAjuda
          key={pontoAtivo.id}
          ponto={pontoAtivo}
          automatico={ativo.automatico}
          origem={origem}
          podeDispensar={!!acoes}
          acaoNunca={acoes?.pontoNunca ?? null}
          aoFechar={fechar}
          aoNunca={() => {
            setGravados((g) => [...g, itemDoPonto(pontoAtivo.id, 'x')]);
            fechar(true);
          }}
          aoVerPassoAPasso={(secao) => {
            const de = origem.current;
            setAtivo(null);
            aoVerPassoAPasso(secao, de);
          }}
        />
      )}
      {/* Aviso para leitor de tela quando o card abre sozinho (o foco fica onde a pessoa estava). */}
      <p className="sr-only" aria-live="polite">
        {pontoAtivo && ativo?.automatico ? `Ajuda disponível: ${pontoAtivo.titulo}. Para fechar, tecle Escape.` : ''}
      </p>
    </Contexto.Provider>
  );
}

function primeiroVisivel(els: Set<HTMLElement>): HTMLElement | null {
  for (const el of els) if (el.isConnected && el.getClientRects().length > 0) return el;
  return null;
}

function CardDeAjuda({
  ponto,
  automatico,
  origem,
  podeDispensar,
  acaoNunca,
  aoFechar,
  aoNunca,
  aoVerPassoAPasso,
}: {
  ponto: PontoParaATela;
  automatico: boolean;
  origem: RefObject<HTMLElement | null>;
  podeDispensar: boolean;
  acaoNunca: ((form: FormData) => Promise<void>) | null;
  aoFechar: (devolverFoco: boolean) => void;
  aoNunca: () => void;
  aoVerPassoAPasso: (secao: string) => void;
}) {
  const id = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // Aberto pelo botão do campo: o foco vai para o card e, se o card cobrir o campo (celular, tablet em pé),
  // a página sobe o suficiente para o campo ficar à vista acima dele. Aberto sozinho: nada se mexe e o foco
  // fica onde estava (quem está digitando não perde o lugar).
  useEffect(() => {
    if (automatico) return;
    const alvo = origem.current;
    const c = card.current;
    if (alvo?.isConnected && c) {
      const topoDoCard = c.getBoundingClientRect().top;
      const baseDoAlvo = alvo.getBoundingClientRect().bottom;
      if (baseDoAlvo > topoDoCard - 12) window.scrollBy({ top: baseDoAlvo - topoDoCard + 24 });
    }
    titulo.current?.focus({ preventScroll: true });
  }, [automatico, origem]);

  // Escape fecha (se não houver outra janela por cima). Devolve o foco só se ele estava no card.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      const dentro = !!card.current && card.current.contains(document.activeElement);
      e.preventDefault();
      aoFechar(dentro || !automatico);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar, automatico]);

  function aoEnviarNunca(e: FormEvent<HTMLFormElement>) {
    if (!acaoNunca) {
      e.preventDefault();
      return;
    }
    aoNunca();
  }

  return (
    <div
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-t`}
      data-ponto-de-ajuda={ponto.id}
      className="fixed inset-x-3 z-40 max-h-[min(60dvh,28rem)] overflow-y-auto rounded-[14px] border border-linha-forte bg-painel px-4 pb-4 pt-3 shadow-[0_12px_32px_-12px_rgba(10,10,10,0.35)] sm:inset-x-auto sm:right-5 sm:w-[min(380px,calc(100vw-2.5rem))]"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-suave">Como funciona</p>
          <h2 id={`${id}-t`} ref={titulo} tabIndex={-1} className="mt-1 text-[15px] font-semibold leading-snug text-texto outline-none">
            {ponto.titulo}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => aoFechar(true)}
          aria-label="Fechar ajuda"
          className="ff-transicao -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-suave">
        {ponto.blocos.map((t, n) => (
          <p key={n}>{t}</p>
        ))}
      </div>

      {(ponto.secao || podeDispensar) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ponto.secao && (
            <button type="button" aria-haspopup="dialog" onClick={() => aoVerPassoAPasso(ponto.secao as string)} className={classeDeBotao('secundario')}>
              Ver passo a passo
            </button>
          )}
          {podeDispensar && acaoNunca && (
            <form action={acaoNunca} onSubmit={aoEnviarNunca}>
              <input type="hidden" name="ponto" value={ponto.id} />
              <button type="submit" className={classeDeBotao('fantasma')}>
                Não mostrar novamente
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
