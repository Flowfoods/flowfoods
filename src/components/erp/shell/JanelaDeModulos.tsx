'use client';

/**
 * Janela de Módulos da barra do celular e do tablet (decisão 535, prévia aprovada em 23/11/2026): abre acima da barra, a
 * partir do botão Módulos do centro (a Expansão), com o título, o fechar, a busca e a grade das áreas da pessoa: duas
 * colunas no celular e três no tablet. Mesma fonte do seletor de áreas do menu (`nav.modulos`): o Início, as áreas com tela
 * (links, a atual marcada) e, num grupo separado, o "Em breve" (texto e selo, sem link).
 *
 * Comporta-se como o painel do seletor (`Popover`), que ela substitui na barra: não bloqueia a página; Escape e o fechar
 * devolvem o foco ao botão; toque fora fecha; o foco que sai pelo Tab fecha e fica onde foi; trocar de tela fecha. Abrir,
 * animar e fechar não consultam nem gravam nada. Fechar é imediato, sem animação de saída.
 *
 * Expansão: a origem do movimento é o centro do botão que abriu (medida antes da pintura, `transform-origin`); com movimento
 * reduzido, a regra geral do `tokens.css` tira a animação e a janela aparece direto.
 *
 * Formato `central` (decisão 537, o desktop da prévia "Um modal, três formatos"): a MESMA janela, aberta pelo seletor de área
 * do menu lateral, no centro da área de trabalho (à direita da lateral, abaixo da barra do topo), com quatro colunas. Ela vai
 * para o fim do `.ff-app` (portal): dentro da lateral, a barra presa do topo passaria por cima dela. Por isso o foco entra na
 * busca ao abrir (no computador não há teclado virtual para abrir), senão o Tab do seletor seguiria pela lateral.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, X } from 'lucide-react';
import { COLUNA_DE_MODULOS, COR, colunaDoAtalho, filtrarModulos, nomeCurtoDoModulo, type ModuloNav, type Navegacao } from '@/lib/erp/modulos';
import { IconeDoModulo } from '../ui/cabecalho';
import { CAMPO, ROTULO } from '../ui/campos';
import { SeloEmBreve } from '../ui/em-breve';
import { classeDeBotao } from '../ui/estilos';
import { andarPelaGrade } from './grade-teclado';
import { foraDaCaixa } from './Popover';

const andarPelosBlocos = andarPelaGrade('a.ff-bloco-compacto');
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** O primeiro elemento focável e visível depois de `de` na ordem do documento, fora de `exceto`. */
function focavelDepois(de: HTMLElement, exceto: HTMLElement): HTMLElement | null {
  const todos = Array.from(document.querySelectorAll<HTMLElement>(FOCAVEIS));
  for (const el of todos) {
    if (exceto.contains(el) || el === de) continue;
    if (de.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && el.getClientRects().length > 0) return el;
  }
  return null;
}

/**
 * Decisão 536 · "Editar barra": o que a janela precisa para editar os atalhos. `opcoes` é o que pode ir para a barra (o
 * Início e as áreas com tela, as mesmas que o servidor aceita); `atuais`, os atalhos de agora, na ordem da tela; `padrao`,
 * a barra de quem nunca editou.
 */
export interface EdicaoDaBarra {
  opcoes: { chave: string; nome: string }[];
  atuais: string[];
  padrao: string[];
  salvar: (chaves: string[]) => Promise<{ ok: boolean; mensagem?: string }>;
}

/** "1º atalho · à esquerda do Módulos": a posição de cada seletor, contada da esquerda para a direita. */
export function rotuloDaPosicao(indice: number, total: number): string {
  return `${indice + 1}º atalho · à ${colunaDoAtalho(indice, total) < COLUNA_DE_MODULOS ? 'esquerda' : 'direita'} do Módulos`;
}

/** No servidor não há layout para medir: o efeito de antes da pintura só existe no navegador. */
const useAntesDaPintura = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Onde fica o centro do botão, em px, a partir do canto de cima à esquerda da janela: a origem da Expansão. */
export function origemDaExpansao(botao: { left: number; top: number; width: number; height: number }, janela: { left: number; top: number }): string {
  return `${Math.round(botao.left + botao.width / 2 - janela.left)}px ${Math.round(botao.top + botao.height / 2 - janela.top)}px`;
}

export function JanelaDeModulos({
  id,
  nav,
  atual,
  botao,
  aoFechar,
  edicao = null,
  formato = 'barra',
}: {
  id: string;
  nav: Navegacao;
  /** A área da tela atual (no Início ou fora do menu, nenhuma). */
  atual: ModuloNav | null;
  /** O botão Módulos: origem da Expansão, destino do foco ao fechar e fora da conta do "toque fora". */
  botao: RefObject<HTMLButtonElement | null>;
  /** `devolverFoco`: Escape e o fechar devolvem o foco ao botão; toque fora e foco que sai deixam onde está. */
  aoFechar: (devolverFoco: boolean) => void;
  /** Sem ela (sem ação de salvar, ou uma opção só), a janela não oferece o "Editar barra". */
  edicao?: EdicaoDaBarra | null;
  /** `barra`: acima da barra do celular e do tablet. `central`: no centro da área de trabalho do computador (decisão 537). */
  formato?: 'barra' | 'central';
}) {
  const central = formato === 'central';
  const busca_ = useRef<HTMLInputElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const botaoEditar = useRef<HTMLButtonElement>(null);
  const janela = useRef<HTMLDivElement>(null);
  const [busca, setBusca] = useState('');
  const [posicao, setPosicao] = useState<{ origem: string; lateral?: string; topo?: string } | null>(null);
  const idTitulo = useId();
  const idAreas = useId();
  const idEmBreve = useId();
  const caminho = usePathname();
  const caminhoAoAbrir = useRef(caminho);

  // Trocar de tela fecha (o link escolhido também fecha no clique; o voltar do navegador, só por aqui).
  useEffect(() => {
    if (caminho !== caminhoAoAbrir.current) aoFechar(false);
  }, [caminho, aoFechar]);

  // A Expansão nasce do centro do botão: mede antes da pintura. Nesse instante a animação já começou com a origem padrão (o
  // centro da janela), então a caixa medida está escalada em volta do centro: o canto sem transformação sai do tamanho real
  // (`offsetWidth`/`offsetHeight` ignoram o `transform`).
  useAntesDaPintura(() => {
    const j = janela.current;
    const b = botao.current?.getBoundingClientRect();
    if (!j || !b) return;
    // Central: a área de trabalho começa onde a lateral termina e abaixo da barra presa do topo (medidas agora, antes de medir
    // a própria janela, que depende delas).
    let lateral: string | undefined;
    let topo: string | undefined;
    if (central) {
      lateral = `${Math.round(botao.current?.closest('aside')?.getBoundingClientRect().right ?? 0)}px`;
      const barra = document.querySelector('.ff-app header.ff-material.sticky')?.getBoundingClientRect();
      topo = `${Math.round(Math.max(0, barra?.bottom ?? 0) + 16)}px`;
      j.style.setProperty('--ff-fim-da-lateral', lateral);
      j.style.setProperty('--ff-topo-da-janela', topo);
    }
    const caixa = j.getBoundingClientRect();
    const esquerda = caixa.left - (j.offsetWidth - caixa.width) / 2;
    const alto = caixa.top - (j.offsetHeight - caixa.height) / 2;
    setPosicao({ origem: origemDaExpansao(b, { left: esquerda, top: alto }), lateral, topo });
  }, [botao, central]);

  // Central: o foco entra na janela (ela mora no fim do `.ff-app`, longe do seletor na ordem do Tab). Com mouse, na busca;
  // com toque (tablet deitado também passa de 900 px), no título, para não abrir o teclado virtual por cima da grade.
  useEffect(() => {
    if (!central) return;
    if (window.matchMedia?.('(pointer: fine)').matches) busca_.current?.focus();
    else titulo.current?.focus();
  }, [central]);

  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      // O próprio botão alterna (abre e fecha) no clique: aqui fica fora da conta.
      if (janela.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      aoFechar(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      aoFechar(true);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aoFechar, botao]);

  const emUso = nav.modulos.filter((m) => m.href);
  const emBreve = nav.modulos.filter((m) => !m.href);
  const achadas = filtrarModulos(emUso, busca);
  const achadasEmBreve = filtrarModulos(emBreve, busca);
  // O Início entra como a primeira área, como no seletor do menu; na busca, pelo nome dele.
  const inicioAparece = filtrarModulos([{ nome: nav.inicio.titulo, subtitulo: 'Início · Todas as áreas', grupos: [] }], busca).length > 0;
  const nada = !inicioAparece && achadas.length === 0 && achadasEmBreve.length === 0;

  const estilo = posicao
    ? ({ transformOrigin: posicao.origem, ...(posicao.lateral ? { '--ff-fim-da-lateral': posicao.lateral } : {}), ...(posicao.topo ? { '--ff-topo-da-janela': posicao.topo } : {}) } as CSSProperties)
    : undefined;
  const destino = central && typeof document !== 'undefined' ? botao.current?.closest('.ff-app') : null;

  const conteudo = (
    <div
      ref={janela}
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={idTitulo}
      data-janela-de-modulos
      data-formato={formato}
      className={`ff-janela-modulos ff-expansao${central ? ' ff-janela-modulos-central' : ''}`}
      style={estilo}
      // O foco que sai da janela para outro elemento (que não seja o botão) fecha e fica onde foi.
      onBlur={(e) => {
        if (foraDaCaixa(e.currentTarget, e.relatedTarget) && !botao.current?.contains(e.relatedTarget as Node)) aoFechar(false);
      }}
      // Central (portal no fim do `.ff-app`): o Tab que sai pelas pontas faz o que faria se a janela estivesse logo depois do
      // seletor, como o painel de antes. Depois do último, o foco segue para o que vem depois do seletor e a janela fecha;
      // antes do primeiro, volta ao seletor. Sem isso, o Tab saía do documento e a janela ficava aberta.
      onKeyDown={(e) => {
        if (!central || e.key !== 'Tab' || !janela.current || !botao.current) return;
        const focaveis = Array.from(janela.current.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((el) => el.getClientRects().length > 0);
        if (e.shiftKey && document.activeElement === focaveis[0]) {
          e.preventDefault();
          aoFechar(true);
        } else if (!e.shiftKey && document.activeElement === focaveis.at(-1)) {
          e.preventDefault();
          const seguinte = focavelDepois(botao.current, janela.current);
          aoFechar(false);
          (seguinte ?? botao.current).focus();
        }
      }}
    >
      <div className="ff-janela-modulos-cabeca">
        <h2 ref={titulo} tabIndex={-1} id={idTitulo} className="font-display text-[20px] font-normal leading-tight tracking-[-0.01em] focus:outline-none">
          {editando ? 'Editar barra' : 'Módulos'}
        </h2>
        <button type="button" onClick={() => aoFechar(true)} aria-label="Fechar os módulos" className="ff-transicao inline-grid h-11 w-11 shrink-0 place-items-center rounded-botao text-suave hover:bg-texto/5 hover:text-texto">
          <X size={18} aria-hidden />
        </button>
      </div>
      {editando && edicao ? (
        <EditorDaBarra
          edicao={edicao}
          aoTerminar={(salvo) => {
            setEditando(false);
            setAviso(salvo ? 'Barra salva.' : null);
          }}
          botaoEditar={botaoEditar}
        />
      ) : (
      <>
      <div className="px-3 pb-2">
        <input
          ref={busca_}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar módulo"
          placeholder="Buscar módulo"
          autoComplete="off"
          enterKeyHint="search"
          // A barra continua à vista com este campo em foco (a regra do teclado em `tokens.css` pula a busca da janela).
          data-mantem-barra
          className="ff-busca-modulos"
        />
      </div>
      <div className="ff-janela-modulos-corpo" onKeyDown={andarPelosBlocos}>
        {/* A região de estado fica sempre montada (só o texto muda): leitor de tela não anuncia região que nasce preenchida. */}
        <p role="status" className={nada ? 'px-1 py-6 text-center text-[14px] text-suave' : 'sr-only'}>
          {nada ? `Nenhum módulo com “${busca.trim()}”.` : ''}
        </p>
        {nada ? null : (
          <>
            <p id={idAreas} className="sr-only">
              Áreas
            </p>
            <ul aria-labelledby={idAreas} className="ff-grade-compacta">
              {inicioAparece && (
                <li>
                  <BlocoCompacto
                    href={nav.inicio.href}
                    // O que aparece é "Início", e o nome acessível também (WCAG 2.5.3): "Áreas da Rede" é o título da tela.
                    nome="Início"
                    rotulo="Início"
                    icone="inicio"
                    cor={COR.inicio}
                    atual={!atual}
                    aoEscolher={() => aoFechar(false)}
                  />
                </li>
              )}
              {achadas.map((m) => (
                <li key={m.chave}>
                  <BlocoCompacto
                    href={m.href!}
                    nome={m.nome}
                    rotulo={nomeCurtoDoModulo(m.nome)}
                    icone={m.icone}
                    cor={m.cor}
                    atual={atual?.chave === m.chave}
                    aoEscolher={() => aoFechar(false)}
                  />
                </li>
              ))}
            </ul>
            {achadasEmBreve.length > 0 && (
              <>
                {/* avoid-ai-design-ignore: SD4 — rótulo de grupo em caixa alta, como o "Em breve" do seletor de áreas do menu. */}
                <p id={idEmBreve} className="mt-3 border-t border-linha px-1 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.11em] text-suave">
                  Em breve
                </p>
                <ul aria-labelledby={idEmBreve} className="ff-grade-compacta">
                  {achadasEmBreve.map((m) => (
                    <li key={m.chave}>
                      <div className="ff-bloco-compacto ff-bloco-compacto-futuro">
                        <IconeDoModulo icone={m.icone} cor={COR.futuro} tamanho={28} variante="futuro" />
                        <span className="min-w-0">
                          {/* Nome inteiro: não é link, então não há nome acessível à parte, e dois "Pedidos…" virariam iguais. */}
                          <span className="ff-bloco-compacto-nome block font-medium">{m.nome}</span>
                          <SeloEmBreve cadeado={m.cadeado} className="mt-1" />
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      {edicao && (
        <div className="ff-janela-modulos-pe">
          <button
            ref={botaoEditar}
            type="button"
            onClick={() => {
              setAviso(null);
              setEditando(true);
            }}
            className="ff-transicao inline-flex min-h-11 items-center gap-2 rounded-botao px-2 text-[14px] font-semibold text-acento hover:bg-texto/5"
          >
            <Pencil size={16} aria-hidden />
            Editar barra
          </button>
        </div>
      )}
      </>
      )}
      {/* "Barra salva.": a região fica montada nos dois modos (só o texto muda), para o leitor de tela anunciar. */}
      {edicao && (
        <p role="status" className={aviso ? 'px-4 pb-3 text-[13px] text-ok' : 'sr-only'}>
          {aviso ?? ''}
        </p>
      )}
    </div>
  );
  return destino ? createPortal(conteudo, destino) : conteudo;
}

/**
 * Decisão 536 · os atalhos da barra, um seletor por posição (da esquerda para a direita). Trocar o que está num seletor
 * SUBSTITUI o atalho; escolher em outra posição o que já está numa REORDENA (a repetição é dita e trava o salvar). "Voltar
 * ao padrão" só preenche os seletores; nada grava até "Salvar barra". "Cancelar" volta para a grade sem efeito. O servidor
 * confere de novo o menu da pessoa antes de gravar.
 */
function EditorDaBarra({
  edicao,
  aoTerminar,
  botaoEditar,
}: {
  edicao: EdicaoDaBarra;
  aoTerminar: (salvo: boolean) => void;
  botaoEditar: RefObject<HTMLButtonElement | null>;
}) {
  const [escolha, setEscolha] = useState<string[]>(edicao.atuais);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const idBase = useId();
  const primeiro = useRef<HTMLSelectElement>(null);
  const nome = (chave: string) => edicao.opcoes.find((o) => o.chave === chave)?.nome ?? chave;
  const repetida = escolha.find((c, i) => escolha.indexOf(c) !== i) ?? null;
  const mudou = escolha.join('|') !== edicao.atuais.join('|');

  // Abrir a edição leva o foco ao primeiro seletor; sair dela (salvar ou cancelar) devolve ao "Editar barra".
  useEffect(() => {
    primeiro.current?.focus();
    const voltar = botaoEditar;
    return () => {
      // O botão volta a existir no mesmo render em que a edição some.
      queueMicrotask(() => voltar.current?.focus());
    };
  }, [botaoEditar]);

  async function salvar() {
    if (repetida || pendente) return;
    setPendente(true);
    setErro(null);
    try {
      // Igual ao padrão: grava "sem escolha" (lista vazia), para a pessoa seguir o padrão quando o menu mudar.
      const r = await edicao.salvar(escolha.join('|') === edicao.padrao.join('|') ? [] : escolha);
      if (!r.ok) {
        setErro(r.mensagem ?? 'Não foi possível salvar a barra. Tente de novo.');
        return;
      }
      aoTerminar(true);
    } catch {
      // Rede que caiu, erro do servidor: a tela não fica presa em "Salvando…"; Cancelar e os seletores voltam.
      setErro('Não foi possível salvar a barra. Confira a conexão e tente de novo.');
    } finally {
      setPendente(false);
    }
  }

  return (
    <form
      className="ff-janela-modulos-corpo space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
      aria-busy={pendente}
    >
      <p className="text-[13px] text-suave">Escolha o que fica dos lados do Módulos. Vale para você, neste parceiro.</p>
      <div className="ff-editor-barra">
        {escolha.map((chave, i) => (
          <div key={i}>
            <label htmlFor={`${idBase}-${i}`} className={ROTULO}>
              {rotuloDaPosicao(i, escolha.length)}
            </label>
            <select
              ref={i === 0 ? primeiro : undefined}
              id={`${idBase}-${i}`}
              value={chave}
              disabled={pendente}
              // A barra continua à vista com o seletor em foco (a regra do teclado em `tokens.css` pula a janela).
              data-mantem-barra
              aria-invalid={repetida === chave ? true : undefined}
              aria-describedby={repetida === chave ? `${idBase}-repetida` : undefined}
              onChange={(e) => {
                const nova = [...escolha];
                nova[i] = e.target.value;
                setEscolha(nova);
                setErro(null);
              }}
              className={CAMPO}
            >
              {edicao.opcoes.map((o) => (
                <option key={o.chave} value={o.chave}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {repetida && (
        <p id={`${idBase}-repetida`} role="alert" className="text-[13px] text-erro">
          {nome(repetida)} está em duas posições. Cada área entra na barra uma vez só.
        </p>
      )}
      {erro && (
        <p role="alert" className="text-[13px] text-erro">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          disabled={pendente || escolha.join('|') === edicao.padrao.join('|')}
          onClick={() => {
            setEscolha(edicao.padrao);
            setErro(null);
          }}
          className={classeDeBotao('fantasma')}
        >
          Voltar ao padrão
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pendente} onClick={() => aoTerminar(false)} className={classeDeBotao('fantasma')}>
            Cancelar
          </button>
          <button type="submit" disabled={!!repetida || pendente || !mudou} className={classeDeBotao('primario')}>
            {pendente ? 'Salvando…' : 'Salvar barra'}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Um bloco da grade compacta: o ícone de cor cheia e o nome curto, no fundo tonal da área (como os cards e o seletor). */
function BlocoCompacto({
  href,
  nome,
  rotulo,
  icone,
  cor,
  atual,
  aoEscolher,
}: {
  href: string;
  nome: string;
  rotulo: string;
  icone: Parameters<typeof IconeDoModulo>[0]['icone'];
  cor: string;
  atual: boolean;
  aoEscolher: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={aoEscolher}
      aria-current={atual ? 'true' : undefined}
      // O nome curto aparece; o inteiro é o nome acessível e começa por ele ("Estoque" → "Estoque e Movimentações").
      aria-label={nome === rotulo ? undefined : nome}
      title={nome === rotulo ? undefined : nome}
      className="ff-bloco-compacto ff-identidade-modulo ff-transicao"
      style={{ '--cor-modulo': cor } as CSSProperties}
    >
      <IconeDoModulo icone={icone} cor={cor} tamanho={28} variante="cheio" />
      <span className="ff-bloco-compacto-nome min-w-0">{rotulo}</span>
    </Link>
  );
}
