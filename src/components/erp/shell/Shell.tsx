'use client';

/**
 * Casca interativa do shell: menu lateral fixo (desktop ≥ 900 px, recolhível,
 * escolha guardada no cookie `ff_menu`), gaveta à esquerda no celular (botão
 * Menu), barra superior (trilha, visão, busca ⌘K, notificações, usuário) e o
 * conteúdo. Nenhum destino some no celular: a gaveta tem o mesmo menu.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { itemAtivo, telasDaNavegacao } from '@/lib/erp/modulos';
import { comParceiroAtual, slugNoCaminho } from '@/lib/rodolfo/modulos';
import { Dialogo } from '../ui/Dialogo';
import { acaoGuardarMenu } from './acoes';
import { BuscaGlobal } from './BuscaGlobal';
import { MenuUsuario } from './MenuUsuario';
import { NavLateral, type EstadoDaNav } from './NavLateral';
import { Notificacoes } from './Notificacoes';
import { BOTAO_ICONE } from './Popover';
import { SeletorVisao } from './SeletorVisao';
import type { PropsDoShell, ResultadoDaBusca } from './tipos';
import { ProvedorDaTrilha, useTrilhaExtra, type ItemDaTrilha } from './trilha';

export function Shell(p: { props: PropsDoShell; children: ReactNode }) {
  return (
    <ProvedorDaTrilha>
      <Casca {...p} />
    </ProvedorDaTrilha>
  );
}

function Casca({ props, children }: { props: PropsDoShell; children: ReactNode }) {
  const caminho = usePathname();
  const [recolhido, setRecolhido] = useState(props.menuRecolhido);
  const [gaveta, setGaveta] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);

  const parceiros = props.visao.modo === 'nivel1' ? props.visao.parceiros : null;
  const nav = useMemo(
    () => (parceiros ? comParceiroAtual(props.navegacao, caminho, parceiros) : props.navegacao),
    [props.navegacao, caminho, parceiros],
  );

  const ativo = itemAtivo(nav, caminho);
  const estado: EstadoDaNav = {
    modulo: ativo?.modulo ?? null,
    hrefAtivo: ativo?.item.href ?? (caminho === nav.inicio.href ? nav.inicio.href : null),
  };

  // Trocar de tela fecha a gaveta.
  useEffect(() => setGaveta(false), [caminho]);

  const locais = useMemo<ResultadoDaBusca[]>(() => {
    const telas: ResultadoDaBusca[] = [
      { tipo: 'tela', rotulo: nav.inicio.titulo, detalhe: 'Início', href: nav.inicio.href },
      ...telasDaNavegacao(nav).map((t) => ({
        tipo: 'tela' as const,
        rotulo: t.rotulo,
        detalhe: `${t.modulo} · ${t.subtitulo}`,
        href: t.href,
      })),
    ];
    const dosParceiros: ResultadoDaBusca[] = (parceiros ?? []).map((p) => ({
      tipo: 'parceiro',
      rotulo: p.nome,
      detalhe: p.rotuloStatus,
      href: `/rodolfo/erp/${p.slug}`,
    }));
    return [...telas, ...dosParceiros];
  }, [nav, parceiros]);

  const slug = slugNoCaminho(caminho);
  const { buscarInsumos, buscarInsumosDoParceiro } = props;
  const buscarNoServidor = useMemo(() => {
    if (buscarInsumos) return buscarInsumos;
    if (buscarInsumosDoParceiro && slug) return (q: string) => buscarInsumosDoParceiro(slug, q);
    return undefined;
  }, [buscarInsumos, buscarInsumosDoParceiro, slug]);

  function alternarMenu() {
    const novo = !recolhido;
    setRecolhido(novo);
    void acaoGuardarMenu(novo);
  }

  // Módulo › tela (› o que a página acrescentar: o insumo aberto, "Editar"...).
  const extra = useTrilhaExtra();
  const trilha: ItemDaTrilha[] = [
    ...(ativo ? [{ rotulo: ativo.modulo.nome }, { rotulo: ativo.item.rotulo, href: extra.length ? ativo.item.href : undefined }] : []),
    ...extra,
  ];

  return (
    <div
      className={`grid min-h-dvh grid-cols-[minmax(0,1fr)] ${
        recolhido ? 'min-[900px]:grid-cols-[68px_minmax(0,1fr)]' : 'min-[900px]:grid-cols-[232px_minmax(0,1fr)]'
      }`}
    >
      <aside
        aria-label="Navegação"
        className="sticky top-0 hidden h-dvh border-r border-linha bg-lateral min-[900px]:block"
      >
        <NavLateral
          nav={nav}
          estado={estado}
          contexto={props.contexto}
          versao={props.versao}
          recolhido={recolhido}
          aoRecolher={alternarMenu}
        />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-linha bg-fundo px-2 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <button
              ref={botaoMenu}
              type="button"
              onClick={() => setGaveta(true)}
              aria-label="Abrir o menu"
              aria-expanded={gaveta}
              aria-controls="ff-gaveta"
              className={`${BOTAO_ICONE} min-[900px]:hidden`}
            >
              <Menu size={20} aria-hidden />
            </button>
            <nav aria-label="Você está em" className="hidden min-w-0 sm:block">
              <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <li className="shrink-0">
                  <Link href={nav.inicio.href} className="ff-transicao rounded-[5px] text-suave hover:text-texto">
                    Início
                  </Link>
                </li>
                {trilha.map((t, n) => (
                  <li key={t.rotulo + n} className="flex min-w-0 items-center gap-1.5">
                    <ChevronRight size={14} aria-hidden className="shrink-0 text-suave" />
                    {t.href && n < trilha.length - 1 ? (
                      <Link href={t.href} className="ff-transicao truncate rounded-[5px] text-suave hover:text-texto">
                        {t.rotulo}
                      </Link>
                    ) : (
                      <span
                        className={`truncate ${n === trilha.length - 1 ? 'font-medium text-texto' : 'text-suave'}`}
                        aria-current={n === trilha.length - 1 ? 'page' : undefined}
                      >
                        {t.rotulo}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <SeletorVisao visao={props.visao} />
            <BuscaGlobal locais={locais} buscarNoServidor={buscarNoServidor} />
            <Notificacoes itens={props.notificacoes} />
            <MenuUsuario usuario={props.usuario} tema={props.tema} links={props.links} sair={props.sair} />
          </div>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <Dialogo id="ff-gaveta" aberto={gaveta} aoFechar={() => setGaveta(false)} titulo="Menu" gaveta>
        <div className="min-h-0 flex-1">
          <NavLateral nav={nav} estado={estado} contexto={props.contexto} versao={props.versao} />
        </div>
      </Dialogo>
    </div>
  );
}
