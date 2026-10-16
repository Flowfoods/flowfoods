'use client';

/**
 * Campos de uma embalagem de compra (a padrão do insumo e as outras): quanto
 * vem (em kg ou g, L ou ml, un), preço, "Ainda não sei o preço" e frete por
 * embalagem — e a CONTA do custo por unidade, ao vivo, com as mesmas funções
 * do servidor. É só prévia: o número que vale é o que o servidor calcula a
 * partir do texto.
 */

import { useState } from 'react';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { Segmentos } from '../../ui/segmentos';
import {
  UNIDADES,
  contaDoCusto,
  custoDaEmbalagem,
  formatarCusto,
  lerDinheiro,
  lerQuantidadeNa,
  type Escala,
  type Unidade,
} from '@/lib/erp/unidades';

export interface ValoresDaEmbalagem {
  conteudo: string;
  escala: Escala;
  preco: string;
  semPreco: boolean;
  frete: string;
}

export const EMBALAGEM_VAZIA: ValoresDaEmbalagem = { conteudo: '', escala: 'base', preco: '', semPreco: false, frete: '' };

const DINHEIRO = `${CAMPO} pl-10 text-right tabular-nums`;

export function CamposDaEmbalagem({
  unidade,
  inicial,
  erros,
  idBase,
}: {
  unidade: Unidade;
  inicial: ValoresDaEmbalagem;
  erros: Partial<Record<string, string>>;
  idBase: string;
}) {
  const [v, setV] = useState(inicial);
  const mudar = (campo: Partial<ValoresDaEmbalagem>) => setV((x) => ({ ...x, ...campo }));
  const u = UNIDADES[unidade];
  const temMenor = unidade !== 'UN';
  const escala: Escala = temMenor ? v.escala : 'base';
  const sigla = escala === 'menor' ? u.menor : u.sigla;
  const id = (c: string) => `${idBase}-${c}`;
  const descrito = (c: string, ajuda = false) =>
    [ajuda ? `${id(c)}-ajuda` : '', erros[c] ? `${id(c)}-erro` : ''].filter(Boolean).join(' ') || undefined;

  // Prévia com as funções do servidor (unidades.ts): mesma conta, mesmo arredondamento.
  const conteudo = lerQuantidadeNa(v.conteudo, unidade, escala);
  const preco = v.semPreco ? 0 : lerDinheiro(v.preco);
  const frete = v.frete.trim() ? lerDinheiro(v.frete) : 0;
  const pronto = !!conteudo && preco !== null && frete !== null;
  const custo = pronto ? custoDaEmbalagem(preco, frete, conteudo) : undefined;

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${temMenor ? 'grid-cols-[minmax(0,1fr)_minmax(0,9rem)]' : ''}`}>
        <div>
          <label htmlFor={id('conteudo')} className={ROTULO}>
            Quanto vem na embalagem
          </label>
          <div className="relative">
            <input
              id={id('conteudo')}
              name="conteudo"
              inputMode="decimal"
              autoComplete="off"
              placeholder={escala === 'menor' ? '750' : unidade === 'UN' ? '12' : '5'}
              value={v.conteudo}
              onChange={(e) => mudar({ conteudo: e.target.value })}
              className={`${CAMPO} pr-11 text-right tabular-nums`}
              aria-invalid={!!erros.conteudo}
              aria-describedby={descrito('conteudo')}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-suave">
              {sigla}
            </span>
          </div>
          <Erro id={`${id('conteudo')}-erro`} texto={erros.conteudo} />
        </div>
        {temMenor ? (
          <Segmentos
            nome="escala"
            legenda="Medida"
            opcoes={[
              ['base', u.sigla],
              ['menor', u.menor],
            ]}
            valor={escala}
            aoMudar={(e) => mudar({ escala: e })}
          />
        ) : (
          <input type="hidden" name="escala" value="base" />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('preco')} className={ROTULO}>
            Preço da embalagem
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-suave">R$</span>
            <input
              id={id('preco')}
              name="preco"
              inputMode="decimal"
              autoComplete="off"
              placeholder={v.semPreco ? '' : '89,90'}
              value={v.semPreco ? '' : v.preco}
              disabled={v.semPreco}
              onChange={(e) => mudar({ preco: e.target.value })}
              className={DINHEIRO}
              aria-invalid={!!erros.preco}
              aria-describedby={descrito('preco')}
            />
          </div>
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] text-texto sm:min-h-9">
            <input
              type="checkbox"
              name="semPreco"
              checked={v.semPreco}
              onChange={(e) => mudar({ semPreco: e.target.checked })}
              className={MARCAR}
            />
            Ainda não sei o preço
          </label>
          <Erro id={`${id('preco')}-erro`} texto={erros.preco} />
        </div>
        <div>
          <label htmlFor={id('frete')} className={ROTULO}>
            Frete por embalagem <span className="font-normal text-suave">(se pagar)</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-suave">R$</span>
            <input
              id={id('frete')}
              name="frete"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={v.frete}
              onChange={(e) => mudar({ frete: e.target.value })}
              className={DINHEIRO}
              aria-invalid={!!erros.frete}
              aria-describedby={descrito('frete', true)}
            />
          </div>
          <p id={`${id('frete')}-ajuda`} className={AJUDA}>
            A parte da entrega que cai em cada embalagem. Entra no custo.
          </p>
          <Erro id={`${id('frete')}-erro`} texto={erros.frete} />
        </div>
      </div>

      {/* A conta: o mesmo texto da lista, do detalhe e do histórico. */}
      <div aria-live="polite" className="rounded-[10px] border border-linha bg-forte/60 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-suave">Custo por {u.sigla}</span>
          <span className="font-display text-[22px] font-bold leading-none text-texto">
            {custo === undefined ? <span className="text-suave">—</span> : formatarCusto(custo, unidade)}
          </span>
        </div>
        <p className="mt-1.5 text-[12px] tabular-nums text-suave">
          {pronto
            ? contaDoCusto({
                precoEmbalagemCentavos: preco,
                taxaEntregaCentavos: frete,
                conteudoMilesimos: conteudo,
                unidade,
              })
            : 'Preencha quanto vem e o preço para ver a conta.'}
        </p>
      </div>
    </div>
  );
}
