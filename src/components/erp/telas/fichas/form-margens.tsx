'use client';

/**
 * Margem-alvo de cada canal (1.10): a margem LÍQUIDA que deve sobrar, em % do
 * preço. É o que o preço sugerido de todas as fichas persegue. Ao lado, a
 * conta com um prato de exemplo (R$ 10,00 de insumos + embalagens), pela
 * mesma função das fichas. Quem decide é o servidor (permissão, versão lida,
 * iFood só com a taxa, taxa + alvo abaixo de 100 %).
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { CANAIS, ORDEM_DOS_CANAIS, taxaTotalBp, type CanalVenda, type TaxaDoCanal } from '@/lib/erp/canal-campos';
import { precoSugerido } from '@/lib/erp/preco-campos';
import { formatarDinheiro, formatarPontosBase, lerPontosBase, pontosBaseParaCampo } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro } from '../../ui/campos';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, useAvisoDeSaida } from '../cadastro/erros';

const AJUDA_DO_CANAL: Record<CanalVenda, string> = {
  LOJA: 'Salão e balcão.',
  DELIVERY_PROPRIO: 'Entrega da casa.',
  IFOOD: 'Depois da taxa do iFood.',
};

/** O prato de exemplo da conta ao lado: R$ 10,00 de insumos + embalagens. */
const EXEMPLO = 1000;

export function FormMargensAlvo({
  acao,
  aqui,
  versao,
  inicial,
  taxa,
  bloqueio,
}: {
  acao: AcaoDeCadastro;
  aqui: string;
  versao: string;
  inicial: Record<CanalVenda, number | null>;
  /** A taxa do iFood (null = não configurada: o alvo do iFood espera). */
  taxa: TaxaDoCanal | null;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const saida = useAvisoDeSaida(estado);
  const [textos, setTextos] = useState<Record<CanalVenda, string>>(
    () => Object.fromEntries(ORDEM_DOS_CANAIS.map((c) => [c, inicial[c] === null ? '' : pontosBaseParaCampo(inicial[c]!)])) as Record<CanalVenda, string>,
  );
  const erros = estado?.erros ?? {};
  const taxaBp = taxa ? taxaTotalBp(taxa) : null;
  const exemplo = (canal: CanalVenda) => {
    const t = textos[canal].trim();
    if (!t) return <span className="text-suave">sem alvo: sem sugerido</span>;
    const bp = lerPontosBase(t);
    if (bp === null || bp >= 10_000) return <span className="text-suave">—</span>;
    if (canal === 'IFOOD' && taxaBp === null) return <span className="text-atencao">falta a taxa do iFood</span>;
    const s = precoSugerido({ semTaxa: { num: BigInt(EXEMPLO), den: 1n }, taxaBp: canal === 'IFOOD' ? taxaBp! : 0, margemAlvoBp: bp, incompleto: false });
    if (s.tipo !== 'ok') return <span className="text-atencao">não fecha: taxa + alvo passam de 100%</span>;
    return (
      <>
        sai a <strong className="font-semibold text-texto">{formatarDinheiro(s.centavos)}</strong>
      </>
    );
  };
  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      <input type="hidden" name="versao" value={versao} />
      <ErroGeral estado={estado} recarregar={aqui} />
      <fieldset disabled={!!bloqueio} className="min-w-0">
        <legend className="sr-only">Margem-alvo de cada canal</legend>
        <ul className="divide-y divide-linha">
          {ORDEM_DOS_CANAIS.map((canal) => {
            const id = `margem-${canal}`;
            const semTaxa = canal === 'IFOOD' && taxaBp === null;
            const erro = erros[id];
            return (
              <li key={canal} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto_14rem]">
                <div className="min-w-0">
                  <label htmlFor={id} className="text-[14px] font-medium text-texto">
                    {CANAIS[canal].rotulo}
                  </label>
                  <p id={`${id}-ajuda`} className={AJUDA.replace('mt-1.5', 'mt-0.5')}>
                    {semTaxa ? 'Configure a taxa do iFood abaixo antes.' : AJUDA_DO_CANAL[canal]}
                  </p>
                </div>
                <div className="flex items-stretch gap-2">
                  <div className="w-24 shrink-0">
                    <input
                      id={id}
                      name={`margem_${canal}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={textos[canal]}
                      disabled={semTaxa && !textos[canal]}
                      onChange={(e) => setTextos((t) => ({ ...t, [canal]: e.target.value }))}
                      className={`${CAMPO} min-h-11 text-right text-base font-semibold tabular-nums sm:text-sm`}
                      aria-invalid={!!erro}
                      aria-describedby={`${id}-ajuda ${id}-exemplo${erro ? ` ${id}-erro` : ''}`}
                    />
                  </div>
                  <span className="flex items-center text-[14px] text-suave">%</span>
                </div>
                <p id={`${id}-exemplo`} className="col-span-2 text-[12px] tabular-nums text-suave sm:col-span-1 sm:text-right" aria-live="polite">
                  Prato de R$ 10,00: {exemplo(canal)}
                </p>
                <div className="col-span-2 sm:col-span-3">
                  <Erro id={`${id}-erro`} texto={erro} />
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p className="text-[12px] text-suave">
        Margem-alvo é o que deve sobrar do preço depois dos insumos, das embalagens e da taxa do canal ({taxaBp !== null ? `iFood: ${formatarPontosBase(taxaBp)}` : 'iFood: sem taxa ainda'}). Vazio = sem alvo.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <BotaoEnviar disabled={!!bloqueio} className="sm:min-w-44">
          Salvar margens-alvo
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
