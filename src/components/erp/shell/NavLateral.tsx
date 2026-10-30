'use client';

/**
 * Conteúdo do menu lateral (o mesmo na barra fixa do desktop e na gaveta do
 * celular): marca, contexto, SELETOR DE ÁREA no topo, os grupos da área
 * (abrem e fecham; cada item é uma aba), item ativo com `aria-current` e o indicador na cor da área de
 * 2 px, e a versão no rodapé. Recolhido (desktop): só ícones, com nome
 * acessível e dica.
 */

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
// avoid-ai-design-ignore: I3 — Check marca estado (opção escolhida, mensagem entregue), não é enfeite.
import { Check, ChevronDown, ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { COR, type ModuloNav, type Navegacao } from '@/lib/erp/modulos';
import { IconeDoModulo } from '../ui/cabecalho';
import { Marca } from '../ui/Marca';
import { Icone } from './icones';
import { Popover } from './Popover';

export interface EstadoDaNav {
  /** Área mostrada no menu (a do item ativo; no hub, nenhuma). */
  modulo: ModuloNav | null;
  hrefAtivo: string | null;
}

// 44 px na gaveta (toque); 40 px na barra fixa do desktop (≥ 900 px).
const ITEM =
  'ff-nav-item ff-identidade-modulo ff-transicao flex min-h-11 min-[900px]:min-h-10 items-center gap-3 rounded-[5px] px-3 py-1.5 text-[14px] text-suave hover:text-texto';

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

      {!recolhido && <p className="truncate px-4 pt-3 text-[12px] text-suave">{contexto}</p>}

      <div className={`shrink-0 ${recolhido ? 'px-2 pt-3' : 'px-3 pt-2'}`}>
        <SeletorDeModulo nav={nav} atual={modulo} recolhido={recolhido} />
      </div>

      <nav aria-label="Menu" className={`min-h-0 flex-1 overflow-y-auto pb-4 ${recolhido ? 'px-2' : 'px-3'}`}>
        {noHub ? (
          <ul className="mt-3 space-y-0.5">
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
              <ul key={g.rotulo} className="mt-3 space-y-0.5">
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
            className="ff-transicao inline-grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto"
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
      className={`${ITEM} ${recolhido ? 'justify-center px-0' : ''}`}
      style={{ '--cor-modulo': cor } as CSSProperties}
    >
      <Icone nome={icone} size={18} className="ff-nav-icone shrink-0" />
      {/* O nome de uma área é longo ("Estoque e Movimentações"): quebra em até 2 linhas em vez de cortar. */}
      <span className={recolhido ? 'sr-only' : 'line-clamp-2 min-w-0 leading-snug'}>{rotulo}</span>
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
        <ul className="mt-1 space-y-0.5">{children}</ul>
      </div>
    );
  }
  return (
    <div className="ff-identidade-modulo mt-4" style={{ '--cor-modulo': cor } as CSSProperties}>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="ff-transicao flex min-h-11 w-full items-center gap-2 rounded-[5px] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-suave hover:text-texto min-[900px]:min-h-8"
      >
        <Icone nome={icone} size={13} aria-hidden className="ff-nav-icone shrink-0" />
        {/* avoid-ai-design-ignore: SD4 — grupo do menu em caixa alta é pedido do contrato do shell (só aqui e no hub). */}
        <span className="min-w-0 flex-1 py-1 text-left leading-snug">{rotulo}</span>
        <ChevronDown size={14} aria-hidden className={`shrink-0 transition-transform ${aberto ? '' : '-rotate-90'}`} />
      </button>
      {aberto && <ul className="mt-1 space-y-0.5">{children}</ul>}
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
      largura="w-[280px]"
      classeDoBotao={`ff-seletor-modulo ff-transicao flex w-full items-center gap-3 rounded-[10px] border text-left ${
        recolhido ? 'justify-center p-1.5' : 'p-2'
      }`}
      conteudoDoBotao={
        <>
          <IconeDoModulo icone={atual?.icone ?? 'inicio'} cor={atual?.cor ?? COR.inicio} tamanho={36} />
          {!recolhido && (
            <>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[14px] font-semibold leading-tight text-texto">{nome}</span>
                <span className="block truncate text-[12px] text-suave">{sub}</span>
              </span>
              <ChevronsUpDown size={16} aria-hidden className="shrink-0 text-suave" />
            </>
          )}
        </>
      }
    >
      {(fechar) => (
        <ul aria-label="Áreas" className="max-h-[70vh] overflow-y-auto">
          <li>
            <OpcaoDeModulo
              href={nav.inicio.href}
              nome={nav.inicio.titulo}
              sub="Todas as áreas"
              icone="inicio"
              cor={COR.inicio}
              atual={!atual}
              aoEscolher={fechar}
            />
          </li>
          {nav.modulos.map((m) => (
            <li key={m.chave}>
              <OpcaoDeModulo
                href={m.href}
                nome={m.nome}
                sub={m.href ? (m.resumo ?? m.subtitulo) : 'Em breve'}
                icone={m.icone}
                cor={m.cor}
                atual={atual?.chave === m.chave}
                aoEscolher={fechar}
              />
            </li>
          ))}
        </ul>
      )}
    </Popover>
    </div>
  );
}

function OpcaoDeModulo({
  href,
  nome,
  sub,
  icone,
  cor,
  atual,
  aoEscolher,
}: {
  href: string | null;
  nome: string;
  sub: string;
  icone: Parameters<typeof Icone>[0]['nome'];
  cor: string;
  atual: boolean;
  aoEscolher: () => void;
}) {
  const corpo = (
    <>
      <IconeDoModulo icone={icone} cor={cor} tamanho={32} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] text-texto ${atual ? 'font-semibold' : 'font-medium'}`}>{nome}</span>
        <span className="block truncate text-[12px] text-suave">{sub}</span>
      </span>
      {atual && <Check size={16} aria-hidden className="shrink-0 text-texto" />}
    </>
  );
  const classe = 'ff-identidade-modulo ff-opcao-modulo flex min-h-11 w-full items-center gap-3 rounded-[8px] px-2 py-1.5 text-left';
  const identidade = { '--cor-modulo': cor } as CSSProperties;
  if (!href) {
    return (
      <div aria-disabled="true" className={classe} style={identidade}>
        {corpo}
      </div>
    );
  }
  return (
    <Link
      href={href}
      onClick={aoEscolher}
      aria-current={atual ? 'true' : undefined}
      className={`${classe} ff-transicao`}
      style={identidade}
    >
      {corpo}
    </Link>
  );
}
