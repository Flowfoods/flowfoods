'use client';

/**
 * Lançar ou editar uma despesa (2.2a), a MESMA tela no nível 1 e na pessoa do
 * parceiro. Pensada para o celular: campos de 44 px, valor à direita, rodapé fixo.
 *
 * Só TEXTO sobe: o servidor lê, valida e refaz a conta (valor, competência,
 * apropriação); a prévia aqui é só prévia. O formulário leva um `envio` aleatório
 * (duplo clique ou reenvio = uma só despesa, "já lançada") e, na edição, a versão
 * que a tela leu (duas abas: a segunda recebe o conflito e nada é sobrescrito).
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { rotuloDoMes } from '@/lib/erp/faturamento-campos';
import { apropriar, diasDaCompetencia, lerCompetencia, lerValorDaDespesa, type TipoDeCompetencia } from '@/lib/erp/despesa-campos';
import { GRUPOS_DE_DESPESA, ROTULO_DO_GRUPO, type GrupoDoDre } from '@/lib/erp/dre-plano';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { CampoData } from '../../ui/campo-data';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Segmentos } from '../../ui/segmentos';
import { Painel } from '../../ui/superficies';
import { fechadoNoIntervalo, periodoDaFraseDeRecusa, type AvisoDePeriodos } from '@/lib/erp/periodo-fechado-campos';
import { AvisoDoPeriodoFechado } from '../../ui/aviso-periodo-fechado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import type { AcaoDeCadastro, EstadoCadastro } from './estado';

export interface LinhaParaOFormulario {
  chave: string;
  nome: string;
  grupo: GrupoDoDre;
}

export interface InicialDaDespesa {
  lojaId: string;
  linha: string;
  descricao: string;
  valor: string;
  tipo: TipoDeCompetencia;
  dia: string;
  mes: string;
  de: string;
  ate: string;
  recorrente: boolean;
  vencimento: string;
}

const NUMERO = `${CAMPO} min-h-12 text-right text-[17px] font-semibold tabular-nums sm:min-h-[44px]`;

const ROTULOS: Record<string, string> = { valor: 'Valor', descricao: 'Descrição', linha: 'Linha do DRE', loja: 'Loja', competencia: 'Competência', vencimento: 'Vencimento', recorrente: 'Repete todo mês' };

/** Os meses que o seletor oferece: de 3 anos atrás a 12 meses à frente, mais o que a despesa já tem. */
function mesesParaEscolher(hoje: string, atual: string): string[] {
  const out: string[] = [];
  const [a, m] = hoje.split('-').map(Number);
  for (let i = -36; i <= 12; i++) {
    const t = a * 12 + (m - 1) + i;
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`);
  }
  if (atual && !out.includes(atual)) out.push(atual);
  return out.sort().reverse();
}

export function FormDespesa({
  acao,
  linhas,
  lojas,
  podeRede,
  inicial,
  hoje,
  envio,
  versao,
  voltar,
  rotuloDoBotao,
  bloqueio,
  periodoFechado,
  periodos,
}: {
  acao: AcaoDeCadastro;
  linhas: LinhaParaOFormulario[];
  lojas: { id: string; nome: string }[];
  podeRede: boolean;
  inicial: InicialDaDespesa;
  hoje: string;
  /** Identificador aleatório deste formulário (lançar). Na edição, vazio. */
  envio: string;
  /** `atualizadoEm` lido (editar). Vazio ao lançar. */
  versao: string;
  voltar: string;
  rotuloDoBotao: string;
  bloqueio: string | null;
  /** Despesa que cai em período fechado: só o que não muda o DRE (vencimento, descrição, repetir) se edita. */
  periodoFechado?: boolean;
  /** Os períodos fechados e o de agora: a competência que já cai num fechado é avisada antes de enviar. */
  periodos: AvisoDePeriodos;
}) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const saida = useAvisoDeSaida();
  const [v, setV] = useState(inicial);
  const mudar = (p: Partial<InicialDaDespesa>) => {
    setV((x) => ({ ...x, ...p }));
    saida.aoMudar();
  };
  const erros = estado?.erros ?? {};
  const travado = !!bloqueio;
  const meses = useMemo(() => mesesParaEscolher(hoje, inicial.mes), [hoje, inicial.mes]);

  const valor = lerValorDaDespesa(v.valor);
  const comp = lerCompetencia({ tipo: v.tipo, dia: v.dia, mes: v.mes, de: v.de, ate: v.ate }, hoje);
  const dias = comp.ok ? diasDaCompetencia(comp.competencia) : null;
  // Período fechado: o que a competência digitada já diz, ou o que o servidor acabou de recusar.
  const fechadoDaCompetencia = periodoFechado ? null : ((comp.ok ? fechadoNoIntervalo(periodos.fechados, comp.competencia.inicio, comp.competencia.fim)?.nome : null) ?? periodoDaFraseDeRecusa(erros.competencia));
  const fechadoNoGeral = periodoDaFraseDeRecusa(estado?.erros?.geral);
  const porDia = valor.ok && comp.ok ? formatarDinheiro(apropriar(valor.centavos, comp.competencia, { de: comp.competencia.inicio, ate: comp.competencia.inicio })) : null;
  const apoio =
    valor.ok && comp.ok && dias! > 1
      ? `${formatarDinheiro(valor.centavos)} em ${dias} dias: o DRE apropria cerca de ${porDia} por dia.`
      : valor.ok && comp.ok
        ? `${formatarDinheiro(valor.centavos)} num dia só.`
        : '';

  const porGrupo = GRUPOS_DE_DESPESA.map((g) => ({ g, itens: linhas.filter((l) => l.grupo === g) })).filter((x) => x.itens.length > 0);

  return (
    <form action={enviar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      <input type="hidden" name="envio" value={envio} />
      <input type="hidden" name="versao" value={versao} />
      {fechadoNoGeral ? <AvisoDoPeriodoFechado periodo={fechadoNoGeral} href={periodos.href} frase="Esta despesa é desse período: não dá para corrigir nem remover." /> : <ErroGeral estado={estado} recarregar={voltar} />}
      <ResumoDeErros erros={erros} idBase="desp" rotulos={(c) => ROTULOS[c] ?? c} />
      <fieldset disabled={travado} className="min-w-0 space-y-4">
        <Painel titulo="O que é">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="desp-linha" className={ROTULO}>
                Linha do DRE
              </label>
              <select id="desp-linha" name="linha" value={v.linha} onChange={(e) => mudar({ linha: e.target.value })} className={CAMPO} aria-invalid={!!erros.linha} aria-describedby="desp-linha-erro" disabled={periodoFechado}>
                <option value="">Escolha a linha…</option>
                {porGrupo.map(({ g, itens }) => (
                  <optgroup key={g} label={ROTULO_DO_GRUPO[g]}>
                    {itens.map((l) => (
                      <option key={l.chave} value={l.chave}>
                        {l.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {periodoFechado && <input type="hidden" name="linha" value={v.linha} />}
              <Erro id="desp-linha-erro" texto={erros.linha} />
            </div>
            <div>
              <label htmlFor="desp-loja" className={ROTULO}>
                De qual loja
              </label>
              <select id="desp-loja" name="lojaId" value={v.lojaId} onChange={(e) => mudar({ lojaId: e.target.value })} className={CAMPO} aria-invalid={!!erros.loja} aria-describedby="desp-loja-ajuda desp-loja-erro" disabled={periodoFechado}>
                {podeRede && <option value="">Rede (todas as lojas)</option>}
                {!podeRede && v.lojaId === '' && <option value="">Escolha a loja…</option>}
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
              {periodoFechado && <input type="hidden" name="lojaId" value={v.lojaId} />}
              <p id="desp-loja-ajuda" className={AJUDA}>
                {v.lojaId === '' ? 'Despesa da rede entra só no DRE da rede, sem rateio nas lojas.' : 'Entra no DRE desta loja e no da rede.'}
              </p>
              <Erro id="desp-loja-erro" texto={erros.loja} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <div>
              <label htmlFor="desp-descricao" className={ROTULO}>
                Descrição
              </label>
              <input id="desp-descricao" name="descricao" value={v.descricao} onChange={(e) => mudar({ descricao: e.target.value })} maxLength={140} autoComplete="off" placeholder="Ex.: Aluguel da loja de Vila da Penha" className={CAMPO} aria-invalid={!!erros.descricao} aria-describedby="desp-descricao-erro" />
              <Erro id="desp-descricao-erro" texto={erros.descricao} />
            </div>
            <div>
              <label htmlFor="desp-valor" className={ROTULO}>
                Valor (R$)
              </label>
              <input id="desp-valor" name="valor" value={v.valor} onChange={(e) => mudar({ valor: e.target.value })} inputMode="decimal" autoComplete="off" placeholder="0,00" className={NUMERO} aria-invalid={!!erros.valor} aria-describedby="desp-valor-erro" disabled={periodoFechado} />
              {periodoFechado && <input type="hidden" name="valor" value={v.valor} />}
              <Erro id="desp-valor-erro" texto={erros.valor} />
            </div>
          </div>
        </Painel>

        <Painel titulo="A que período pertence" subtitulo="O DRE conta pela competência: a luz de outubro é de outubro, mesmo paga em novembro.">
          <div className="space-y-4">
            <Segmentos
              nome="tipo"
              legenda="A despesa é de"
              opcoes={[
                ['dia', 'Um dia'],
                ['mes', 'Um mês'],
                ['intervalo', 'Um período'],
              ]}
              valor={v.tipo}
              aoMudar={(t) => mudar({ tipo: t, recorrente: t === 'mes' ? v.recorrente : false })}
            />
            {periodoFechado && <input type="hidden" name="tipo" value={v.tipo} />}
            {v.tipo === 'dia' && (
              <div className="max-w-56">
                <label htmlFor="desp-dia" className={ROTULO}>
                  Dia
                </label>
                <CampoData id="desp-dia" name="dia" value={v.dia} onChange={(e) => mudar({ dia: e.target.value })} aria-describedby="desp-comp-erro" disabled={periodoFechado} />
              </div>
            )}
            {v.tipo === 'mes' && (
              <div className="max-w-64">
                <label htmlFor="desp-mes" className={ROTULO}>
                  Mês
                </label>
                <select id="desp-mes" name="mes" value={v.mes} onChange={(e) => mudar({ mes: e.target.value })} className={CAMPO} aria-describedby="desp-comp-erro" disabled={periodoFechado}>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {rotuloDoMes(m)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {v.tipo === 'intervalo' && (
              <div className="grid max-w-md grid-cols-2 gap-3">
                <div>
                  <label htmlFor="desp-de" className={ROTULO}>
                    Primeiro dia
                  </label>
                  <CampoData id="desp-de" name="de" value={v.de} onChange={(e) => mudar({ de: e.target.value })} aria-describedby="desp-comp-erro" disabled={periodoFechado} />
                </div>
                <div>
                  <label htmlFor="desp-ate" className={ROTULO}>
                    Último dia
                  </label>
                  <CampoData id="desp-ate" name="ate" value={v.ate} onChange={(e) => mudar({ ate: e.target.value })} aria-describedby="desp-comp-erro" disabled={periodoFechado} />
                </div>
              </div>
            )}
            {periodoFechado && (
              <>
                <input type="hidden" name="dia" value={v.dia} />
                <input type="hidden" name="mes" value={v.mes} />
                <input type="hidden" name="de" value={v.de} />
                <input type="hidden" name="ate" value={v.ate} />
              </>
            )}
            <Erro id="desp-comp-erro" texto={fechadoDaCompetencia ? undefined : erros.competencia} />
            {fechadoDaCompetencia && (
              <AvisoDoPeriodoFechado
                id="desp-periodo-fechado"
                periodo={fechadoDaCompetencia}
                href={periodos.href}
                frase="Uma despesa com competência nele não entra."
                alternativa={periodos.emCurso ? `Ou lance com competência em ${periodos.emCurso}.` : 'Ou lance com competência no período em aberto.'}
              />
            )}
            <p aria-live="polite" className="min-h-5 text-[13px] tabular-nums text-suave">
              {apoio}
            </p>
            {v.tipo === 'mes' && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-texto">
                <input type="checkbox" name="recorrente" checked={v.recorrente} onChange={(e) => mudar({ recorrente: e.target.checked })} className={MARCAR} />
                Repete todo mês (aluguel, salário, luz)
              </label>
            )}
            <Erro id="desp-recorrente-erro" texto={erros.recorrente} />
          </div>
        </Painel>

        <Painel titulo="Conta a pagar" subtitulo="Opcional. O vencimento não muda o DRE; ele só põe a despesa no filtro “A pagar”.">
          <div className="max-w-56">
            <label htmlFor="desp-vencimento" className={ROTULO}>
              Vence em
            </label>
            <CampoData id="desp-vencimento" name="vencimento" value={v.vencimento} onChange={(e) => mudar({ vencimento: e.target.value })} aria-describedby="desp-vencimento-erro" />
            <Erro id="desp-vencimento-erro" texto={erros.vencimento} />
          </div>
        </Painel>
      </fieldset>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-linha bg-fundo px-4 py-3 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6 lg:-mx-8 lg:px-8">
        <Link href={voltar} className={classeDeBotao('fantasma', 'w-full sm:w-auto')}>
          Voltar sem salvar
        </Link>
        <BotaoEnviar pendente="Salvando…" className="w-full sm:w-auto sm:min-w-40" disabled={travado}>
          {rotuloDoBotao}
        </BotaoEnviar>
      </div>
    </form>
  );
}
