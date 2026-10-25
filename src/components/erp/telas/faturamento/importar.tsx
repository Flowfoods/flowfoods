'use client';

/**
 * Importar faturamento por planilha (2.1), a MESMA tela para o nível 1 e para
 * a pessoa do parceiro. Dois passos, nada gravado no primeiro: enviar o CSV,
 * ver a prévia linha a linha (nova, vai mudar com antes → depois, igual, com
 * erro e o motivo) e importar numa transação só. Reimportar a mesma planilha
 * não duplica: o dia é o mesmo, e o que já está igual fica como está. O texto
 * da planilha é só lido como texto: o eco de célula é cortado e escapado
 * (nada de HTML da planilha na tela).
 */

import Link from 'next/link';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { CANAIS } from '@/lib/erp/canal-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import type { LinhaDaPrevia, SituacaoNaPrevia } from '@/lib/erp/faturamento';
import type { NumerosDoCanal } from '@/lib/erp/faturamento-campos';
import { fraseDoNumero } from '@/lib/erp/faturamento-campos';
import { CABECALHO_DO_MODELO, LIMITES_DA_PLANILHA } from '@/lib/erp/faturamento-planilha';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Aviso, Painel, Selo, type Tom } from '../../ui/superficies';
import type { AcaoDeImportacaoDeFaturamento, EstadoDaImportacao } from './estado';
import { PontoDeAjuda, useTemPonto } from '../../ui/ponto-de-ajuda';

const SITUACAO: Record<SituacaoNaPrevia, { rotulo: string; tom: Tom }> = {
  nova: { rotulo: 'Nova', tom: 'ok' },
  muda: { rotulo: 'Vai mudar', tom: 'alerta' },
  igual: { rotulo: 'Igual, fica como está', tom: 'neutro' },
  erro: { rotulo: 'Com erro, não entra', tom: 'erro' },
};
const ORDEM: Record<SituacaoNaPrevia, number> = { erro: 0, muda: 1, nova: 2, igual: 3 };
const MOSTRAR_ATE = 300;

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

function Numeros({ n }: { n: NumerosDoCanal }) {
  return <span className="tabular-nums">{fraseDoNumero(n)}</span>;
}

function LinhaDaTabela({ l }: { l: LinhaDaPrevia }) {
  const s = SITUACAO[l.situacao];
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 font-medium text-texto">
          {l.lojaNome ? `${l.lojaNome} · ${CANAIS[l.canal!].curto} · ${formatarData(l.data!)}` : 'Linha sem leitura'}{' '}
          <span className="text-[12px] font-normal text-suave">linha {l.linha}</span>
        </p>
        <Selo tom={s.tom}>{s.rotulo}</Selo>
      </div>
      {l.situacao === 'erro' ? (
        <p className="mt-0.5 text-[13px] text-erro">{l.erro}</p>
      ) : l.situacao === 'muda' && l.antes && l.depois ? (
        <p className="mt-0.5 text-[13px] text-suave">
          <Numeros n={l.antes} /> <span className="text-texto">passa para</span> <Numeros n={l.depois} />
        </p>
      ) : l.depois ? (
        <p className="mt-0.5 text-[13px] text-suave">
          <Numeros n={l.depois} />
        </p>
      ) : null}
    </li>
  );
}

export function TelaImportarFaturamento({
  acaoPrevia,
  acaoImportar,
  base,
  bloqueio,
}: {
  acaoPrevia: AcaoDeImportacaoDeFaturamento;
  acaoImportar: AcaoDeImportacaoDeFaturamento;
  base: string;
  bloqueio: string | null;
}) {
  const temPontoDoArquivo = useTemPonto('arquivo');
  // Um estado só: a prévia, e por cima dela o erro ou o resultado da importação
  // (um erro ao importar mantém a prévia na tela).
  const [estado, enviar] = useFormState<EstadoDaImportacao, FormData>(
    async (anterior, form) => {
      const r = await (form.get('passo') === 'importar' ? acaoImportar(anterior, form) : acaoPrevia(anterior, form));
      // Erro ao importar mantém a prévia e o texto que a pessoa viu (menos quando o mundo mudou: aí a prévia é outra).
      return form.get('passo') === 'importar' && r?.erro && !r.mudou ? { ...anterior, ...r, previa: anterior?.previa, texto: anterior?.texto, arquivo: anterior?.arquivo } : r;
    },
    null,
  );
  const [arquivo, setArquivo] = useState<string | null>(null);
  const previa = estado?.previa;
  const entram = previa ? previa.contagem.nova + previa.contagem.muda : 0;
  const ordenadas = previa ? [...previa.linhas].sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.linha - b.linha) : [];

  if (estado?.resultado) {
    const r = estado.resultado;
    return (
      <div className="space-y-4">
        <Aviso tom="ok" titulo="Importação concluída.">
          {plural(r.criadas, 'lançamento criado', 'lançamentos criados')}, {plural(r.alteradas, 'corrigido', 'corrigidos')}, {plural(r.iguais, 'já estava igual', 'já estavam iguais')}
          {r.comErro > 0 ? ` e ${plural(r.comErro, 'linha com erro ficou de fora', 'linhas com erro ficaram de fora')}` : ''}. O antes e o depois estão no histórico.
        </Aviso>
        <div className="flex flex-wrap gap-2">
          <Link href={base} className={classeDeBotao('primario')}>
            Ver o faturamento
          </Link>
          <a href={`${base}/importar`} className={classeDeBotao('secundario')}>
            Importar outra planilha
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Painel titulo="Modelo da planilha">
        <div className="space-y-3 text-sm text-suave">
          <p>
            Uma linha por loja, canal e dia. A loja vai pelo nome, como no cadastro; o canal é loja, delivery ou ifood. Dia em que o canal não vendeu leva 0 em
            faturamento e em pedidos. Clientes pode ficar em branco (vale o número de pedidos).
          </p>
          <p className="rounded-[7px] border border-linha bg-campo px-3 py-2 font-mono text-[12px] text-texto [overflow-wrap:anywhere]">{CABECALHO_DO_MODELO}</p>
          <a href="/modelos/faturamento.csv" download className={classeDeBotao('secundario')}>
            Baixar o modelo (CSV)
          </a>
          {temPontoDoArquivo ? (
            <div className="mt-1.5 flex items-center gap-1">
              <p className={AJUDA.replace('mt-1.5', '')}>Colunas separadas por ponto e vírgula; salve como CSV.</p>
              <PontoDeAjuda ponto="arquivo" className="-my-3 sm:-my-1.5" />
            </div>
          ) : (
            <p className={AJUDA}>
              Separe as colunas com ponto e vírgula (a vírgula é o decimal do Brasil). Abre no Excel ou no Google Planilhas; salve como CSV. Célula que começa com =, +, - ou @ é
              recusada.
            </p>
          )}
        </div>
      </Painel>

      <Painel titulo="Enviar a planilha">
        <form action={enviar} className="space-y-3">
          <input type="hidden" name="passo" value="previa" />
          <fieldset disabled={!!bloqueio} className="min-w-0 space-y-3">
            <div>
              <span className={ROTULO}>Arquivo CSV</span>
              <div className="flex flex-wrap items-center gap-3">
                <input id="planilha" name="planilha" type="file" accept=".csv,text/csv" required onChange={(e) => setArquivo(e.target.files?.[0]?.name ?? null)} className="peer sr-only" />
                <label
                  htmlFor="planilha"
                  className={classeDeBotao('secundario', 'cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento')}
                >
                  Escolher arquivo
                </label>
                <span className="min-w-0 truncate text-sm text-suave">{arquivo ?? 'Nenhum arquivo escolhido'}</span>
              </div>
              <p className={AJUDA}>
                Até 256 KB, 5.000 linhas, {LIMITES_DA_PLANILHA.colunas} colunas e {LIMITES_DA_PLANILHA.caracteresPorCampo} letras por campo. Nada é gravado agora: primeiro você vê a prévia.
              </p>
            </div>
            <BotaoEnviar variante="secundario" pendente="Lendo a planilha…">
              Ver a prévia
            </BotaoEnviar>
          </fieldset>
          {bloqueio && <p className="text-[13px] text-suave">{bloqueio}</p>}
        </form>
      </Painel>

      {estado?.erro && (
        <div role="alert" className="rounded-[10px] border border-erro/40 px-4 py-3 text-sm text-erro">
          {estado.erro}
        </div>
      )}

      {previa && (
        <Painel
          titulo={`Prévia${estado?.arquivo ? ` · ${estado.arquivo}` : ''}`}
          semRespiro
          acessorio={<span className="text-[12px] tabular-nums text-suave">{plural(previa.linhasLidas, 'linha', 'linhas')}</span>}
        >
          <p className="border-b border-linha px-4 py-3 text-sm sm:px-5" aria-live="polite">
            {plural(previa.contagem.nova, 'nova', 'novas')} · {plural(previa.contagem.muda, 'vai mudar', 'vão mudar')} · {plural(previa.contagem.igual, 'igual', 'iguais')} ·{' '}
            {plural(previa.contagem.erro, 'com erro', 'com erro')}
          </p>
          {previa.erros.length > 0 && (
            <ul className="space-y-0.5 border-b border-linha px-4 py-3 text-[13px] text-erro sm:px-5">
              {previa.erros.map((e, i) => (
                <li key={i}>
                  Linha {e.linha}: {e.mensagem}
                </li>
              ))}
            </ul>
          )}
          <ul className="divide-y divide-linha">
            {ordenadas.slice(0, MOSTRAR_ATE).map((l) => (
              <LinhaDaTabela key={l.linha} l={l} />
            ))}
          </ul>
          {ordenadas.length > MOSTRAR_ATE && (
            <p className="border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5">
              Mostrando {MOSTRAR_ATE} de {ordenadas.length.toLocaleString('pt-BR')} linhas: os erros e o que vai mudar vêm primeiro. Todas entram na importação.
            </p>
          )}
          <form action={enviar} className="flex flex-col gap-2 border-t border-linha px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <input type="hidden" name="passo" value="importar" />
            <input type="hidden" name="texto" value={estado?.texto ?? ''} />
            <input type="hidden" name="impressao" value={previa.impressao} />
            <input type="hidden" name="arquivo" value={estado?.arquivo ?? ''} />
            <p className="text-[13px] text-suave">
              {entram > 0
                ? `Entram ${plural(entram, 'lançamento', 'lançamentos')} (cada um é uma loja, um canal e um dia), numa vez só.${previa.contagem.erro > 0 ? ' As linhas com erro ficam de fora até você corrigir e enviar de novo.' : ''}`
                : 'Nada para importar: corrija os erros, ou a planilha já está igual ao que foi lançado.'}
            </p>
            <BotaoEnviar disabled={entram === 0 || !!bloqueio} pendente="Importando…" className="sm:min-w-44">
              {entram > 0 ? `Importar ${plural(entram, 'lançamento', 'lançamentos')}` : 'Importar'}
            </BotaoEnviar>
          </form>
        </Painel>
      )}
    </div>
  );
}
