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
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { X } from 'lucide-react';
import { COR, filtrarModulos, nomeCurtoDoModulo, type ModuloNav, type Navegacao } from '@/lib/erp/modulos';
import { IconeDoModulo } from '../ui/cabecalho';
import { SeloEmBreve } from '../ui/em-breve';
import { foraDaCaixa } from './Popover';

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
}: {
  id: string;
  nav: Navegacao;
  /** A área da tela atual (no Início ou fora do menu, nenhuma). */
  atual: ModuloNav | null;
  /** O botão Módulos: origem da Expansão, destino do foco ao fechar e fora da conta do "toque fora". */
  botao: RefObject<HTMLButtonElement | null>;
  /** `devolverFoco`: Escape e o fechar devolvem o foco ao botão; toque fora e foco que sai deixam onde está. */
  aoFechar: (devolverFoco: boolean) => void;
}) {
  const janela = useRef<HTMLDivElement>(null);
  const [busca, setBusca] = useState('');
  const [origem, setOrigem] = useState<string | undefined>(undefined);
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
    const caixa = j.getBoundingClientRect();
    const esquerda = caixa.left - (j.offsetWidth - caixa.width) / 2;
    const topo = caixa.top - (j.offsetHeight - caixa.height) / 2;
    setOrigem(origemDaExpansao(b, { left: esquerda, top: topo }));
  }, [botao]);

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

  return (
    <div
      ref={janela}
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={idTitulo}
      data-janela-de-modulos
      className="ff-janela-modulos ff-expansao"
      style={origem ? ({ transformOrigin: origem } as CSSProperties) : undefined}
      // O foco que sai da janela para outro elemento (que não seja o botão) fecha e fica onde foi.
      onBlur={(e) => {
        if (foraDaCaixa(e.currentTarget, e.relatedTarget) && !botao.current?.contains(e.relatedTarget as Node)) aoFechar(false);
      }}
    >
      <div className="ff-janela-modulos-cabeca">
        <h2 id={idTitulo} className="font-display text-[20px] font-normal leading-tight tracking-[-0.01em]">
          Módulos
        </h2>
        <button type="button" onClick={() => aoFechar(true)} aria-label="Fechar os módulos" className="ff-transicao inline-grid h-11 w-11 shrink-0 place-items-center rounded-botao text-suave hover:bg-texto/5 hover:text-texto">
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="px-3 pb-2">
        <input
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
      <div className="ff-janela-modulos-corpo">
        {nada ? (
          <p role="status" className="px-1 py-6 text-center text-[14px] text-suave">
            Nenhum módulo com “{busca.trim()}”.
          </p>
        ) : (
          <>
            <p id={idAreas} className="sr-only">
              Áreas
            </p>
            <ul aria-labelledby={idAreas} className="ff-grade-compacta">
              {inicioAparece && (
                <li>
                  <BlocoCompacto
                    href={nav.inicio.href}
                    nome={nav.inicio.titulo}
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
                          <span className="ff-bloco-compacto-nome block font-medium">{nomeCurtoDoModulo(m.nome)}</span>
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
    </div>
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
