'use client';

import { FormularioComAcao } from '@/components/erp/ui/formulario-com-acao';

import { CANAIS, ORDEM_DOS_CANAIS } from '@/lib/erp/canal-campos';
import { CAMPOS_DO_FAROL, campoDaFaixa, lerCortesDoFarol, type CampoDoFarol, type ConfiguracaoDoFarol, type CortesDoFarol } from '@/lib/erp/cmv-faixas-campos';
import { pontosBaseParaCampo } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, ROTULO } from '../../ui/campos';
import { ExplicacaoNoPonto } from '../../ui/ponto-de-ajuda';
import type { AcaoConfiguracao } from '@/lib/erp/canal-config-campos';
import { ErroGeral } from '../cadastro/erros';
import { IntervalosDoFarol } from './farol';
import { useConfiguracaoConfirmada } from './configuracao-confirmada';

export const ROTULOS_DOS_CORTES: Record<CampoDoFarol, string> = {
  a: 'Favorável a partir de', b: 'Confortável a partir de', c: 'Confortável até', d: 'Atenção até',
};
const textoDosCortes = (c: CortesDoFarol | null): Record<CampoDoFarol, string> => ({ a: c ? pontosBaseParaCampo(c.aBp) : '', b: c ? pontosBaseParaCampo(c.bBp) : '', c: c ? pontosBaseParaCampo(c.cBp) : '', d: c ? pontosBaseParaCampo(c.dBp) : '' });

export function FormFaixasDeCmv({ acao, aqui, versao, inicial, bloqueio }: { acao: AcaoConfiguracao; aqui: string; versao: string; inicial: ConfiguracaoDoFarol; bloqueio: string | null }) {
  const f = useConfiguracaoConfirmada(acao, versao, Object.fromEntries(ORDEM_DOS_CANAIS.flatMap(canal => Object.entries(textoDosCortes(inicial[canal])).map(([campo, valor]) => [campoDaFaixa(canal, campo as CampoDoFarol), valor]))));
  const erros = f.erro?.erros ?? {};
  return <FormularioComAcao action={f.enviar} onChange={f.saida.aoMudar} onSubmit={f.saida.aoEnviar} noValidate className="space-y-5">
    <input type="hidden" name="versao" value={f.versao} />
    <ErroGeral estado={f.erro} recarregar={aqui} />
    {f.estado?.ok && !f.alterado && <p role="status" className="text-sm text-ok">{f.estado.mensagem}</p>}
    <p className="text-[13px] text-suave">Use até duas casas decimais. Os quatro limites devem crescer nessa ordem. Para retirar as faixas de um canal, deixe os quatro campos vazios.</p>
    {ORDEM_DOS_CANAIS.map(canal => {
      const previa = lerCortesDoFarol(Object.fromEntries(CAMPOS_DO_FAROL.map(campo => [campo, f.campos[campoDaFaixa(canal, campo)]])));
      return <fieldset key={canal} disabled={!!bloqueio || f.pendente} className="min-w-0 space-y-3 border-t border-linha pt-4">
        <legend className="pr-2 text-[15px] font-semibold text-texto">{CANAIS[canal].rotulo}</legend>
        <div className="grid gap-3 sm:grid-cols-2">{CAMPOS_DO_FAROL.map(campo => {
          const id = campoDaFaixa(canal, campo), erro = erros[id];
          return <div key={campo} className="min-w-0"><label htmlFor={id} className={ROTULO}>{ROTULOS_DOS_CORTES[campo]}</label><div className="flex items-center gap-2"><input id={id} name={id} inputMode="decimal" autoComplete="off" value={f.campos[id]} onChange={e => f.mudar(id, e.target.value)} className={`${CAMPO} min-w-0 text-right tabular-nums`} aria-invalid={!!erro} aria-describedby={`${canal}-intervalos${erro ? ` ${id}-erro` : ''}`} /><span className="text-sm text-suave">%</span></div><Erro id={`${id}-erro`} texto={erro} /></div>;
        })}</div>
        <div id={`${canal}-intervalos`} className="space-y-2" aria-live="polite">
          <p className="text-[12px] font-semibold text-suave">Prévia dos intervalos — ainda não salva</p>
          {previa.ok ? <><IntervalosDoFarol cortes={previa.dados} />{!previa.dados && CAMPOS_DO_FAROL.some(campo => f.baseCampos[campoDaFaixa(canal, campo)]) && <p className="text-[12px] text-suave">Ao salvar, somente as faixas deste canal serão retiradas. A meta e os preços permanecem.</p>}</> : <p className="text-[13px] text-suave">{Array.from(new Set(Object.values(previa.erros))).join(' ')}</p>}
        </div>
      </fieldset>;
    })}
    <ExplicacaoNoPonto ponto="faixas-cmv"><p className="text-[12px] text-suave">O farol classifica o CMV sem arredondar. A meta continua separada e comanda a sugestão de preço. Alterar estes limites não muda preços definidos nem registros anteriores.</p></ExplicacaoNoPonto>
    <div className="flex flex-col gap-2 sm:items-end"><BotaoEnviar disabled={!!bloqueio || f.pendente} className="sm:min-w-44">Salvar faixas de CMV</BotaoEnviar>{bloqueio && <p className="text-[13px] text-suave">{bloqueio}</p>}</div>
  </FormularioComAcao>;
}
