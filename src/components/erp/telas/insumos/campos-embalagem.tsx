'use client';

/**
 * Campos de uma embalagem de compra (a padrão do insumo e as outras): quanto
 * vem (em kg ou g, L ou ml, un), preço, "Ainda não sei" e frete por embalagem
 * — e a CONTA do custo por unidade, ao vivo, com as mesmas funções do
 * servidor. É só prévia: o número que vale é o que o servidor calcula a
 * partir do texto.
 *
 * I.1b — `modo="insumo"` é a embalagem PADRÃO no cadastro do insumo, e o valor dela é o "Custo inicial de referência": o que
 * vale até a primeira compra lançada (depois, o último preço de compra). Os rótulos diferenciam o conteúdo da embalagem
 * (quanto vem) da unidade base (como se controla) e do custo (R$ por embalagem), com um exemplo na unidade escolhida e a conta
 * ao vivo ("5 kg por R$ 25,00 → R$ 5,00/kg"). Sem custo, a tela diz "Custo não informado", nunca R$ 0,00. `modo="variante"`
 * é a outra embalagem de compra, onde o valor é o preço dela.
 */

import { useState } from 'react';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { Segmentos } from '../../ui/segmentos';
import {
  UNIDADES,
  contaDoCusto,
  custoDaEmbalagem,
  CUSTO_NAO_INFORMADO,
  formatarCusto,
  formatarDinheiro,
  formatarQuantidade,
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

/** O texto do plano (21/10/2026) que explica para que serve o custo inicial. */
export const TEXTO_DO_CUSTO_INICIAL =
  'Informe quanto você paga pela embalagem de compra. Esse valor ajuda a calcular o custo do insumo e das fichas antes da primeira compra registrada. Depois, o custo é atualizado pelo último preço de compra.';

/** O exemplo visível, na unidade escolhida, calculado pelas mesmas funções do servidor (nunca um número digitado à mão). */
const EXEMPLO: Record<Unidade, { texto: string; conteudo: number; precoCentavos: number }> = {
  KG: { texto: 'saco de farinha de 5 kg', conteudo: 5000, precoCentavos: 2500 },
  L: { texto: 'galão de óleo de 5 L', conteudo: 5000, precoCentavos: 2500 },
  UN: { texto: 'caixa com 100 un', conteudo: 100000, precoCentavos: 2500 },
};
export function exemploDoCusto(unidade: Unidade): string {
  const e = EXEMPLO[unidade];
  return `${e.texto} por ${formatarDinheiro(e.precoCentavos)} → custo de referência ${formatarCusto(custoDaEmbalagem(e.precoCentavos, 0, e.conteudo), unidade)}`;
}

export function CamposDaEmbalagem({
  unidade,
  inicial,
  erros,
  idBase,
  modo = 'variante',
}: {
  unidade: Unidade;
  inicial: ValoresDaEmbalagem;
  erros: Partial<Record<string, string>>;
  idBase: string;
  /** `insumo`: a embalagem padrão do cadastro (o valor é o "custo inicial de referência"); `variante`: outra embalagem (o valor é o preço). */
  modo?: 'insumo' | 'variante';
}) {
  const doInsumo = modo === 'insumo';
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
  // "Ainda não sei" marcado já é uma resposta: custo não informado (null), mesmo antes de preencher o resto.
  const custo = v.semPreco ? null : pronto ? custoDaEmbalagem(preco, frete, conteudo) : undefined;
  const exemploDeQuanto = unidade === 'UN' ? 'caixa de ovos com 30 un → 30' : unidade === 'L' ? 'galão de óleo com 5 L → 5' : 'saco de farinha com 5 kg → 5';

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
              aria-describedby={descrito('conteudo', doInsumo)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-suave">
              {sigla}
            </span>
          </div>
          {doInsumo && (
            <p id={`${id('conteudo')}-ajuda`} className={AJUDA}>
              Quanto vem em UMA embalagem que você compra, na medida da unidade base. Ex.: {exemploDeQuanto}.
            </p>
          )}
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
            {doInsumo ? 'Custo inicial de referência' : 'Preço da embalagem'}
            {doInsumo && <span className="font-normal text-suave"> (R$ por embalagem de compra)</span>}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-suave">R$</span>
            <input
              id={id('preco')}
              name="preco"
              inputMode="decimal"
              autoComplete="off"
              placeholder={v.semPreco ? '' : doInsumo ? '25,00' : '89,90'}
              value={v.semPreco ? '' : v.preco}
              disabled={v.semPreco}
              onChange={(e) => mudar({ preco: e.target.value })}
              className={DINHEIRO}
              aria-invalid={!!erros.preco}
              aria-describedby={descrito('preco', doInsumo)}
            />
          </div>
          {doInsumo && (
            <div id={`${id('preco')}-ajuda`} className="mt-1.5 space-y-1.5 text-[12px] text-suave">
              <p>{TEXTO_DO_CUSTO_INICIAL}</p>
              <p>
                <span className="font-medium text-texto">Exemplo:</span> {exemploDoCusto(unidade)}.
              </p>
            </div>
          )}
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] text-texto sm:min-h-9">
            <input
              type="checkbox"
              name="semPreco"
              checked={v.semPreco}
              onChange={(e) => mudar({ semPreco: e.target.checked })}
              className={MARCAR}
            />
            {doInsumo ? 'Ainda não sei o custo' : 'Ainda não sei o preço'}
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
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[13px] font-medium text-suave">{doInsumo ? `Custo de referência por ${u.sigla}` : `Custo por ${u.sigla}`}</span>
          <span className={`font-display text-[22px] font-bold leading-none ${custo === null ? 'text-atencao' : 'text-texto'}`}>
            {custo === undefined ? <span className="text-suave">—</span> : formatarCusto(custo, unidade)}
          </span>
        </div>
        <p className="mt-1.5 text-[12px] tabular-nums text-suave">
          {v.semPreco
            ? `${CUSTO_NAO_INFORMADO}: as fichas e a margem ficam incompletas até haver um custo inicial de referência ou uma compra lançada.`
            : pronto && preco !== null
              ? doInsumo && custo
                ? `Você paga ${formatarDinheiro(preco)}${frete ? ` + ${formatarDinheiro(frete)} de frete` : ''} por ${formatarQuantidade(conteudo, unidade)}: ${contaDoCusto({
                    precoEmbalagemCentavos: preco,
                    taxaEntregaCentavos: frete,
                    conteudoMilesimos: conteudo,
                    unidade,
                  })}`
                : contaDoCusto({
                    precoEmbalagemCentavos: preco,
                    taxaEntregaCentavos: frete,
                    conteudoMilesimos: conteudo,
                    unidade,
                  })
              : doInsumo
                ? 'Preencha quanto vem e o custo para ver a conta.'
                : 'Preencha quanto vem e o preço para ver a conta.'}
        </p>
        {doInsumo && (
          <p className="mt-1.5 border-t border-linha pt-1.5 text-[12px] text-suave">
            Origem: referência inicial, sem compra registrada. Este cadastro não cria nota de compra, movimento de estoque, despesa nem conta a pagar.
          </p>
        )}
      </div>
    </div>
  );
}
