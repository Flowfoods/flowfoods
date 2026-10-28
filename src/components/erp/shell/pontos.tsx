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
 *
 * Reorganização de 24/10/2026 (Rodolfo):
 *  - a explicação da TELA (a antiga caixa fixa "Como funciona" embaixo do
 *    título) é um ponto como os outros, o ponto `tela`: mesma regra de
 *    1ª visita e 7 dias, e "Não mostrar novamente" é o "fechar" da caixa
 *    (por versão do texto: se o texto mudar, ela volta com "Mudou");
 *  - com o card aberto, um véu vermelho clarinho e translúcido cobre o resto
 *    da tela (o contexto continua à vista). O véu não segura o clique: tocar
 *    fora do card fecha a ajuda e o toque segue para onde foi dado.
 *
 * Sequência guiada (decisão 479; decisão vigente de Rodolfo em 25/10/2026):
 *  - os pontos visíveis da tela formam uma sequência na ordem da página
 *    (regras puras em `ajuda-sequencia.ts`); fechar a etapa (X ou
 *    "Continuar") abre a próxima, com o botão dela realçado; no último passo,
 *    fechar conclui. "Encerrar ajuda", Escape e tocar fora saem da sequência
 *    inteira, sem avançar; nada disso grava, envia ou mexe no formulário;
 *  - a regra da 1ª visita e dos 7 dias decide quando a sequência começa
 *    sozinha (uma vez por visita); ao começar, todos os passos dela contam
 *    como vistos. Depois de encerrar, não recomeça sozinha nesta visita;
 *  - "Não mostrar novamente" tira o ponto da sequência (o botão dele continua
 *    abrindo) e encerra a sequência de agora;
 *  - avançar leva o foco ao próximo card e rola só o necessário para o botão
 *    do ponto ficar à vista acima do card; encerrar devolve o foco a onde a
 *    pessoa estava.
 */

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { estadoDoPonto, itemDoPonto, PONTO_DA_TELA, type PontoParaATela, type PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import { marcadosAoComecarSozinha, passosDaSequencia, pontosComOQueAAbaGravou, progressoDoPasso, proximoPasso, type PontoNaTela } from '@/lib/erp/ajuda-sequencia';
import { classeDeBotao } from '../ui/estilos';
import { Selo } from '../ui/superficies';
import type { AjudaDoShell } from './tipos';

/** Espera antes da abertura automática: a tela termina de montar e a pessoa se situa. */
const ESPERA_DA_ABERTURA_AUTOMATICA_MS = 1200;
/** Altura da barra fixa do topo (com folga): o botão do ponto não fica escondido atrás dela. */
const TOPO_LIVRE_PX = 72;
/** Folga no fim do conteúdo (CSS em `tokens.css`), só quando uma tela curta não deixa o botão subir acima do card. */
const VARIAVEL_DA_FOLGA = '--ff-folga-da-ajuda';

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

/** "Não mostrar novamente" como formulário de verdade (funciona sem JavaScript). */
export interface FormularioNunca {
  acao: (form: FormData) => Promise<void>;
  campo: string;
  valor: string;
  /** Mudança otimista na tela (o card some, a preferência local já conta). */
  aoEnviar: () => void;
}

/** A explicação da tela inteira, que o shell monta a partir da entrada da rota. */
export interface TelaNoCard {
  titulo: string;
  blocos: string[];
  /** A caixa ainda vale para esta pessoa (não fechou esta versão, dicas ligadas). */
  pendente: boolean;
  mudou: boolean;
  /** O que mais vai no card da tela (a pergunta da 1ª vez). */
  extra: ReactNode;
  nunca: FormularioNunca | null;
}

export function ProvedorDosPontos({
  chave,
  pontos,
  caminho,
  preferencia,
  ajuda,
  podeAbrirSozinho,
  aoVerPassoAPasso,
  tela = null,
  children,
}: {
  chave: string | null;
  pontos: PontoParaATela[];
  /** A explicação da tela (ponto `tela`); null = a tela não tem ajuda. */
  tela?: TelaNoCard | null;
  caminho: string;
  preferencia: PreferenciaDeAjuda | null;
  ajuda: AjudaDoShell | undefined;
  /** Falso quando outra ajuda já ocupa a tela (a caixa "Como funciona" ou a gaveta). */
  podeAbrirSozinho: boolean;
  /** Seção da gaveta a abrir; null = a gaveta do começo ("Ver tudo sobre esta tela"). */
  aoVerPassoAPasso: (secao: string | null, origem: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const idDaTela = chave ? `${chave}.${PONTO_DA_TELA}` : null;
  const porId = useMemo(() => {
    const m = new Map(pontos.map((p) => [p.id, p]));
    if (tela && idDaTela && tela.blocos.length > 0) m.set(idDaTela, { id: idDaTela, titulo: tela.titulo, blocos: tela.blocos, secao: null });
    return m;
  }, [pontos, tela, idDaTela]);
  const telaPendente = tela?.pendente ?? false;
  // `passos`: a sequência de quando esta etapa abriu (para achar a próxima se o alvo desta sumir).
  // `rolar`: a página pode subir para o botão do ponto ficar à vista (não, quando a sequência começou sozinha com alguém digitando).
  const [ativo, setAtivo] = useState<{ id: string; automatico: boolean; rolar: boolean; passos: string[] } | null>(null);
  // O que esta aba já gravou e o servidor ainda não devolveu (vale até a próxima navegação).
  const [gravados, setGravados] = useState<string[]>([]);
  // O botão do ponto da etapa aberta (alvo realçado; o foco volta para ele se não houver lugar de trabalho).
  const origem = useRef<HTMLElement | null>(null);
  // Onde a pessoa estava quando a sequência começou: o foco volta para lá ao encerrar.
  const lugarDeTrabalho = useRef<HTMLElement | null>(null);
  const registrados = useRef<Map<string, Set<HTMLElement>>>(new Map());
  // Uma tentativa de começar sozinha por visita: usada quando a sequência começou (sozinha ou pela pessoa), foi encerrada ou a
  // tentativa da chegada não começou (ninguém elegível, outra janela aberta, alguém digitando com o botão escondido). Usada,
  // a sequência não começa sozinha mais tarde, no meio do trabalho; volta a valer ao trocar de tela.
  const inicioUsadoNestaVisita = useRef(false);

  const idCompleto = useCallback((ponto: string) => (chave ? `${chave}.${ponto}` : ''), [chave]);

  // Trocar de tela: fecha o card e libera a abertura automática da próxima tela.
  useEffect(() => {
    setAtivo(null);
    inicioUsadoNestaVisita.current = false;
  }, [caminho]);

  const preferenciaComGravados = useMemo<PreferenciaDeAjuda | null>(
    () => (preferencia ? { ...preferencia, pontos: pontosComOQueAAbaGravou(preferencia.pontos, gravados) } : null),
    [preferencia, gravados],
  );

  /** Os pontos com botão visível agora, na ordem da página, com o "não mostrar novamente" de cada um. */
  const visiveisNaOrdem = useCallback((): (PontoNaTela & { el: HTMLElement })[] => {
    const nunca = new Set((preferenciaComGravados?.pontos ?? []).filter((i) => i.endsWith('=x')).map((i) => i.slice(0, -2)));
    return Array.from(registrados.current.entries())
      .filter(([id]) => porId.has(id))
      .map(([id, els]) => ({ id, el: primeiroVisivel(els), optouFora: id === idDaTela ? !telaPendente : nunca.has(id) }))
      .filter((c): c is PontoNaTela & { el: HTMLElement } => c.el !== null)
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }, [porId, preferenciaComGravados, idDaTela, telaPendente]);

  /**
   * "Encerrar ajuda", Escape, tocar fora, concluir: sai da sequência. Encerrar devolve o foco a onde a pessoa estava; concluir
   * (fechar o último passo) deixa o foco no botão do último ponto explicado, sem levar a pessoa de volta ao começo da tela.
   */
  const encerrar = useCallback((devolverFoco: boolean, para: 'trabalho' | 'ultimo' = 'trabalho') => {
    inicioUsadoNestaVisita.current = true;
    setAtivo(null);
    if (!devolverFoco) return;
    const ordem = para === 'ultimo' ? [origem.current, lugarDeTrabalho.current] : [lugarDeTrabalho.current, origem.current];
    ordem.find((el) => el?.isConnected)?.focus();
  }, []);

  const abrir = useCallback(
    (ponto: string, el: HTMLElement) => {
      const id = idCompleto(ponto);
      if (!porId.has(id)) return;
      origem.current = el;
      lugarDeTrabalho.current = el;
      inicioUsadoNestaVisita.current = true;
      setAtivo({ id, automatico: false, rolar: true, passos: passosDaSequencia(visiveisNaOrdem(), id) });
    },
    [idCompleto, porId, visiveisNaOrdem],
  );

  /** Fechar a etapa (X ou "Continuar"): abre a próxima da sequência; no último passo, conclui. */
  const avancar = useCallback(() => {
    if (!ativo) return;
    const visiveis = visiveisNaOrdem();
    // Quem já estava na sequência continua nela (o card da tela aberto à mão, por exemplo).
    const passos = passosDaSequencia(visiveis, ativo.passos);
    const proximo = proximoPasso(passos, ativo.passos, ativo.id);
    const el = proximo ? visiveis.find((v) => v.id === proximo)?.el ?? null : null;
    if (!proximo || !el) {
      encerrar(true, 'ultimo');
      return;
    }
    origem.current = el;
    setAtivo({ id: proximo, automatico: false, rolar: true, passos });
  }, [ativo, visiveisNaOrdem, encerrar]);

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
    if (!acoes || !preferenciaComGravados || !podeAbrirSozinho || ativo || inicioUsadoNestaVisita.current) return;
    const t = window.setTimeout(() => {
      if (inicioUsadoNestaVisita.current) return;
      // Uma tentativa, ao chegar na tela, e ela fica usada já aqui, comece ou não: uma nova renderização depois (resposta do
      // servidor, outra preferência, um ponto que aparece) não reagenda o início no meio do trabalho.
      inicioUsadoNestaVisita.current = true;
      if (document.querySelector('dialog[open]')) return;
      const visiveis = visiveisNaOrdem();
      const escolhido = visiveis.find((c) => !c.optouFora && estadoDoPonto(c.id, preferenciaComGravados, hoje) === 'elegivel');
      if (!escolhido) return;
      // Ninguém digitando: começa, e a página sobe até o botão do ponto (como ao abrir à mão). Alguém já digitando num campo:
      // só começa se o botão já estiver à vista e fora de onde o card abre — a página não se mexe debaixo de quem trabalha;
      // senão, nesta visita não começa (nunca abre no meio do trabalho).
      const digitando = estaDigitando();
      if (digitando && !livreDoCard(escolhido.el)) return;
      const passos = passosDaSequencia(visiveis, null);
      origem.current = escolhido.el;
      const foco = document.activeElement;
      lugarDeTrabalho.current = foco instanceof HTMLElement && foco !== document.body ? foco : null;
      setAtivo({ id: escolhido.id, automatico: true, rolar: !digitando, passos });
      // A sequência começou: ela e os passos que vêm depois do primeiro contam como vistos (a regra dos 7 dias vale para ela),
      // numa ida ao servidor só.
      const marcados = marcadosAoComecarSozinha(passos, escolhido.id);
      setGravados((g) => [...g, ...marcados.map((id) => itemDoPonto(id, hoje))]);
      void acoes.pontosVistos(marcados).catch(() => {});
    }, ESPERA_DA_ABERTURA_AUTOMATICA_MS);
    return () => window.clearTimeout(t);
  }, [acoes, preferenciaComGravados, podeAbrirSozinho, ativo, hoje, caminho, visiveisNaOrdem]);

  // "Desligar" as dicas no card da tela encerra a sequência: quem acabou de dizer que não quer dicas não recebe as próximas.
  const dicasLigadas = preferencia?.dicasLigadas ?? null;
  const dicasAntes = useRef(dicasLigadas);
  useEffect(() => {
    if (dicasAntes.current === true && dicasLigadas === false && ativo) encerrar(true);
    dicasAntes.current = dicasLigadas;
  }, [dicasLigadas, ativo, encerrar]);

  // A folga pedida por um card (tela curta) fica até trocar de tela: tirá-la ao fechar faria a página saltar para cima.
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(VARIAVEL_DA_FOLGA);
    },
    [caminho],
  );

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
  const ehTela = !!pontoAtivo && pontoAtivo.id === idDaTela;
  const progresso = ativo ? progressoDoPasso(ativo.passos, ativo.id) : null;
  const temProximo = !!progresso && progresso.n < progresso.de;

  // Tocar fora do card fecha a ajuda (o toque segue para onde foi dado). Outro botão de ajuda troca o conteúdo.
  // `click`, não `pointerdown`: rolar a página no celular não fecha nada.
  const abertoAgora = !!pontoAtivo;
  useEffect(() => {
    if (!abertoAgora) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Element | null;
      if (!alvo || !alvo.isConnected) return;
      if (alvo.closest('[data-ponto-de-ajuda], [data-ponto], dialog')) return;
      // Tocar fora sai da sequência: nunca avança uma etapa sem querer.
      encerrar(false);
    };
    document.addEventListener('click', fora);
    return () => document.removeEventListener('click', fora);
  }, [abertoAgora, encerrar]);

  const nuncaDoPonto: FormularioNunca | null =
    pontoAtivo && acoes
      ? {
          acao: acoes.pontoNunca,
          campo: 'ponto',
          valor: pontoAtivo.id,
          aoEnviar: () => setGravados((g) => [...g, itemDoPonto(pontoAtivo.id, 'x')]),
        }
      : null;
  const nunca = ehTela ? tela?.nunca ?? null : nuncaDoPonto;

  return (
    <Contexto.Provider value={valor}>
      {children}
      {pontoAtivo && ativo && (
        <>
          {/* Véu: vermelho clarinho e translúcido sobre o resto da tela. Só desenho: não segura clique nem foco. */}
          <div aria-hidden data-veu-de-ajuda className="ff-veu-ajuda pointer-events-none fixed inset-0 z-[35]" />
          <CardDeAjuda
            key={pontoAtivo.id}
            ponto={pontoAtivo}
            etiqueta={ehTela ? 'Como funciona esta tela' : 'Como funciona'}
            mudou={ehTela && !!tela?.mudou}
            extra={ehTela ? tela?.extra : null}
            verTudo={ehTela}
            automatico={ativo.automatico}
            rolar={ativo.rolar}
            origem={origem}
            nunca={nunca}
            progresso={progresso}
            temProximo={temProximo}
            aoContinuar={avancar}
            aoEncerrar={encerrar}
            aoNunca={() => {
              nunca?.aoEnviar();
              encerrar(true);
            }}
            aoVerPassoAPasso={(secao) => {
              const de = origem.current;
              setAtivo(null);
              aoVerPassoAPasso(secao, de);
            }}
          />
        </>
      )}
      {/* Aviso para leitor de tela quando o card abre sozinho (o foco fica onde a pessoa estava). */}
      <p className="sr-only" aria-live="polite">
        {pontoAtivo && ativo?.automatico ? `Ajuda disponível: ${pontoAtivo.titulo}${progresso ? `, passo ${progresso.n} de ${progresso.de}` : ''}. Para encerrar, tecle Escape.` : ''}
      </p>
    </Contexto.Provider>
  );
}

/** Onde o card abre (o mesmo desenho das classes do card): embaixo e na largura toda no celular em pé; embaixo à direita, 380 px, do resto. */
function retanguloDoCard(): { top: number; left: number; right: number; bottom: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const altura = Math.min(vh * 0.6, 448);
  const bottom = vh - 12;
  if (vw < 640) return { top: bottom - altura, left: 12, right: vw - 12, bottom };
  const right = vw - 20;
  return { top: bottom - altura, left: right - Math.min(380, vw - 40), right, bottom };
}

/** Alguém está num campo de formulário (digitando ou escolhendo): a página não deve se mexer debaixo dele. */
function estaDigitando(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** O botão está à vista, abaixo da barra do topo, e o card não vai cobri-lo. */
function livreDoCard(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.top < TOPO_LIVRE_PX || r.bottom > window.innerHeight - 12) return false;
  const c = retanguloDoCard();
  return r.right <= c.left || r.left >= c.right || r.bottom <= c.top - 8;
}

function primeiroVisivel(els: Set<HTMLElement>): HTMLElement | null {
  for (const el of els) if (el.isConnected && el.getClientRects().length > 0) return el;
  return null;
}

function CardDeAjuda({
  ponto,
  etiqueta,
  mudou,
  extra,
  verTudo,
  automatico,
  rolar,
  origem,
  nunca,
  progresso,
  temProximo,
  aoContinuar,
  aoEncerrar,
  aoNunca,
  aoVerPassoAPasso,
}: {
  ponto: PontoParaATela;
  etiqueta: string;
  mudou: boolean;
  extra: ReactNode;
  /** Card da tela: "Ver tudo sobre esta tela" abre a gaveta do começo. */
  verTudo: boolean;
  automatico: boolean;
  /** A página pode subir para o botão do ponto ficar à vista. */
  rolar: boolean;
  origem: RefObject<HTMLElement | null>;
  nunca: FormularioNunca | null;
  /** "2 de 5" (só quando a tela tem mais de um ponto à vista). */
  progresso: { n: number; de: number } | null;
  temProximo: boolean;
  /** Fechar a etapa: abre a próxima; no último passo, conclui. */
  aoContinuar: () => void;
  /** Sair da sequência inteira. */
  aoEncerrar: (devolverFoco: boolean) => void;
  aoNunca: () => void;
  aoVerPassoAPasso: (secao: string | null) => void;
}) {
  const id = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // Aberto pelo botão do campo: o foco vai para o card e, se o card cobrir o campo (celular, tablet em pé),
  // a página sobe o suficiente para o campo ficar à vista acima dele. Aberto sozinho: o foco fica onde estava, e a
  // página só sobe se ninguém estiver digitando (quem está num campo não perde o lugar).
  // Na sequência, o mesmo vale ao avançar: o botão do próximo ponto fica à vista, acima do card e abaixo da barra do topo, e a
  // página rola só o necessário (sem animação para quem pediu menos movimento).
  useEffect(() => {
    const alvo = origem.current;
    const c = card.current;
    if (rolar && alvo?.isConnected && c) {
      const topoDoCard = c.getBoundingClientRect().top;
      const r = alvo.getBoundingClientRect();
      const comportamento: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      const rc = c.getBoundingClientRect();
      // O botão tem de ficar acima do card quando o card está na mesma coluna (celular em pé); com o card ao lado (computador,
      // celular deitado), basta ficar dentro da tela.
      const naMesmaColuna = r.right > rc.left && r.left < rc.right;
      const limiteDeBaixo = naMesmaColuna ? topoDoCard - 12 : window.innerHeight - 12;
      if (r.bottom > limiteDeBaixo) {
        const precisa = r.bottom - limiteDeBaixo + 12;
        // Tela curta: a página não rola o bastante para o botão subir acima do card; uma folga no fim do conteúdo resolve.
        // Soma à folga que já houver e mede de novo (com o conteúdo mais curto que a tela, o começo da folga não rende rolagem).
        const raiz = document.documentElement;
        const sobra = () => raiz.scrollHeight - window.innerHeight - window.scrollY;
        for (let i = 0; i < 4 && precisa > sobra(); i++) {
          const atual = parseFloat(raiz.style.getPropertyValue(VARIAVEL_DA_FOLGA)) || 0;
          raiz.style.setProperty(VARIAVEL_DA_FOLGA, `${Math.ceil(atual + precisa - sobra() + 16)}px`);
        }
        window.scrollBy({ top: precisa, behavior: comportamento });
      } else if (r.top < TOPO_LIVRE_PX) window.scrollBy({ top: r.top - TOPO_LIVRE_PX - 12, behavior: comportamento });
    }
    if (!automatico) titulo.current?.focus({ preventScroll: true });
  }, [automatico, rolar, origem]);

  // Escape encerra a sequência (se não houver outra janela por cima). Devolve o foco só se ele estava no card.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      const dentro = !!card.current && card.current.contains(document.activeElement);
      const semFoco = !document.activeElement || document.activeElement === document.body;
      e.preventDefault();
      // Só devolve o foco se ele estava no card (ou em lugar nenhum): quem digita num campo continua no campo.
      aoEncerrar(dentro || semFoco);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoEncerrar, automatico]);

  function aoEnviarNunca(e: FormEvent<HTMLFormElement>) {
    if (!nunca) {
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
      aria-describedby={progresso ? `${id}-p` : undefined}
      data-ponto-de-ajuda={ponto.id}
      className="fixed inset-x-3 z-40 flex max-h-[min(60dvh,28rem)] flex-col rounded-[14px] border border-linha-forte bg-painel shadow-[0_12px_32px_-12px_rgba(10,10,10,0.35)] sm:inset-x-auto sm:right-5 sm:w-[min(380px,calc(100vw-2.5rem))]"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* O topo (com o X) e o rodapé (Encerrar ajuda, Continuar) ficam sempre à vista; só o texto rola num card alto. */}
      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0 pt-1">
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-suave">
            <span>{etiqueta}</span>
            {progresso && (
              <span className="font-medium normal-case tracking-normal tabular-nums">
                <span aria-hidden>· </span>
                <span id={`${id}-p`}>
                  <span className="sr-only">passo </span>
                  {progresso.n} de {progresso.de}
                </span>
              </span>
            )}
            {mudou && (
              <Selo tom="alerta">
                Mudou<span className="sr-only"> desde a última vez que você leu</span>
              </Selo>
            )}
          </p>
          <h2 id={`${id}-t`} ref={titulo} tabIndex={-1} className="mt-1 text-[15px] font-semibold leading-snug text-texto outline-none">
            {ponto.titulo}
          </h2>
        </div>
        <button
          type="button"
          onClick={aoContinuar}
          aria-label={temProximo ? 'Fechar etapa e continuar' : 'Fechar ajuda'}
          className="ff-transicao -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-4 pb-4">
        <div className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-suave">
          {ponto.blocos.map((t, n) => (
            <p key={n}>{t}</p>
          ))}
        </div>

        {extra && (
          <div
            onClickCapture={() =>
              // "Manter as dicas" some depois do clique: o foco volta ao título do card, não ao começo da página.
              window.setTimeout(() => {
                if (!document.activeElement || document.activeElement === document.body) titulo.current?.focus({ preventScroll: true });
              }, 60)
            }
          >
            {extra}
          </div>
        )}

        {(ponto.secao || verTudo || nunca) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ponto.secao && (
              <button type="button" aria-haspopup="dialog" onClick={() => aoVerPassoAPasso(ponto.secao as string)} className={classeDeBotao('secundario')}>
                Ver passo a passo
              </button>
            )}
            {verTudo && (
              <button type="button" aria-haspopup="dialog" onClick={() => aoVerPassoAPasso(null)} className={classeDeBotao('secundario')}>
                Ver tudo sobre esta tela
              </button>
            )}
            {nunca && (
              <form action={nunca.acao} onSubmit={aoEnviarNunca}>
                <input type="hidden" name={nunca.campo} value={nunca.valor} />
                <button type="submit" className={classeDeBotao('fantasma')}>
                  Não mostrar novamente
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {progresso && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-linha px-4 py-3">
          {temProximo && (
            <button type="button" onClick={() => aoEncerrar(true)} className={classeDeBotao('fantasma')}>
              Encerrar ajuda
            </button>
          )}
          <button type="button" onClick={aoContinuar} className={classeDeBotao('secundario')}>
            {temProximo ? 'Continuar' : 'Concluir'}
          </button>
        </div>
      )}
    </div>
  );
}
