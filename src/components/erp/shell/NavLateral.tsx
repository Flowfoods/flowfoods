'use client';

/**
 * Conteúdo do menu lateral (o mesmo na barra fixa do desktop e na gaveta do
 * celular): marca, contexto, SELETOR DE ÁREA no topo, os grupos da área
 * (abrem e fecham; cada item é uma aba) e a versão no rodapé.
 *
 * Padrão aprovado em 09/11/2026: os itens formam uma GRADE compacta de ícone +
 * nome, em duas colunas quando o nome cabe (a regra está em `tokens.css`,
 * `.ff-nav-grade`). O nome nunca é cortado: quebra em linhas e a célula cresce.
 * Item ativo = célula preenchida com contorno e peso, na cor da área, com
 * `aria-current`. Recolhido (desktop): só ícones, com nome acessível e dica.
 *
 * O seletor abre a GRADE DE MÓDULOS (referência de 12/11/2026): um bloco por
 * área em uso, com ícone de cor cheia, nome e função, e, num grupo separado, o
 * catálogo "Em breve": texto e selo, sem link, botão ou consulta.
 */

import Link from 'next/link';
import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { COR, type ModuloNav, type Navegacao } from '@/lib/erp/modulos';
import { IconeDoModulo } from '../ui/cabecalho';
import { SeloEmBreve } from '../ui/em-breve';
import { Marca } from '../ui/Marca';
import { Icone } from './icones';
import { Popover } from './Popover';

export interface EstadoDaNav {
  /** Área mostrada no menu (a do item ativo; no hub, nenhuma). */
  modulo: ModuloNav | null;
  hrefAtivo: string | null;
}

// Célula da grade: ícone em cima, nome embaixo; 64 px de altura mínima (alvo de toque com folga) e cresce com o nome.
const ITEM = 'ff-nav-item ff-identidade-modulo ff-transicao flex w-full text-suave hover:text-texto';
const ITEM_ABERTO = 'min-h-16 flex-col items-center justify-center gap-1.5 px-0.5 py-2 text-center';
// Recolhido: 44 px na gaveta (toque); 40 px na barra fixa do desktop (≥ 900 px).
const ITEM_RECOLHIDO = 'min-h-11 min-[900px]:min-h-10 items-center justify-center';
const GRADE = 'ff-nav-grade';

export function NavLateral({
  nav,
  estado,
  contexto,
  versao,
  recolhido = false,
  aoRecolher,
}: {
  nav: Navegacao;
  estado: EstadoDaNav;
  contexto: string;
  versao: string;
  recolhido?: boolean;
  /** Só na barra do desktop (a gaveta não recolhe). */
  aoRecolher?: () => void;
}) {
  const { modulo, hrefAtivo } = estado;
  const noHub = !modulo;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex h-16 shrink-0 items-center border-b border-linha ${recolhido ? 'justify-center px-2' : 'px-4'}`}
      >
        <Link href={nav.inicio.href} aria-label={`FlowFoods ${nav.rotuloDaArea} — início`} className="rounded-[5px]">
          <Marca rotulo={nav.rotuloDaArea} compacta={recolhido} />
        </Link>
      </div>

      {/* O contexto (parceiro · situação) quebra em linhas: na lateral compacta, cortar o nome do parceiro esconderia onde a pessoa está. */}
      {!recolhido && <p className="break-words px-4 pt-3 text-[12px] leading-snug text-suave">{contexto}</p>}

      <div className={`shrink-0 ${recolhido ? 'px-2 pt-3' : 'px-1.5 pt-2'}`}>
        <SeletorDeModulo nav={nav} atual={modulo} recolhido={recolhido} />
      </div>

      {/* Barra de rolagem fina: com a barra clássica (Windows) ainda cabem as duas colunas quando o menu rola. */}
      <nav aria-label="Menu" className={`min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-width:thin] ${recolhido ? 'px-2' : 'px-1.5'}`}>
        {noHub ? (
          <ul className={`${GRADE} mt-3`} data-recolhido={recolhido}>
            <li>
              <ItemDoMenu
                href={nav.inicio.href}
                rotulo="Início"
                icone="inicio"
                cor={COR.inicio}
                ativo={hrefAtivo === nav.inicio.href}
                recolhido={recolhido}
              />
            </li>
            {nav.modulos
              .filter((m) => m.href)
              .map((m) => (
                <li key={m.chave}>
                  <ItemDoMenu href={m.href!} rotulo={m.nome} icone={m.icone} cor={m.cor} ativo={false} recolhido={recolhido} />
                </li>
              ))}
          </ul>
        ) : (
          modulo.grupos.map((g) =>
            // Grupo de um item só que repete o nome ("INSUMOS › Insumos"): fica só o item, sem o rótulo que abre e fecha. Se o rótulo diz
            // outra coisa ("RELATÓRIOS › Consumo e conciliação"), ele fica: é ele que mostra onde a tela mora.
            g.itens.length === 1 && g.itens[0].rotulo.toLowerCase() === g.rotulo.toLowerCase() ? (
              <ul key={g.rotulo} className={`${GRADE} mt-3`} data-recolhido={recolhido}>
                <li>
                  <ItemDoMenu
                    href={g.itens[0].href}
                    rotulo={g.itens[0].rotulo}
                    icone={g.itens[0].icone}
                    cor={modulo.cor}
                    ativo={hrefAtivo === g.itens[0].href}
                    recolhido={recolhido}
                  />
                </li>
              </ul>
            ) : (
            <Grupo key={g.rotulo} rotulo={g.rotulo} icone={g.icone} cor={modulo.cor} recolhido={recolhido}>
              {g.itens.map((i) => (
                <li key={i.href}>
                  <ItemDoMenu
                    href={i.href}
                    rotulo={i.rotulo}
                    icone={i.icone}
                    cor={modulo.cor}
                    ativo={hrefAtivo === i.href}
                    recolhido={recolhido}
                  />
                </li>
              ))}
            </Grupo>
            ),
          )
        )}
      </nav>

      <div
        className={`flex shrink-0 items-center border-t border-linha py-2 ${recolhido ? 'flex-col gap-1 px-2' : 'justify-between gap-2 px-4'}`}
      >
        <span className={`text-[12px] tabular-nums text-suave ${recolhido ? 'sr-only' : ''}`}>{versao}</span>
        {aoRecolher && (
          <button
            type="button"
            onClick={aoRecolher}
            aria-label={recolhido ? 'Abrir o menu' : 'Recolher o menu'}
            title={recolhido ? 'Abrir o menu' : 'Recolher o menu'}
            className="ff-transicao inline-grid h-10 w-10 place-items-center rounded-botao text-suave hover:bg-texto/5 hover:text-texto"
          >
            {recolhido ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}

function ItemDoMenu({
  href,
  rotulo,
  icone,
  cor,
  ativo,
  recolhido,
}: {
  href: string;
  rotulo: string;
  icone: Parameters<typeof Icone>[0]['nome'];
  cor: string;
  ativo: boolean;
  recolhido: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      title={recolhido ? rotulo : undefined}
      className={`${ITEM} ${recolhido ? ITEM_RECOLHIDO : ITEM_ABERTO}`}
      style={{ '--cor-modulo': cor } as CSSProperties}
    >
      <Icone nome={icone} size={recolhido ? 18 : 20} className="ff-nav-icone shrink-0" />
      {/* O nome de uma área é longo ("Estoque e Movimentações"): quebra em quantas linhas precisar, nunca corta. */}
      <span className={recolhido ? 'sr-only' : 'ff-nav-rotulo block w-full min-w-0 leading-tight'}>{rotulo}</span>
    </Link>
  );
}

function Grupo({
  rotulo,
  icone,
  cor,
  recolhido,
  children,
}: {
  rotulo: string;
  icone: Parameters<typeof Icone>[0]['nome'];
  cor: string;
  recolhido: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(true);
  if (recolhido) {
    // Recolhido: o ícone do grupo fica como âncora (com o nome para leitor de tela e na dica).
    return (
      <div className="ff-identidade-modulo mt-3 border-t border-linha pt-3 first:mt-2 first:border-t-0" style={{ '--cor-modulo': cor } as CSSProperties}>
        <div title={rotulo} className="flex h-6 items-center justify-center text-suave/80">
          <Icone nome={icone} size={13} aria-hidden className="ff-nav-icone" />
          <span className="sr-only">{rotulo}</span>
        </div>
        <ul className={`${GRADE} mt-1`} data-recolhido>{children}</ul>
      </div>
    );
  }
  return (
    <div className="ff-identidade-modulo mt-4" style={{ '--cor-modulo': cor } as CSSProperties}>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="ff-transicao flex min-h-11 w-full items-center gap-2 rounded-[7px] px-1.5 text-[11px] font-semibold uppercase tracking-[0.11em] text-suave hover:text-texto min-[900px]:min-h-8"
      >
        <Icone nome={icone} size={13} aria-hidden className="ff-nav-icone shrink-0" />
        {/* avoid-ai-design-ignore: SD4 — grupo do menu em caixa alta é pedido do contrato do shell (só aqui e no hub). */}
        <span className="min-w-0 flex-1 py-1 text-left leading-snug">{rotulo}</span>
        <ChevronDown size={14} aria-hidden className={`shrink-0 transition-transform ${aberto ? '' : '-rotate-90'}`} />
      </button>
      {aberto && <ul className={`${GRADE} mt-1`}>{children}</ul>}
    </div>
  );
}

function SeletorDeModulo({ nav, atual, recolhido }: { nav: Navegacao; atual: ModuloNav | null; recolhido: boolean }) {
  const nome = atual?.nome ?? 'Início';
  const sub = atual?.resumo ?? atual?.subtitulo ?? nav.inicio.titulo;
  return (
    <div className="ff-identidade-modulo" style={{ '--cor-modulo': atual?.cor ?? COR.inicio } as CSSProperties}>
    <Popover
      rotulo={`Área: ${nome}. Trocar de área`}
      alinhar="esquerda"
      // Na barra do desktop o painel passa da lateral e cobre o conteúdo (620 px: quatro colunas); na gaveta do celular ele
      // fica na largura dela, sem vazar (duas colunas).
      largura="w-[620px] max-[899px]:w-full"
      classeDoBotao={`ff-seletor-modulo ff-transicao flex w-full items-center gap-2.5 rounded-nav border text-left ${
        recolhido ? 'justify-center p-1.5' : 'p-2'
      }`}
      conteudoDoBotao={
        <>
          <IconeDoModulo icone={atual?.icone ?? 'inicio'} cor={atual?.cor ?? COR.inicio} tamanho={recolhido ? 36 : 32} variante="cheio" />
          {!recolhido && (
            <>
              {/* Nome e resumo quebram em linhas (nunca cortam): a lateral é estreita e o nome da área é o que diz onde se está. */}
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <span className="block text-[13px] font-semibold leading-tight text-texto">{nome}</span>
                <span className="mt-0.5 block text-[12px] leading-tight text-suave">{sub}</span>
              </span>
              <ChevronsUpDown size={14} aria-hidden className="shrink-0 text-suave" />
            </>
          )}
        </>
      }
    >
      {(fechar) => <AreasDoSeletor nav={nav} atual={atual} aoEscolher={fechar} />}
    </Popover>
    </div>
  );
}

/**
 * O que o seletor de áreas abre: a grade de módulos. As áreas em uso são links (a atual marcada) e, num grupo separado e
 * com nome próprio, vem o catálogo "Em breve" (texto e selo). A mesma fonte do hub: `nav.modulos`.
 */
export function AreasDoSeletor({ nav, atual, aoEscolher }: { nav: Navegacao; atual: ModuloNav | null; aoEscolher: () => void }) {
  const emUso = nav.modulos.filter((m) => m.href);
  const emBreve = nav.modulos.filter((m) => !m.href);
  const idAreas = useId();
  const idEmBreve = useId();
  return (
    // A altura desconta o que fica acima do painel (marca, contexto e o próprio seletor): a grade rola por dentro e o painel
    // nunca passa do pé da tela, nem na gaveta do celular.
    <div className="max-h-[min(70vh,calc(100dvh-250px))] overflow-y-auto overscroll-contain" onKeyDown={andarPelaGrade}>
      {/* avoid-ai-design-ignore: SD4 — rótulo de grupo em caixa alta, como os grupos do menu (contrato do shell). */}
      <p id={idAreas} className={`${ROTULO_DO_GRUPO} pt-2`}>
        Áreas
      </p>
      <ul aria-labelledby={idAreas} className={GRADE_DE_MODULOS}>
        <li>
          <BlocoDeModulo
            href={nav.inicio.href}
            nome={nav.inicio.titulo}
            sub="Todas as áreas"
            icone="inicio"
            cor={COR.inicio}
            atual={!atual}
            aoEscolher={aoEscolher}
          />
        </li>
        {emUso.map((m) => (
          <li key={m.chave}>
            <BlocoDeModulo
              href={m.href!}
              nome={m.nome}
              sub={m.resumo ?? m.subtitulo}
              icone={m.icone}
              cor={m.cor}
              atual={atual?.chave === m.chave}
              aoEscolher={aoEscolher}
            />
          </li>
        ))}
      </ul>
      {emBreve.length > 0 && (
        <>
          {/* avoid-ai-design-ignore: SD4 — rótulo de grupo em caixa alta, como os grupos do menu (contrato do shell). */}
          <p id={idEmBreve} className={`${ROTULO_DO_GRUPO} mt-1.5 border-t border-linha pt-3`}>
            Em breve
          </p>
          <ul aria-labelledby={idEmBreve} className={GRADE_DE_MODULOS}>
            {emBreve.map((m) => (
              <li key={m.chave}>
                <BlocoEmBreve nome={m.nome} sub={m.subtitulo} icone={m.icone} cadeado={m.cadeado} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const ROTULO_DO_GRUPO = 'px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-suave';
const GRADE_DE_MODULOS = 'ff-grade-modulos';
const BLOCO = 'ff-identidade-modulo ff-bloco-modulo';
// Nome e função quebram em linhas (nunca cortam): o bloco cresce com o texto.
const NOME_DO_BLOCO = 'mt-2.5 block text-[14px] leading-tight text-texto [overflow-wrap:anywhere]';
const FUNCAO_DO_BLOCO = 'mt-1 block text-[12px] leading-snug text-suave [overflow-wrap:anywhere]';

/** Setas andam pela grade como numa tela de ícones; o Tab continua passando por todos os blocos. */
function andarPelaGrade(e: KeyboardEvent<HTMLDivElement>) {
  const passo = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 }[e.key];
  if (passo === undefined || !(e.target instanceof HTMLElement) || !e.target.matches('a.ff-bloco-modulo')) return;
  const blocos = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('a.ff-bloco-modulo'));
  const topo = (b: HTMLElement) => Math.round(b.getBoundingClientRect().top);
  const colunas = blocos.filter((b) => topo(b) === topo(blocos[0])).length || 1;
  const salto = passo || (e.key === 'ArrowDown' ? colunas : -colunas);
  const alvo = blocos[blocos.indexOf(e.target) + salto];
  if (!alvo) return;
  e.preventDefault();
  alvo.focus();
}

function BlocoDeModulo({
  href,
  nome,
  sub,
  icone,
  cor,
  atual,
  aoEscolher,
}: {
  href: string;
  nome: string;
  sub: string;
  icone: Parameters<typeof Icone>[0]['nome'];
  cor: string;
  atual: boolean;
  aoEscolher: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={aoEscolher}
      aria-current={atual ? 'true' : undefined}
      className={`${BLOCO} ff-transicao`}
      style={{ '--cor-modulo': cor } as CSSProperties}
    >
      <IconeDoModulo icone={icone} cor={cor} tamanho={44} variante="cheio" />
      <span className={`ff-bloco-nome ${NOME_DO_BLOCO} font-semibold`}>{nome}</span>
      <span className={FUNCAO_DO_BLOCO}>{sub}</span>
    </Link>
  );
}

/**
 * Módulo do catálogo ainda sem tela: nome, finalidade e o selo, como texto. Não é link nem botão, não recebe foco e não
 * dispara nada; quem diz o estado é o rótulo do grupo e a palavra do selo (não há controle para marcar como desabilitado).
 * Sem cor de área: o ícone é só o contorno tracejado.
 */
function BlocoEmBreve({
  nome,
  sub,
  icone,
  cadeado,
}: {
  nome: string;
  sub: string;
  icone: Parameters<typeof Icone>[0]['nome'];
  cadeado?: boolean;
}) {
  return (
    <div className={BLOCO}>
      <IconeDoModulo icone={icone} cor={COR.futuro} tamanho={44} variante="futuro" />
      <span className={`${NOME_DO_BLOCO} font-medium`}>{nome}</span>
      <span className={FUNCAO_DO_BLOCO}>{sub}</span>
      <SeloEmBreve cadeado={cadeado} className="mt-1.5" />
    </div>
  );
}
