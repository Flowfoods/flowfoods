'use client';

/**
 * Fechar o período (2.2b, decisão 152). Cada ressalva é marcada uma a uma e a justificativa é UMA só
 * (de 10 a 300 letras); o formulário leva a impressão das condições que a pessoa viu, e o servidor confere
 * tudo de novo dentro da transação de fechar. Condição dura não passa por aqui: não existe campo para ela.
 */

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { useAvisoDeSaida } from '../cadastro/erros';
import { LIMITES_DO_FECHAMENTO, rotuloDaRessalva, type Ressalva } from '@/lib/erp/dre-fechamento-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import type { AcaoLocal, EstadoLocal } from './estado';

export function FormFechar({
  acao,
  ressalvas,
  impressao,
  raiz,
  bloqueio,
}: {
  acao: AcaoLocal;
  ressalvas: Ressalva[];
  impressao: string;
  /** `/erp` ou `/rodolfo/erp/<slug>`. */
  raiz: string;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoLocal, FormData>(acao, null);
  const saida = useAvisoDeSaida();
  const erros = estado?.erros ?? {};
  const comRessalva = ressalvas.length > 0;
  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      <input type="hidden" name="impressao" value={impressao} />
      {erros.geral && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
          <p className="text-erro">{erros.geral}</p>
          {estado?.conflito && (
            <a href="" className="text-[13px] font-medium underline underline-offset-4">
              Recarregar e conferir de novo
            </a>
          )}
        </div>
      )}
      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        {comRessalva && (
          <div>
            <legend className="mb-2 text-[13px] font-semibold text-texto">Fechar mesmo assim? Marque cada ressalva para confirmar que sabe.</legend>
            <ul className="divide-y divide-linha rounded-[10px] border border-linha">
              {ressalvas.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-3 py-3">
                  <input id={`ressalva-${r.id}`} type="checkbox" name="ressalva" value={r.id} className={`${MARCAR} mt-0.5`} aria-describedby={`ressalva-${r.id}-detalhe`} />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`ressalva-${r.id}`} className="block cursor-pointer text-sm font-medium leading-snug text-texto">
                      {r.titulo}
                    </label>
                    <p id={`ressalva-${r.id}-detalhe`} className="mt-0.5 text-[12px] leading-snug text-suave">
                      <span className="font-medium text-texto">{rotuloDaRessalva[r.tipo]}.</span> {r.detalhe}
                    </p>
                    {r.tipo === 'RECORRENTE' && r.mesAlvo && (
                      <Link href={`${raiz}/dre/despesas/nova?modo=mes-passado&mes=${r.mesAlvo}`} className={`${LINK_DE_TEXTO} mt-1 inline-block text-[13px]`}>
                        Lançar com o valor do mês passado
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Erro id="fechar-ressalvas-erro" texto={erros.ressalvas} />
            <div className="mt-4">
              <label htmlFor="fechar-justificativa" className={ROTULO}>
                Justificativa, para quem abrir este fechamento depois (de {LIMITES_DO_FECHAMENTO.justificativaMin} a {LIMITES_DO_FECHAMENTO.justificativaMax} letras)
              </label>
              <textarea
                id="fechar-justificativa"
                name="justificativa"
                rows={3}
                maxLength={LIMITES_DO_FECHAMENTO.justificativaMax}
                className={`${CAMPO} min-h-24`}
                aria-invalid={!!erros.justificativa}
                aria-describedby="fechar-justificativa-erro"
              />
              <Erro id="fechar-justificativa-erro" texto={erros.justificativa} />
              <p className="mt-1.5 text-[12px] text-suave">Vai para a fotografia e para o Histórico. O DRE fechado mostra “Fechado com ressalvas” para sempre.</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <BotaoEnviar pendente="Fechando…" disabled={!!bloqueio}>
            {comRessalva ? 'Fechar mesmo assim' : 'Fechar o período'}
          </BotaoEnviar>
          <p className="text-[12px] text-suave">A fotografia não muda depois. Só a FlowFoods reabre.</p>
        </div>
      </fieldset>
    </form>
  );
}
