/**
 * Superfícies do design system do ERP (um só kit para /erp e /rodolfo).
 *
 * Profundidade por borda fina + UMA camada de superfície (`painel` sobre
 * `fundo`); sombra só no que flutua (diálogo, gaveta). Cards de 14 px. Número
 * grande em Gelasio, tabular; o resto em Libre Franklin. Cor de status só no
 * selo e no texto, sempre com palavra (cor nunca é o único sinal). Vermelho é
 * o único acento de marca: aparece no indicador do menu, no filete do topo e
 * no botão principal — nunca como fundo de bloco.
 */

import type { ReactNode } from 'react';

export function Painel({
  titulo,
  subtitulo,
  acessorio,
  children,
  className = '',
  semRespiro = false,
  id,
}: {
  id?: string;
  titulo?: string;
  /** Uma linha de apoio sob o título (12 px, suave): o que o painel quer dizer. */
  subtitulo?: string;
  acessorio?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sem padding no corpo: tabela ou lista encostam na borda do card. */
  semRespiro?: boolean;
}) {
  return (
    <section id={id} className={`min-w-0 rounded-[14px] border border-linha bg-painel ${className}`}>
      {(titulo || acessorio) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-linha px-4 py-2.5 sm:px-5">
          {titulo && (
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold text-texto">{titulo}</h2>
              {subtitulo && <p className="mt-0.5 text-[12px] leading-snug text-suave">{subtitulo}</p>}
            </div>
          )}
          {acessorio}
        </header>
      )}
      <div className={semRespiro ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

/** Contagem discreta no canto do cabeçalho do painel. */
export function Contagem({ children }: { children: ReactNode }) {
  return <span className="text-[12px] tabular-nums text-suave">{children}</span>;
}

/** Número solto (dentro de um painel), sem caixa em volta. */
export function Numero({ valor, rotulo, detalhe }: { valor: ReactNode; rotulo: string; detalhe?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-display text-[26px] font-bold leading-none tabular-nums">{valor}</div>
      <div className="mt-1.5 text-[12px] font-medium text-suave">{rotulo}</div>
      {detalhe && <div className="mt-0.5 truncate text-[12px] text-suave">{detalhe}</div>}
    </div>
  );
}

/** Métrica com caixa (faixa de indicadores no topo de uma tela). */
export function Metrica({
  rotulo,
  valor,
  detalhe,
  children,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
      <div className="text-[12px] font-medium leading-snug text-suave">{rotulo}</div>
      <div className="mt-auto truncate pt-2 font-display text-[26px] font-bold leading-none tabular-nums">{valor}</div>
      {detalhe && <div className="mt-1.5 truncate text-[12px] text-suave">{detalhe}</div>}
      {children}
    </div>
  );
}

export type Tom = 'ok' | 'alerta' | 'erro' | 'neutro';

const TONS: Record<Tom, string> = {
  ok: 'border-ok/35 text-ok',
  // 1.5 (herança d): contorno mais forte — a 40 % sumia no escuro.
  alerta: 'border-atencao/70 text-atencao',
  erro: 'border-erro/40 text-erro',
  neutro: 'border-linha-forte text-suave',
};

/**
 * Selo de situação: sempre com texto. Borda e texto na cor, fundo neutro.
 * `cheio` (1.10): o estado mais grave de uma escala (prejuízo) ganha o fundo
 * tingido e a borda inteira — grita mais que o alerta ao lado.
 */
export function Selo({ tom = 'neutro', cheio = false, children }: { tom?: Tom; cheio?: boolean; children: ReactNode }) {
  const fundo = cheio ? { ok: 'bg-ok/15 border-ok', alerta: 'bg-atencao/15 border-atencao', erro: 'bg-erro/15 border-erro', neutro: 'bg-texto/10' }[tom] : tom === 'erro' ? '' : 'bg-texto/[0.03]'; // erro sem tinta: no tema escuro #F2323F sobre o fundo tingido cai abaixo de 4,5:1
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-2 py-0.5 text-[12px] font-semibold ${TONS[tom]} ${fundo}`}
    >
      {children}
    </span>
  );
}

/** Ponto de situação do parceiro (sempre ao lado da palavra). */
export function Ponto({ tom }: { tom: 'ativo' | 'rascunho' | 'suspenso' }) {
  const cor = { ativo: 'bg-ok', rascunho: 'bg-atencao', suspenso: 'bg-erro' }[tom];
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cor}`} />;
}

/** Estado vazio: o que falta e o próximo passo, numa frase. */
export function Vazio({ titulo, children, acao }: { titulo?: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center sm:px-5">
      {titulo && <p className="font-display text-lg">{titulo}</p>}
      {children && <p className={`text-sm text-suave ${titulo ? 'mt-1' : ''}`}>{children}</p>}
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  );
}

/**
 * Aviso de situação (parceiro suspenso, tela fora do acesso, regra que trava).
 * Card neutro com o ponto ou o selo do tom; sem borda colorida, sem ícone.
 */
export function Aviso({ tom = 'neutro', titulo, children }: { tom?: Tom; titulo: string; children?: ReactNode }) {
  const ponto = { ok: 'bg-ok', alerta: 'bg-atencao', erro: 'bg-erro', neutro: 'bg-suave' }[tom];
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[14px] border border-linha bg-painel px-4 py-3 text-sm sm:px-5"
    >
      <span className="flex h-5 shrink-0 items-center">
        <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${ponto}`} />
      </span>
      <p className="min-w-0 text-suave">
        <span className="font-semibold text-texto">{titulo}</span>
        {children && <> {children}</>}
      </p>
    </div>
  );
}

/** Barra de progresso. `valor`/`total` em unidades absolutas. */
export function Barra({
  valor,
  total,
  tom = 'ok',
  rotulo,
}: {
  valor: number;
  total: number;
  tom?: Tom;
  rotulo?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  const cor = { ok: 'bg-ok', alerta: 'bg-atencao', erro: 'bg-erro', neutro: 'bg-suave' }[tom];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(valor, total)}
      aria-label={rotulo ?? `${valor} de ${total}`}
      className="h-1.5 w-full overflow-hidden rounded-full bg-texto/10"
    >
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Lista de pares rótulo → valor (cadastro, cadência, contato). */
export function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-suave">{rotulo}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/** Citação de mensagem (resposta do lead, gancho): filete neutro, não colorido. */
export function Citacao({ children }: { children: ReactNode }) {
  return (
    <blockquote className="rounded-[10px] border border-linha bg-texto/[0.03] px-3 py-2.5 text-sm text-texto">
      {children}
    </blockquote>
  );
}
