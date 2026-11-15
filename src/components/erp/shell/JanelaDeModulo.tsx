'use client';

/**
 * Janela de módulo (UX-MOD-2, piloto de 15/11/2026): a tela de uma área aberta por cima da página em que a pessoa estava.
 * A página de trás não sai do lugar; a janela é a mesma rota, interceptada (ver `src/lib/erp/janela.ts`), então o endereço
 * muda, o link direto e a recarga abrem a tela inteira, e o servidor confere o acesso como sempre.
 *
 * - Diálogo nativo (`showModal`), como o `Dialogo` do kit: o fundo fica inerte, o Tab não sai da janela, Escape e o toque
 *   no fundo pedem para fechar. Entrada aprovada em 09/11 (220 ms, 7 px, escala 0,98); fechar é imediato.
 * - Cabeçalho: ícone e nome da área, o contexto (parceiro e rede ou loja) e os botões Voltar, Minimizar, Expandir e Fechar.
 *   Abaixo, as abas da área na janela (as mesmas do menu). No celular a janela ocupa a tela.
 * - Voltar e Fechar andam no histórico: Voltar desfaz um passo dentro da janela; Fechar volta até a página de trás, como
 *   ela estava (inclusive quando a página de trás é a tela inteira de uma das abas).
 * - Alteração não salva: digitar num formulário que grava marca a janela; fechar, voltar, trocar de aba ou seguir um link
 *   pergunta antes, dentro da própria janela. Minimizada, a janela guarda tudo (nada é desmontado); seguir um link da página
 *   de trás com alteração pendente também pergunta. Recarregar ou sair do site pede a confirmação do navegador.
 */

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { contaComoRascunho, PASSOS_MAXIMOS_AO_FECHAR, type AreaDaJanela } from '@/lib/erp/janela';
import { IconeDoModulo } from '../ui/cabecalho';
import { classeDeBotao } from '../ui/estilos';

type Pedido = { tipo: 'fechar' } | { tipo: 'voltar' } | { tipo: 'ir'; href: string };

const BOTAO =
  'ff-transicao inline-grid h-11 w-11 shrink-0 place-items-center rounded-botao text-suave hover:bg-texto/5 hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

/** O formulário do campo, descrito para a regra pura de rascunho. */
function formularioDo(alvo: EventTarget | null) {
  if (!(alvo instanceof HTMLElement)) return null;
  const form = (alvo as HTMLInputElement).form ?? alvo.closest('form');
  if (!form) return null;
  return { metodo: form.getAttribute('method'), papel: form.getAttribute('role'), filtro: form.hasAttribute('data-filtro') || alvo.hasAttribute('data-filtro') };
}

interface Clique {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

/** Link que a janela deve tratar (navegação interna, clique simples, mesma aba). */
function linkInterno(evento: Clique): string | null {
  if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return null;
  const a = (evento.target as HTMLElement | null)?.closest?.('a[href]');
  if (!(a instanceof HTMLAnchorElement)) return null;
  if (a.target && a.target !== '_self') return null;
  if (a.hasAttribute('download')) return null;
  const href = a.getAttribute('href') ?? '';
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}

export function JanelaDeModulo({ area, contexto, children }: { area: AreaDaJanela; contexto: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const continuar = useRef<HTMLButtonElement>(null);
  const reabrir = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const endereco = `${caminho}?${busca.toString()}`;
  const idTitulo = useId();
  const idContexto = useId();

  const [minimizada, setMinimizada] = useState(false);
  const [cheia, setCheia] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [passos, setPassos] = useState(0);
  const voltando = useRef(false);
  const fechando = useRef(0);
  const enderecoAnterior = useRef<string | null>(null);

  // Abre ao montar, com o foco no título (o leitor de tela lê onde está). Fechar é desmontar: a rota sai da janela.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    el.querySelector<HTMLElement>('[data-ff-titulo]')?.focus();
    return () => {
      if (el.open) el.close();
    };
  }, []);

  // Minimizar fecha o diálogo SEM desmontar o conteúdo (rascunho, rolagem e aba ficam); restaurar abre de novo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (minimizada && el.open) {
      el.close();
      reabrir.current?.focus();
    } else if (!minimizada && !el.open && fechando.current === 0) {
      el.showModal();
      el.querySelector<HTMLElement>('[data-ff-titulo]')?.focus();
    }
  }, [minimizada]);

  // A página de trás não rola enquanto a janela está aberta (minimizada, volta a rolar).
  useEffect(() => {
    if (minimizada) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = antes;
    };
  }, [minimizada]);

  // Cada troca de endereço dentro da janela é um passo; ao fechar, volta o histórico até a rota sair da janela.
  useEffect(() => {
    const anterior = enderecoAnterior.current;
    enderecoAnterior.current = endereco;
    // Mesmo endereço (o React de desenvolvimento roda o efeito duas vezes ao montar) não é passo.
    if (anterior === null || anterior === endereco) return;
    if (fechando.current > 0) {
      if (fechando.current < PASSOS_MAXIMOS_AO_FECHAR) {
        fechando.current += 1;
        router.back();
      }
      return;
    }
    // Enquanto a tela carrega, o quadro aparece um instante antes de o endereço mudar: essa troca não é um passo.
    if (!area.abas.some((a) => a.href === anterior.split('?')[0])) return;
    // Lido antes: o atualizador do estado roda depois, quando o marcador já foi zerado.
    const voltou = voltando.current;
    voltando.current = false;
    setPassos((p) => (voltou ? Math.max(0, p - 1) : p + 1));
    setSujo(false);
    setPedido(null);
    setMinimizada(false);
  }, [endereco, router, area.abas]);

  // Com alteração pendente, recarregar ou sair do site pede a confirmação do navegador.
  useEffect(() => {
    if (!sujo) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sujo]);

  // Minimizada com alteração pendente: um link da página de trás desmontaria a janela; antes, ela volta e pergunta.
  useEffect(() => {
    if (!minimizada || !sujo) return;
    const interceptar = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      const href = linkInterno(e);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      setMinimizada(false);
      setPedido({ tipo: 'ir', href });
    };
    document.addEventListener('click', interceptar, true);
    return () => document.removeEventListener('click', interceptar, true);
  }, [minimizada, sujo]);

  // A pergunta aparece com o foco em "Continuar editando" (a escolha que não perde nada).
  useEffect(() => {
    if (pedido) continuar.current?.focus();
  }, [pedido]);

  function concluir(p: Pedido) {
    setPedido(null);
    setSujo(false);
    if (p.tipo === 'fechar') {
      fechando.current = 1;
      ref.current?.close();
      router.back();
    } else if (p.tipo === 'voltar') {
      voltando.current = true;
      router.back();
    } else {
      router.push(p.href);
    }
  }

  function pedir(p: Pedido) {
    if (sujo) setPedido(p);
    else concluir(p);
  }

  const textoDoPedido =
    pedido?.tipo === 'fechar' ? 'Fechar descarta o que foi digitado.' : pedido?.tipo === 'voltar' ? 'Voltar descarta o que foi digitado.' : 'Sair desta tela descarta o que foi digitado.';
  const rotuloDoDescarte = pedido?.tipo === 'fechar' ? 'Descartar e fechar' : pedido?.tipo === 'voltar' ? 'Descartar e voltar' : 'Descartar e sair';

  return (
    <>
      <dialog
        ref={ref}
        aria-labelledby={idTitulo}
        aria-describedby={idContexto}
        data-cheia={cheia ? 'true' : undefined}
        data-passos={passos}
        className="ff-dialogo ff-janela"
        onCancel={(e) => {
          e.preventDefault();
          if (pedido) setPedido(null);
          else pedir({ tipo: 'fechar' });
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pedido) pedir({ tipo: 'fechar' });
        }}
        onClickCapture={(e) => {
          if (!sujo) return;
          const href = linkInterno(e);
          if (!href) return;
          e.preventDefault();
          e.stopPropagation();
          setPedido({ tipo: 'ir', href });
        }}
        onInputCapture={(e) => {
          if (contaComoRascunho(formularioDo(e.target))) setSujo(true);
        }}
        onChangeCapture={(e) => {
          if (contaComoRascunho(formularioDo(e.target))) setSujo(true);
        }}
        onSubmitCapture={(e) => {
          // Enviar é salvar: o que foi digitado deixa de ser rascunho (se o servidor recusar, a tela mostra o erro).
          const form = e.target as HTMLFormElement;
          if (contaComoRascunho({ metodo: form.getAttribute('method'), papel: form.getAttribute('role'), filtro: form.hasAttribute('data-filtro') })) setSujo(false);
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-linha py-2 pl-4 pr-2">
            <IconeDoModulo icone={area.icone} cor={area.cor} tamanho={36} variante="cheio" />
            <div className="min-w-0 flex-1 pl-1">
              <h2 id={idTitulo} data-ff-titulo tabIndex={-1} className="break-words font-display text-[20px] font-normal leading-tight tracking-[-0.01em] outline-none">
                {area.nome}
              </h2>
              <p id={idContexto} className="mt-0.5 text-[12px] leading-snug text-suave [overflow-wrap:anywhere]">
                {contexto}
              </p>
            </div>
            <button type="button" className={BOTAO} aria-label="Voltar" title="Voltar" disabled={passos === 0} onClick={() => pedir({ tipo: 'voltar' })}>
              <ArrowLeft size={18} aria-hidden />
            </button>
            <button type="button" className={BOTAO} aria-label="Minimizar" title="Minimizar" onClick={() => setMinimizada(true)}>
              <Minus size={18} aria-hidden />
            </button>
            <button
              type="button"
              className={`${BOTAO} max-[699px]:hidden`}
              aria-label={cheia ? 'Restaurar o tamanho' : 'Expandir'}
              title={cheia ? 'Restaurar o tamanho' : 'Expandir'}
              aria-pressed={cheia}
              onClick={() => setCheia((v) => !v)}
            >
              {cheia ? <Minimize2 size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />}
            </button>
            <button type="button" className={BOTAO} aria-label="Fechar" title="Fechar" onClick={() => pedir({ tipo: 'fechar' })}>
              <X size={18} aria-hidden />
            </button>
          </header>
          <nav aria-label={`Seções de ${area.nome}`} className="shrink-0 border-b border-linha">
            <ul className="flex w-max min-w-full gap-1 overflow-x-auto px-3">
              {area.abas.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    aria-current={caminho === a.href ? 'page' : undefined}
                    className="ff-aba ff-transicao flex min-h-11 items-center whitespace-nowrap px-3 text-[14px] text-suave hover:text-texto aria-[current=page]:font-semibold aria-[current=page]:text-texto"
                  >
                    {a.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ff-janela-corpo min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-5 sm:px-6">{children}</div>
          {pedido && (
            <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-linha bg-atencao-fundo px-4 py-3">
              <p className="min-w-0 text-[14px] text-texto">
                <strong className="font-semibold">Há alteração não salva nesta janela.</strong> {textoDoPedido}
              </p>
              <div className="flex flex-wrap gap-2">
                <button ref={continuar} type="button" className={classeDeBotao('secundario')} onClick={() => setPedido(null)}>
                  Continuar editando
                </button>
                <button type="button" className={classeDeBotao('perigo')} onClick={() => concluir(pedido)}>
                  {rotuloDoDescarte}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
      {minimizada && (
        <button
          ref={reabrir}
          type="button"
          onClick={() => setMinimizada(false)}
          aria-label={`Reabrir ${area.nome}${sujo ? ', com alteração não salva' : ''}`}
          className="ff-janela-minimizada ff-transicao fixed bottom-3 right-3 z-40 inline-flex min-h-11 max-w-[calc(100vw-24px)] items-center gap-2 rounded-nav border border-linha-forte bg-painel py-1 pl-1.5 pr-3.5 text-[14px] font-semibold text-texto shadow-[var(--ff-sombra)] hover:bg-forte"
        >
          <IconeDoModulo icone={area.icone} cor={area.cor} tamanho={32} variante="cheio" />
          {area.nome}
          {sujo && <span aria-hidden className="h-2 w-2 rounded-full bg-atencao" />}
        </button>
      )}
    </>
  );
}
