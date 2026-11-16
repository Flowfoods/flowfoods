'use client';

/**
 * Janela de módulo (UX-MOD-2, piloto de 15/11/2026): a tela de uma área aberta por cima da página em que a pessoa estava.
 * A página de trás não sai do lugar; a janela é a mesma rota, interceptada (ver `src/lib/erp/janela.ts`), então o endereço
 * muda, o link direto e a recarga abrem a tela inteira, e o servidor confere o acesso como sempre.
 *
 * - Diálogo nativo (`showModal`), como o `Dialogo` do kit: o fundo fica inerte, o Tab não sai da janela, Escape e o toque
 *   no fundo pedem para fechar. Entrada aprovada em 09/11 (220 ms, 7 px, escala 0,98); fechar é imediato. A página de trás
 *   não rola enquanto a janela está aberta (regra de CSS, sem mexer no estilo que o `Dialogo` guarda e devolve).
 * - Cabeçalho: ícone e nome da área, o contexto (parceiro e rede ou loja) e os botões Voltar, Minimizar, Expandir e Fechar.
 *   Abaixo, as abas da área na janela (as mesmas do menu). No celular a janela ocupa a tela.
 * - A janela é UMA entrada no histórico do navegador: trocar de aba e seguir link para outra tela da janela substituem o
 *   endereço. O Voltar da janela anda pela pilha do que foi visto nela; Fechar (e o voltar do navegador) volta à página de
 *   trás. Se o histórico não chegar lá, Fechar vai para a página de trás.
 * - Alteração não salva: na hora de fechar, voltar, trocar de aba, seguir um link ou abrir a busca, a janela confere os
 *   formulários que gravam; com campo diferente do que a tela desenhou e não enviado assim (ou enviado e com erro na tela),
 *   ela pergunta antes, dentro da própria janela. Cada formulário conta sozinho. Minimizada, a janela guarda tudo (nada é
 *   desmontado) e um link da página de trás também pergunta. Recarregar ou sair do site pede a confirmação do navegador.
 * - Foco: abre no nome da janela; ao minimizar, vai para o botão de reabrir (na barra do topo); ao fechar, volta a quem abriu
 *   (ou ao título da página de trás, se quem abriu sumiu, como o menu do celular).
 */

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Maximize2, Minimize2, Minus, X } from 'lucide-react';
import {
  caminhoDe,
  contaComoRascunho,
  ehDaJanela,
  formularioComRascunho,
  fotografiaDosCampos,
  ID_DA_JANELA_NA_BARRA,
  ID_DA_JANELA_NO_CONTEUDO,
  PASSOS_MAXIMOS_AO_FECHAR,
  proximaPilha,
  type AreaDaJanela,
  type CampoDoRascunho,
} from '@/lib/erp/janela';
import { IconeDoModulo } from '../ui/cabecalho';
import { ContextoDaCaixa } from '../ui/caixa-da-tela';
import { classeDeBotao } from '../ui/estilos';
import { destinoDoClique, useMolduraDaJanela } from './MolduraDaJanela';

type Pedido =
  | { tipo: 'fechar' }
  | { tipo: 'voltar' }
  | { tipo: 'ir'; href: string }
  | { tipo: 'busca'; tecla: KeyboardEventInit };

/** Quanto Fechar espera o histórico chegar à página de trás antes de ir direto para ela. */
const ESPERA_AO_FECHAR_MS = 1500;

const BOTAO =
  'ff-transicao inline-grid h-11 w-11 shrink-0 place-items-center rounded-botao text-suave hover:bg-texto/5 hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

/** Erro que a tela mostra depois de um envio: campo marcado como inválido, alerta ou o texto de erro do kit. */
const ERRO_NA_TELA = '[aria-invalid="true"], [role="alert"], p.text-erro, span.text-erro';

const DESCRICAO_DO_PEDIDO: Record<Pedido['tipo'], { texto: string; rotulo: string }> = {
  fechar: { texto: 'Fechar descarta o que foi digitado.', rotulo: 'Descartar e fechar' },
  voltar: { texto: 'Voltar descarta o que foi digitado.', rotulo: 'Descartar e voltar' },
  ir: { texto: 'Sair desta tela descarta o que foi digitado.', rotulo: 'Descartar e sair' },
  busca: { texto: 'A busca pode levar a outra tela e descartar o que foi digitado.', rotulo: 'Abrir a busca mesmo assim' },
};

/** Devolve o foco a quem abriu a janela; se ele sumiu (o menu do celular), ao título da página de trás. */
function devolverFoco(alvo: HTMLElement | null) {
  const visivel = (x: HTMLElement) => x.isConnected && x.getClientRects().length > 0 && !x.closest('[inert], dialog:not([open])');
  if (alvo && visivel(alvo)) {
    alvo.focus({ preventScroll: true });
    return;
  }
  const titulo = document.querySelector<HTMLElement>('#conteudo h1');
  if (!titulo) return;
  if (!titulo.hasAttribute('tabindex')) {
    titulo.setAttribute('tabindex', '-1');
    titulo.addEventListener('blur', () => titulo.removeAttribute('tabindex'), { once: true });
  }
  titulo.focus({ preventScroll: true });
}

export function JanelaDeModulo({
  base,
  area,
  contexto,
  aviso,
  children,
}: {
  /** `/rodolfo/erp/<slug>`. */
  base: string;
  area: AreaDaJanela;
  contexto: string;
  /** A situação do parceiro (o mesmo aviso do topo da página de trás), quando há. */
  aviso?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titulo = useRef<HTMLParagraphElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const botaoVoltar = useRef<HTMLButtonElement>(null);
  const continuar = useRef<HTMLButtonElement>(null);
  const reabrirNaBarra = useRef<HTMLButtonElement>(null);
  const reabrirNoConteudo = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const caminho = usePathname() ?? '';
  const busca = useSearchParams()?.toString() ?? '';
  const endereco = busca ? `${caminho}?${busca}` : caminho;
  const moldura = useMolduraDaJanela();
  const fundo = moldura?.fundo ?? base;
  const idContexto = useId();

  const [minimizada, setMinimizada] = useState(false);
  const [cheia, setCheia] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [pilha, setPilha] = useState<string[]>([]);
  const [sujaAoMinimizar, setSujaAoMinimizar] = useState(false);
  const [lugares, setLugares] = useState<{ barra: HTMLElement; conteudo: HTMLElement } | null>(null);

  const minimizadaAgora = useRef(false);
  const fechando = useRef<{ passos: number } | null>(null);
  const espera = useRef<number | null>(null);
  const origem = useRef<HTMLElement | null | undefined>(undefined);
  const envios = useRef(new WeakMap<HTMLFormElement, string>());
  const liberarAtalho = useRef(false);
  const voltarComFoco = useRef(false);
  const fundoAtual = useRef(fundo);
  fundoAtual.current = fundo;
  // O endereço completo da página de trás (com os filtros), para Fechar quando o histórico não chega lá.
  const enderecoDoFundo = useRef<() => string>(() => fundo);
  enderecoDoFundo.current = moldura?.enderecoDoFundo ?? (() => fundo);
  const focoAntesDaPergunta = useRef<HTMLElement | null>(null);
  const caminhoAnterior = useRef(caminho);

  /** Se algum formulário da janela guarda alteração não salva (avaliado na hora: ver `formularioComRascunho`). */
  const temRascunho = useCallback((): boolean => {
    const d = ref.current;
    if (!d) return false;
    return Array.from(d.querySelectorAll('form')).some((form) => {
      const conta = contaComoRascunho({ metodo: form.getAttribute('method'), papel: form.getAttribute('role'), filtro: form.hasAttribute('data-filtro') });
      if (!conta) return false;
      return formularioComRascunho({
        campos: form.elements as unknown as ArrayLike<CampoDoRascunho>,
        enviado: envios.current.get(form) ?? null,
        comErro: form.querySelector(ERRO_NA_TELA) !== null,
      });
    });
  }, []);

  // Abre ao montar, com o foco no nome da janela (o leitor de tela lê onde está). Guarda quem abriu, para devolver o foco.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (origem.current === undefined) {
      const ativo = document.activeElement;
      origem.current = ativo instanceof HTMLElement && ativo !== document.body && !el.contains(ativo) ? ativo : null;
    }
    if (!el.open) el.showModal();
    titulo.current?.focus();
    const barra = document.getElementById(ID_DA_JANELA_NA_BARRA);
    const conteudo = document.getElementById(ID_DA_JANELA_NO_CONTEUDO);
    setLugares(barra && conteudo ? { barra, conteudo } : null);
    return () => {
      if (espera.current) window.clearTimeout(espera.current);
      if (el.open) el.close();
      // Fechar, Escape, o fundo ou o voltar do navegador levam à página de trás: o foco volta a quem abriu. Seguir para
      // outra página não mexe no foco (a página nova cuida dele).
      const voltouAoFundo = fechando.current !== null || caminhoDe(window.location.pathname) === fundoAtual.current;
      const alvo = origem.current ?? null;
      if (voltouAoFundo) requestAnimationFrame(() => devolverFoco(alvo));
    };
  }, []);

  // Minimizar fecha o diálogo SEM desmontar o conteúdo (rascunho, rolagem e aba ficam); restaurar abre de novo.
  useEffect(() => {
    minimizadaAgora.current = minimizada;
    const el = ref.current;
    if (!el) return;
    if (minimizada) {
      if (el.open) el.close();
      const visivel = [reabrirNaBarra.current, reabrirNoConteudo.current].find((b) => b && b.getClientRects().length > 0);
      visivel?.focus();
    } else if (!el.open && !fechando.current) {
      el.showModal();
      titulo.current?.focus();
    }
  }, [minimizada]);

  // Cada endereço visto na janela entra na pilha do Voltar. Um endereço fora das telas da janela é o de antes, enquanto a
  // tela carrega, ou o de depois, ao sair: não é passo. Chegar a uma tela da janela pelo menu de trás reabre a minimizada.
  useEffect(() => {
    if (fechando.current || !ehDaJanela(caminho, base)) return;
    setPilha((p) => proximaPilha(p, endereco));
    setPedido(null);
    setMinimizada(false);
  }, [endereco, caminho, base]);

  // Trocar de tela começa do alto; trocar só o filtro mantém a rolagem.
  useEffect(() => {
    if (caminhoAnterior.current === caminho) return;
    caminhoAnterior.current = caminho;
    if (ehDaJanela(caminho, base)) corpo.current?.scrollTo({ top: 0 });
  }, [caminho, base]);

  // Voltar desligou com o foco nele: o foco vai para o nome da janela, não para o corpo da página.
  useEffect(() => {
    if (pilha.length > 1 || !voltarComFoco.current) return;
    voltarComFoco.current = false;
    titulo.current?.focus();
  }, [pilha.length]);

  // Fechar volta o histórico até sair da janela. Cada passo é um `popstate`; se o histórico não chegar à página de trás no
  // limite de passos ou de tempo, a janela vai direto para ela.
  useEffect(() => {
    const aoVoltar = () => {
      const f = fechando.current;
      if (!f || !ehDaJanela(window.location.pathname, base)) return;
      if (f.passos >= PASSOS_MAXIMOS_AO_FECHAR) {
        router.replace(enderecoDoFundo.current(), { scroll: false });
        return;
      }
      f.passos += 1;
      armarEspera();
      window.history.back();
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
    // `armarEspera` só usa refs e o roteador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, router]);

  // Com alteração pendente, recarregar ou sair do site pede a confirmação do navegador.
  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => {
      if (!temRascunho()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [temRascunho]);

  // Minimizada: um link da página de trás desmontaria a janela (ou trocaria a tela dela). Com alteração pendente, ela volta
  // e pergunta antes. Sem alteração, um link para uma tela da janela reabre a janela nela, substituindo o endereço (a janela
  // continua uma entrada só no histórico); para a tela que ela já mostra, só reabre.
  useEffect(() => {
    if (!minimizada) return;
    const interceptar = (e: MouseEvent) => {
      if (e.defaultPrevented || ref.current?.contains(e.target as Node)) return;
      const destino = destinoDoClique(e);
      if (!destino) return;
      const alvo = destino.pathname + destino.search + destino.hash;
      const daJanela = ehDaJanela(destino.pathname, base);
      // A tela que a janela já mostra: só reabre (nada sai, nada se descarta), com ou sem alteração.
      const mesmaTela = daJanela && destino.pathname + destino.search === window.location.pathname + window.location.search;
      if (mesmaTela) {
        e.preventDefault();
        e.stopPropagation();
        setMinimizada(false);
        return;
      }
      if (temRascunho()) {
        e.preventDefault();
        e.stopPropagation();
        setMinimizada(false);
        perguntar({ tipo: 'ir', href: alvo });
        return;
      }
      if (!daJanela) return;
      e.preventDefault();
      e.stopPropagation();
      setMinimizada(false);
      ir(alvo);
    };
    document.addEventListener('click', interceptar, true);
    return () => document.removeEventListener('click', interceptar, true);
    // `perguntar` e `ir` só usam refs, o estado e o roteador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimizada, temRascunho, base]);

  // A busca (⌘K, Ctrl K, "/") leva a outra tela sem passar por link: com alteração pendente, a janela pergunta antes.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (liberarAtalho.current) return;
      const alvo = e.target instanceof HTMLElement ? e.target : null;
      const digitando = !!alvo && (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable);
      const atalho = ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !digitando && !e.metaKey && !e.ctrlKey && !e.altKey);
      if (!atalho || !temRascunho()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setMinimizada(false);
      perguntar({ tipo: 'busca', tecla: { key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, bubbles: true, cancelable: true } });
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [temRascunho]);

  // A pergunta aparece com o foco em "Continuar editando" (a escolha que não perde nada).
  useEffect(() => {
    if (pedido) continuar.current?.focus();
  }, [pedido]);

  function armarEspera() {
    if (espera.current) window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => {
      // Já na página de trás (o navegador chegou; só falta desenhar): nada a fazer.
      if (ehDaJanela(window.location.pathname, base)) router.replace(enderecoDoFundo.current(), { scroll: false });
    }, ESPERA_AO_FECHAR_MS);
  }

  function fechar() {
    if (fechando.current) return;
    fechando.current = { passos: 1 };
    ref.current?.close();
    armarEspera();
    window.history.back();
  }

  function voltar() {
    if (pilha.length < 2) return;
    router.replace(pilha[pilha.length - 2], { scroll: false });
  }

  /** Outra tela da janela substitui o endereço (a janela continua uma entrada no histórico); fora dela, navega. */
  function ir(href: string) {
    const destino = new URL(href, window.location.href);
    const alvo = destino.pathname + destino.search + destino.hash;
    if (ehDaJanela(destino.pathname, base)) router.replace(alvo, { scroll: false });
    else router.push(alvo);
  }

  function concluir(p: Pedido) {
    setPedido(null);
    if (p.tipo === 'fechar') fechar();
    else if (p.tipo === 'voltar') voltar();
    else if (p.tipo === 'ir') ir(p.href);
    else {
      // O foco volta aonde estava antes da pergunta: é para lá que a busca o devolve ao fechar.
      const alvo = focoAntesDaPergunta.current;
      focoAntesDaPergunta.current = null;
      (alvo && alvo.isConnected && ref.current?.contains(alvo) ? alvo : titulo.current)?.focus();
      liberarAtalho.current = true;
      window.dispatchEvent(new KeyboardEvent('keydown', p.tecla));
      liberarAtalho.current = false;
    }
  }

  /** Mostra a pergunta e guarda onde estava o foco (o campo, o botão ou o link), para devolver se a pessoa continuar. */
  function perguntar(p: Pedido) {
    const ativo = document.activeElement;
    focoAntesDaPergunta.current = ativo instanceof HTMLElement && ref.current?.contains(ativo) ? ativo : null;
    setPedido(p);
  }

  /** "Continuar editando" (ou Escape na pergunta): a pergunta sai e o foco volta aonde estava; se sumiu, ao nome da janela. */
  function dispensar() {
    setPedido(null);
    const alvo = focoAntesDaPergunta.current;
    focoAntesDaPergunta.current = null;
    requestAnimationFrame(() => {
      const ok = alvo && alvo.isConnected && ref.current?.contains(alvo);
      (ok ? alvo : titulo.current)?.focus();
    });
  }

  function pedir(p: Pedido) {
    if (temRascunho()) perguntar(p);
    else concluir(p);
  }

  function minimizar() {
    setSujaAoMinimizar(temRascunho());
    setMinimizada(true);
  }

  /** Âncora dentro da tela ("Nova pessoa"): rola até o alvo na janela e leva o foco a ele, sem entrada nova no histórico. */
  function irParaAncora(id: string) {
    const d = ref.current;
    if (!d || !id) return;
    let alvo: HTMLElement | null = null;
    try {
      alvo = d.querySelector<HTMLElement>(`#${CSS.escape(decodeURIComponent(id))}`);
    } catch {
      alvo = null;
    }
    if (!alvo) return;
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    alvo.scrollIntoView({ block: 'start', behavior: reduzido ? 'auto' : 'smooth' });
    if (!alvo.matches('a[href], button, input, select, textarea, [tabindex]')) alvo.setAttribute('tabindex', '-1');
    alvo.focus({ preventScroll: true });
  }

  const abaAtual = area.abas.find((a) => a.href === caminho);
  const descricao = pedido ? DESCRICAO_DO_PEDIDO[pedido.tipo] : null;

  // Minimizada: o botão de reabrir na barra do topo (a partir de 1280 px) e na faixa do alto do conteúdo (abaixo disso). Só
  // um aparece; o foco vai para o que está à vista. Sem os dois lugares (fora do shell), um botão fixo no canto.
  const rotuloDeReabrir = `Reabrir ${area.nome}${sujaAoMinimizar ? ', com alteração não salva' : ''}`;
  const pontoDeAlteracao = sujaAoMinimizar && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-atencao" />;
  const botaoNaBarra = (fixo: boolean) => (
    <button
      ref={reabrirNaBarra}
      type="button"
      onClick={() => setMinimizada(false)}
      aria-label={rotuloDeReabrir}
      title={`Reabrir ${area.nome}`}
      className={`ff-janela-minimizada ff-transicao inline-flex h-11 min-w-11 max-w-[240px] items-center gap-2 rounded-nav border border-linha-forte bg-painel pl-1.5 pr-3 text-[13px] font-semibold text-texto hover:bg-forte ${fixo ? 'fixed bottom-3 left-3 z-40 shadow-[var(--ff-sombra)]' : ''}`}
    >
      <IconeDoModulo icone={area.icone} cor={area.cor} tamanho={32} variante="cheio" />
      {/* Com pouco lugar na barra (dois seletores e nomes longos), o nome encolhe até sumir: fica o ícone, com 44 px de alvo (o
          nome completo está no rótulo do botão). */}
      <span className="min-w-0 truncate">{area.nome}</span>
      {pontoDeAlteracao}
    </button>
  );
  const botaoNoConteudo = (
    <button
      ref={reabrirNoConteudo}
      type="button"
      onClick={() => setMinimizada(false)}
      aria-label={rotuloDeReabrir}
      className="ff-janela-minimizada ff-transicao flex min-h-11 w-full items-center gap-2.5 border-b border-linha bg-painel px-4 py-1.5 text-left text-[14px] text-texto hover:bg-forte"
    >
      <IconeDoModulo icone={area.icone} cor={area.cor} tamanho={32} variante="cheio" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{area.nome}</span> <span className="text-suave">minimizada</span>
      </span>
      {pontoDeAlteracao}
      <span className="shrink-0 text-[13px] font-medium underline decoration-linha-forte underline-offset-4">Reabrir</span>
    </button>
  );

  return (
    <>
      <dialog
        ref={ref}
        aria-label={abaAtual ? `${area.nome}: ${abaAtual.rotulo}` : area.nome}
        aria-describedby={idContexto}
        data-cheia={cheia ? 'true' : undefined}
        data-passos={Math.max(0, pilha.length - 1)}
        className="ff-dialogo ff-janela"
        onCancel={(e) => {
          e.preventDefault();
          if (pedido) dispensar();
          else pedir({ tipo: 'fechar' });
        }}
        onClose={(e) => {
          // O navegador fechou o diálogo sozinho (Escape repetido sem outro gesto no meio, regra dele contra prender a
          // pessoa): nada se perde; a janela fica minimizada, com o botão de reabrir. O aviso de fechar chega depois do
          // fechamento: se o diálogo já abriu de novo (o React de desenvolvimento monta duas vezes), não houve nada.
          if (fechando.current || minimizadaAgora.current || e.currentTarget.open) return;
          minimizar();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pedido) pedir({ tipo: 'fechar' });
        }}
        onClickCapture={(e) => {
          if (e.defaultPrevented) return;
          const link = (e.target as Element | null)?.closest?.('a[href]');
          const href = link?.getAttribute('href') ?? '';
          if (href.startsWith('#')) {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            irParaAncora(href.slice(1));
            return;
          }
          const destino = destinoDoClique(e.nativeEvent);
          if (!destino) return;
          const alvo = destino.pathname + destino.search + destino.hash;
          if (temRascunho()) {
            e.preventDefault();
            e.stopPropagation();
            perguntar({ tipo: 'ir', href: alvo });
          } else if (ehDaJanela(destino.pathname, base)) {
            e.preventDefault();
            e.stopPropagation();
            ir(alvo);
          }
        }}
        onSubmitCapture={(e) => {
          // O que foi enviado fica registrado: o mesmo conteúdo sem erro na tela não pergunta de novo (ver a regra).
          const form = e.target;
          if (form instanceof HTMLFormElement) envios.current.set(form, fotografiaDosCampos(form.elements as unknown as ArrayLike<CampoDoRascunho>));
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-linha py-2 pl-4 pr-2">
            <IconeDoModulo icone={area.icone} cor={area.cor} tamanho={36} variante="cheio" />
            <div className="min-w-0 flex-1 pl-1">
              {/* Nome da janela, não título de seção: o título (h1) é o da tela, logo abaixo. */}
              <p ref={titulo} data-ff-titulo tabIndex={-1} className="break-words font-display text-[20px] font-normal leading-tight tracking-[-0.01em] outline-none">
                {area.nome}
              </p>
              <p id={idContexto} className="mt-0.5 text-[12px] leading-snug text-suave [overflow-wrap:anywhere]">
                {contexto}
              </p>
            </div>
            <button
              ref={botaoVoltar}
              type="button"
              className={BOTAO}
              aria-label="Voltar"
              title="Voltar"
              disabled={pilha.length < 2}
              onClick={() => {
                voltarComFoco.current = document.activeElement === botaoVoltar.current;
                pedir({ tipo: 'voltar' });
              }}
            >
              <ArrowLeft size={18} aria-hidden />
            </button>
            <button type="button" className={BOTAO} aria-label="Minimizar" title="Minimizar" onClick={minimizar}>
              <Minus size={18} aria-hidden />
            </button>
            <button
              type="button"
              className={`${BOTAO} max-[699px]:hidden`}
              aria-label="Expandir"
              title={cheia ? 'Voltar ao tamanho da janela' : 'Expandir'}
              aria-pressed={cheia}
              onClick={() => setCheia((v) => !v)}
            >
              {cheia ? <Minimize2 size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />}
            </button>
            <button type="button" className={BOTAO} aria-label="Fechar" title="Fechar" onClick={() => pedir({ tipo: 'fechar' })}>
              <X size={18} aria-hidden />
            </button>
          </header>
          <nav aria-label={`Seções de ${area.nome}`} className="shrink-0 overflow-x-auto border-b border-linha">
            <ul className="flex w-max min-w-full gap-1 px-3">
              {area.abas.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    replace
                    scroll={false}
                    aria-current={caminho === a.href ? 'page' : undefined}
                    className="ff-aba ff-transicao flex min-h-11 items-center whitespace-nowrap px-3 text-[14px] text-suave hover:text-texto aria-[current=page]:font-semibold aria-[current=page]:text-texto"
                  >
                    {a.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div ref={corpo} className="ff-janela-corpo min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-5 sm:px-6">
            {aviso && <div className="mb-5">{aviso}</div>}
            {/* A caixa "Como funciona" e a ajuda do topo são da página de trás (o shell a descreve); na janela, não aparecem. */}
            <ContextoDaCaixa.Provider value={null}>{children}</ContextoDaCaixa.Provider>
          </div>
          {pedido && descricao && (
            <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-linha bg-atencao-fundo px-4 py-3">
              <p className="min-w-0 text-[14px] text-texto">
                <strong className="font-semibold">Há alteração não salva nesta janela.</strong> {descricao.texto}
              </p>
              <div className="flex flex-wrap gap-2">
                <button ref={continuar} type="button" className={classeDeBotao('secundario')} onClick={dispensar}>
                  Continuar editando
                </button>
                <button type="button" className={classeDeBotao('perigo')} onClick={() => concluir(pedido)}>
                  {descricao.rotulo}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
      {minimizada && (lugares ? <>{createPortal(botaoNaBarra(false), lugares.barra)}{createPortal(botaoNoConteudo, lugares.conteudo)}</> : botaoNaBarra(true))}
    </>
  );
}
