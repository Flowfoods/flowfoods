'use client';

/**
 * Meta de CMV de cada canal (N.2): quanto o custo físico do prato (insumos + embalagens do canal) pode ser do preço.
 * É o que comanda o preço sugerido de todas as fichas (custo físico ÷ meta) e o farol de CMV. A taxa do iFood fica fora
 * do CMV: ela aparece no resultado, não na meta. Ao lado, a conta com um prato de exemplo, pela mesma função das fichas.
 * Quem decide é o servidor (permissão, versão lida, faixa da meta).
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { CANAIS, ORDEM_DOS_CANAIS, type CanalVenda } from '@/lib/erp/canal-campos';
import { LIMITES_DA_META_DE_CMV, sugeridoPorCmv } from '@/lib/erp/cmv-produto-campos';
import { formatarDinheiro, lerPontosBase, pontosBaseParaCampo } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro } from '../../ui/campos';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, useAvisoDeSaida } from '../cadastro/erros';

const AJUDA_DO_CANAL: Record<CanalVenda, string> = {
  LOJA: 'Salão e balcão: só os insumos.',
  DELIVERY_PROPRIO: 'Insumos + embalagens do delivery.',
  IFOOD: 'Insumos + embalagens do iFood (a taxa fica fora).',
};

/** O prato de exemplo da conta ao lado: R$ 3,00 de custo físico. */
const EXEMPLO = 300;

export function FormMetasDeCmv({
  acao,
  aqui,
  versao,
  inicial,
  taxaConfigurada,
  bloqueio,
}: {
  acao: AcaoDeCadastro;
  aqui: string;
  versao: string;
  inicial: Record<CanalVenda, number | null>;
  /** A meta do iFood é guardada junto com a taxa dele: sem a taxa, o campo espera. */
  taxaConfigurada: boolean;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const saida = useAvisoDeSaida();
  const [textos, setTextos] = useState<Record<CanalVenda, string>>(
    () => Object.fromEntries(ORDEM_DOS_CANAIS.map((c) => [c, inicial[c] === null ? '' : pontosBaseParaCampo(inicial[c]!)])) as Record<CanalVenda, string>,
  );
  const erros = estado?.erros ?? {};
  const exemplo = (canal: CanalVenda) => {
    const t = textos[canal].trim();
    if (!t) return <span className="text-suave">sem meta: sem sugestão, farol sem dados</span>;
    const bp = lerPontosBase(t);
    if (bp === null || bp < LIMITES_DA_META_DE_CMV.minimoBp || bp > LIMITES_DA_META_DE_CMV.maximoBp) return <span className="text-suave">—</span>;
    const s = sugeridoPorCmv({ fisico: { valor: { num: BigInt(EXEMPLO), den: 1n }, embalagens: { num: 0n, den: 1n }, completo: true, falta: [] }, metaBp: bp });
    if (s.tipo !== 'ok') return <span className="text-suave">—</span>;
    return (
      <>
        sugere <strong className="font-semibold text-texto">{formatarDinheiro(s.centavos)}</strong>
      </>
    );
  };
  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      <input type="hidden" name="versao" value={versao} />
      <ErroGeral estado={estado} recarregar={aqui} />
      <fieldset disabled={!!bloqueio} className="min-w-0">
        <legend className="sr-only">Meta de CMV de cada canal</legend>
        <ul className="divide-y divide-linha">
          {ORDEM_DOS_CANAIS.map((canal) => {
            const id = `metaCmv-${canal}`;
            const espera = canal === 'IFOOD' && !taxaConfigurada;
            const erro = erros[id];
            return (
              <li key={canal} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto_15rem]">
                <div className="min-w-0">
                  <label htmlFor={id} className="text-[14px] font-medium text-texto">
                    {CANAIS[canal].rotulo}
                  </label>
                  <p id={`${id}-ajuda`} className={AJUDA.replace('mt-1.5', 'mt-0.5')}>
                    {espera ? 'Configure a taxa do iFood acima antes: a meta do iFood é guardada junto com ela.' : AJUDA_DO_CANAL[canal]}
                  </p>
                </div>
                <div className="flex items-stretch gap-2">
                  <div className="w-24 shrink-0">
                    <input
                      id={id}
                      name={`metaCmv_${canal}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={textos[canal]}
                      disabled={espera && !textos[canal]}
                      onChange={(e) => setTextos((t) => ({ ...t, [canal]: e.target.value }))}
                      className={`${CAMPO} min-h-11 text-right text-base font-semibold tabular-nums sm:text-sm`}
                      aria-invalid={!!erro}
                      aria-describedby={`${id}-ajuda ${id}-exemplo${erro ? ` ${id}-erro` : ''}`}
                    />
                  </div>
                  <span className="flex items-center text-[14px] text-suave">%</span>
                </div>
                <p id={`${id}-exemplo`} className="col-span-2 text-[12px] tabular-nums text-suave sm:col-span-1 sm:text-right" aria-live="polite">
                  Custo físico de R$ 3,00: {exemplo(canal)}
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
        Meta de CMV = quanto do preço o custo físico pode ser. Preço sugerido = custo físico ÷ meta. Pode ser igual ou diferente em cada canal. Vazio = sem
        meta. Mudar a meta não muda nenhum preço já definido.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <BotaoEnviar disabled={!!bloqueio} className="sm:min-w-44">
          Salvar metas de CMV
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
