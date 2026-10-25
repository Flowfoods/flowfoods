'use client';

/**
 * Casca interativa do shell: menu lateral fixo (desktop ≥ 900 px, recolhível,
 * escolha guardada no cookie `ff_menu`), gaveta à esquerda no celular (botão
 * Menu), barra superior (trilha, visão, busca ⌘K, notificações, usuário) e o
 * conteúdo. Nenhum destino some no celular: a gaveta tem o mesmo menu.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { entradaDoCaminho, caixaDaTela, itemFechado } from '@/lib/erp/ajuda-rota';
import { abasDaArea, acoesDaNavegacao, itemAtivo, montarTrilha, telasDaNavegacao } from '@/lib/erp/modulos';
import { comParceiroAtual, slugNoCaminho } from '@/lib/rodolfo/modulos';
import { Abas } from '../ui/abas';
import { Dialogo } from '../ui/Dialogo';
import { ContextoDaAjuda } from '../ui/link-de-ajuda';
import { ContextoDaCaixa } from '../ui/caixa-da-tela';
import { assinaturaDaPreferencia, CaixaDeAula, GavetaDeAjuda, PerguntaDasDicas, preferenciaEfetiva, type Otimista } from './ajuda';
import { ProvedorDosPontos, type TelaNoCard } from './pontos';
import { IndicadorDeNavegacao } from './indicador-navegacao';
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
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const [secaoDaAjuda, setSecaoDaAjuda] = useState<string | null>(null);
  const [otimista, setOtimista] = useState<Otimista | null>(null);
  const botaoAjuda = useRef<HTMLButtonElement>(null);
  const retornoDaAjuda = useRef<HTMLElement | null>(null);

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
  useEffect(() => {
    setGaveta(false);
    setAjudaAberta(false);
  }, [caminho]);

  // Ajuda (0.6): a entrada da tela vem da rota; a caixa, da preferência (a mesma conta no servidor e aqui).
  const ajuda = props.ajuda;
  const entradaDaTela = ajuda ? entradaDoCaminho(caminho, ajuda.entradas) : null;
  const preferencia = preferenciaEfetiva(ajuda?.preferencia ?? null, otimista);
  const estadoDaCaixa = entradaDaTela && ajuda?.acoes ? caixaDaTela(entradaDaTela, preferencia) : null;
  const assinatura = assinaturaDaPreferencia(ajuda?.preferencia ?? null);

  const abrirAjuda = useCallback(
    (secao?: string, origem?: HTMLElement | null) => {
      const ativoNoDocumento = document.activeElement as HTMLElement | null;
      retornoDaAjuda.current = origem ?? (ativoNoDocumento && ativoNoDocumento !== document.body ? ativoNoDocumento : botaoAjuda.current);
      setSecaoDaAjuda(secao ?? null);
      setAjudaAberta(true);
    },
    [],
  );

  // Atalho "?" (Shift+/): fora de campo, sem outra janela aberta.
  const temAjuda = entradaDaTela !== null;
  useEffect(() => {
    if (!temAjuda) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable)) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      abrirAjuda(undefined, botaoAjuda.current);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [temAjuda, abrirAjuda]);

  const locais = useMemo<ResultadoDaBusca[]>(() => {
    const telas: ResultadoDaBusca[] = [
      { tipo: 'tela', rotulo: nav.inicio.titulo, detalhe: 'Início', href: nav.inicio.href },
      ...telasDaNavegacao(nav).map((t) => ({
        tipo: 'tela' as const,
        rotulo: t.rotulo,
        detalhe: `${t.modulo} · ${t.subtitulo}`,
        href: t.href,
      })),
      // Ações das áreas que a pessoa vê E pode fazer (o filtro é de `modulosDoParceiro`; aqui só se lista).
      ...acoesDaNavegacao(nav).map((a) => ({
        tipo: 'acao' as const,
        rotulo: a.rotulo,
        detalhe: `${a.modulo} · ${a.subtitulo}`,
        href: a.href,
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

  // Área › aba (› o que a página acrescentar: o insumo aberto, "Novo insumo", "Editar"...). A área leva à entrada dela.
  const extra = useTrilhaExtra();
  const trilha: ItemDaTrilha[] = montarTrilha(ativo, extra);
  const abas = abasDaArea(nav, ativo);
  const outrasDaArea = abas ? { area: abas.area, telas: abas.abas.filter((a) => a.href !== ativo?.item.href).map((a) => ({ href: a.href, rotulo: a.rotulo })) } : null;

  // Ajuda da tela (24/10): a linha "Como funciona esta tela" fica abaixo do título (PageHeader, via ContextoDaCaixa)
  // e abre o card flutuante; o card abre sozinho na 1ª visita e de novo 7 dias depois, enquanto a caixa valer.
  const acoesDaAjuda = ajuda?.acoes ?? null;
  const aoFecharCaixa = useCallback(
    (fechada: string) =>
      setOtimista((o) => ({ assinatura, fechadas: [...(o?.assinatura === assinatura ? o.fechadas : []), fechada], dicasLigadas: o?.assinatura === assinatura ? o.dicasLigadas : undefined, escolhida: o?.assinatura === assinatura ? o.escolhida : undefined })),
    [assinatura],
  );
  const aoEscolherDicas = useCallback(
    (v: 'manter' | 'desligar') => setOtimista((o) => ({ assinatura, fechadas: o?.assinatura === assinatura ? o.fechadas : [], dicasLigadas: v === 'manter', escolhida: true })),
    [assinatura],
  );
  const caixa = entradaDaTela && ajuda && (
    <CaixaDeAula entrada={entradaDaTela} estado={estadoDaCaixa} acoes={acoesDaAjuda} aoFechar={aoFecharCaixa} aoEscolher={aoEscolherDicas} />
  );
  const telaNoCard = useMemo<TelaNoCard | null>(() => {
    if (!entradaDaTela) return null;
    const caixaFechada = itemFechado(entradaDaTela);
    return {
      titulo: entradaDaTela.titulo,
      blocos: entradaDaTela.aula,
      pendente: !!estadoDaCaixa,
      mudou: !!estadoDaCaixa?.mudou,
      extra: estadoDaCaixa?.perguntar && acoesDaAjuda ? <PerguntaDasDicas acoes={acoesDaAjuda} aoEscolher={aoEscolherDicas} /> : null,
      nunca:
        estadoDaCaixa && acoesDaAjuda
          ? { acao: acoesDaAjuda.fechar, campo: 'caixa', valor: caixaFechada, aoEnviar: () => aoFecharCaixa(caixaFechada) }
          : null,
    };
  }, [entradaDaTela, estadoDaCaixa, acoesDaAjuda, aoEscolherDicas, aoFecharCaixa]);

  const contextoDaAjuda = useMemo(() => ({ abrir: abrirAjuda, disponivel: temAjuda }), [abrirAjuda, temAjuda]);

  return (
    <ContextoDaAjuda.Provider value={contextoDaAjuda}>
      <Suspense fallback={null}>
        <IndicadorDeNavegacao />
      </Suspense>
      <ProvedorDosPontos
        chave={entradaDaTela?.chave ?? null}
        pontos={entradaDaTela?.pontos ?? []}
        caminho={caminho}
        preferencia={ajuda?.preferencia ? preferencia : null}
        ajuda={ajuda}
        tela={telaNoCard}
        podeAbrirSozinho={!ajudaAberta}
        aoVerPassoAPasso={(secao, origem) => abrirAjuda(secao ?? undefined, origem)}
      >
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
              {/* Recorta na própria caixa: sem espaço (nível 1 a 1024, com dois seletores), a trilha some por trás do corte e nunca
                  passa por baixo dos botões da direita. */}
              <nav aria-label="Você está em" className="hidden min-w-0 overflow-x-clip sm:block">
                <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  <li className="shrink-0">
                    <Link href={nav.inicio.href} className="ff-transicao rounded-[5px] text-suave hover:text-texto">
                      Início
                    </Link>
                  </li>
                  {/* Abaixo de 1280 px (tablet em pé e deitado, notebook de 1024), os níveis do meio dão lugar a "…": fica o pai e a
                      tela atual, sem cortar o nome (antes o corte era em 1024 e, a 1024, a trilha de 6 níveis virava "Et… › Im… › Vil…"). */}
                  {trilha.length > 2 && (
                    <li className="flex shrink-0 items-center gap-1.5 text-suave xl:hidden">
                      <ChevronRight size={14} aria-hidden className="shrink-0" />
                      <span title={trilha.slice(0, -2).map((t) => t.rotulo).join(' › ')}>…</span>
                    </li>
                  )}
                  {trilha.map((t, n) => (
                    // Sem espaço, o nome da tela atual é o último a encolher: os níveis de cima cedem três vezes mais rápido.
                    <li key={t.rotulo + n} className={`min-w-0 items-center gap-1.5 ${n < trilha.length - 2 ? 'hidden xl:flex' : 'flex'} ${n < trilha.length - 1 ? 'shrink-[3]' : ''}`}>
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

            {/* Desde que a trilha aparece (640 px), os botões não encolhem: quem cede é a trilha (já corta com "…"). Sem isso,
                com uma trilha longa os dois lados encolhiam juntos e o menu da pessoa passava da tela (E4, jornada 3, a 1024;
                E5.1, faturamento do dia, a 820). */}
            <div className="flex min-w-0 items-center gap-1 sm:shrink-0 sm:gap-2">
              <SeletorVisao visao={props.visao} />
              <BuscaGlobal locais={locais} buscarNoServidor={buscarNoServidor} />
              {entradaDaTela && (
                <button
                  ref={botaoAjuda}
                  type="button"
                  onClick={() => abrirAjuda(undefined, botaoAjuda.current)}
                  aria-label="Ajuda desta tela"
                  aria-haspopup="dialog"
                  aria-expanded={ajudaAberta}
                  aria-keyshortcuts="?"
                  title="Ajuda desta tela (?)"
                  className={BOTAO_ICONE}
                >
                  <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full border border-current text-[13px] font-semibold leading-none">
                    ?
                  </span>
                </button>
              )}
              <Notificacoes itens={props.notificacoes} />
              <MenuUsuario usuario={props.usuario} tema={props.tema} links={props.links} sair={props.sair} />
            </div>
          </header>

          <main id="conteudo" className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
            {abas && (
              <Abas
                rotulo={`Seções de ${abas.area}`}
                abas={abas.abas.map((a) => ({ href: a.href, rotulo: a.rotulo, ativa: a.href === ativo?.item.href }))}
              />
            )}
            {/* A caixa "Como funciona" vai para baixo do título (PageHeader): o título vem primeiro. */}
            <ContextoDaCaixa.Provider value={caixa}>{children}</ContextoDaCaixa.Provider>
          </main>
        </div>

        {entradaDaTela && ajuda && (
          <GavetaDeAjuda
            aberta={ajudaAberta}
            aoFechar={() => setAjudaAberta(false)}
            entrada={entradaDaTela}
            secao={secaoDaAjuda}
            outras={outrasDaArea}
            preferencia={preferencia}
            acoes={ajuda.acoes}
            contato={ajuda.contato}
            voltarPara={retornoDaAjuda}
            aoReligar={() => setOtimista({ assinatura, fechadas: [], dicasLigadas: true, escolhida: true })}
          />
        )}

        <Dialogo id="ff-gaveta" aberto={gaveta} aoFechar={() => setGaveta(false)} titulo="Menu" gaveta>
          <div className="min-h-0 flex-1">
            <NavLateral nav={nav} estado={estado} contexto={props.contexto} versao={props.versao} />
          </div>
        </Dialogo>
      </div>
      </ProvedorDosPontos>
    </ContextoDaAjuda.Provider>
  );
}
