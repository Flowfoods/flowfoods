'use client';

import { FormularioComAcao } from '@/components/erp/ui/formulario-com-acao';

/**
 * Taxa do iFood do parceiro (1.9): comissão do plano + taxa de pagamento
 * online, em % do preço. A conta ao lado é prévia ("26,2% do preço · a cada
 * R$ 10,00, R$ 2,62"); quem decide é o servidor (permissão, versão lida).
 */

import Link from 'next/link';
import { taxaACadaDezReais } from '@/lib/erp/canal-campos';
import { formatarPontosBase, lerPontosBase } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import type { AcaoConfiguracao } from '@/lib/erp/canal-config-campos';
import { ErroGeral } from '../cadastro/erros';
import { useConfiguracaoConfirmada } from './configuracao-confirmada';

export function FormTaxaDoIfood({
  acao,
  aqui,
  versao,
  inicial,
  bloqueio,
  cancelar,
  variante = 'primario',
}: {
  acao: AcaoConfiguracao;
  aqui: string;
  /** `atualizadoEm` da linha lida ('' = sem linha; a linha pode ter só a meta, sem taxa). */
  versao: string;
  inicial: { comissao: string; pagamento: string };
  bloqueio: string | null;
  cancelar?: string;
  /** 1.10: na tela dos canais, o principal é o das margens-alvo. */
  variante?: 'primario' | 'secundario';
}) {
  const f = useConfiguracaoConfirmada(acao, versao, inicial);
  const { comissao, pagamento } = f.campos;
  const erros = f.erro?.erros ?? {};
  const c = lerPontosBase(comissao || '');
  const p = pagamento.trim() ? lerPontosBase(pagamento) : 0;
  const total = c !== null && p !== null && comissao.trim() ? c + p : null;
  const campo = (id: 'comissao' | 'pagamento', rotulo: string, valor: string, aoMudar: (v: string) => void, ajuda: string) => (
    <div>
      <label htmlFor={`taxa-${id}`} className={ROTULO}>
        {rotulo}
      </label>
      <div className="flex items-stretch gap-2">
        <div className="w-28 shrink-0">
          <input
            id={`taxa-${id}`}
            name={id}
            inputMode="decimal"
            autoComplete="off"
            value={valor}
            onChange={(e) => aoMudar(e.target.value)}
            className={`${CAMPO} min-h-11 text-right text-base font-semibold tabular-nums sm:text-sm`}
            aria-invalid={!!erros[id]}
            aria-describedby={`taxa-${id}-ajuda${erros[id] ? ` taxa-${id}-erro` : ''}`}
          />
        </div>
        <span className="flex items-center text-[14px] text-suave">% do preço</span>
      </div>
      <p id={`taxa-${id}-ajuda`} className={AJUDA}>
        {ajuda}
      </p>
      <Erro id={`taxa-${id}-erro`} texto={erros[id]} />
    </div>
  );
  return (
    <FormularioComAcao action={f.enviar} onChange={f.saida.aoMudar} onSubmit={f.saida.aoEnviar} noValidate className="space-y-4">
      <input type="hidden" name="versao" value={f.versao} />
      <ErroGeral estado={f.erro} recarregar={aqui} />
      {f.estado?.ok && !f.alterado && <p role="status" className="text-sm text-ok">{f.estado.mensagem}</p>}
      <fieldset disabled={!!bloqueio || f.pendente} className="grid gap-4 sm:grid-cols-2">
        {campo('comissao', 'Comissão do plano', comissao, v => f.mudar('comissao', v), 'O que o iFood fica de cada pedido pelo plano contratado.')}
        {campo('pagamento', 'Pagamento online', pagamento, v => f.mudar('pagamento', v), 'Taxa sobre o pedido pago pelo app. Vazio = 0.')}
      </fieldset>
      <p className="rounded-[10px] border border-linha px-4 py-3 text-[13px] tabular-nums text-texto" aria-live="polite">
        {total !== null && total < 10_000 ? (
          <>
            <strong className="font-semibold">{formatarPontosBase(total)} do preço</strong> vão para o iFood: a cada R$ 10,00 de venda,{' '}
            {taxaACadaDezReais(total)}.
          </>
        ) : (
          <span className="text-suave">Digite a comissão (e o pagamento online, se houver) para ver a conta.</span>
        )}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {cancelar && (
          <Link href={cancelar} className={classeDeBotao('fantasma')}>
            Cancelar
          </Link>
        )}
        <BotaoEnviar disabled={!!bloqueio || f.pendente} variante={variante} className="sm:min-w-44">
          Salvar taxa do iFood
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </FormularioComAcao>
  );
}
