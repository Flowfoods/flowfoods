'use client';

/**
 * Importar fichas por planilha (1.2), a MESMA tela para o nível 1 e para a
 * pessoa do parceiro. Dois passos, nada gravado no primeiro: enviar o CSV, ver a
 * prévia ficha a ficha (nova, muda, igual, com erro e a linha) e importar,
 * numa transação só. Reimportar a mesma planilha não duplica: o que já está
 * igual fica como está.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import type { FichaNaPrevia, SituacaoNaPrevia } from '@/lib/erp/ficha-importar';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo, type Tom } from '../../ui/superficies';
import type { AcaoDeImportacao, EstadoImportacao } from './estado';

const SITUACAO: Record<SituacaoNaPrevia, { rotulo: string; tom: Tom }> = {
  nova: { rotulo: 'Nova', tom: 'ok' },
  muda: { rotulo: 'Vai mudar', tom: 'alerta' },
  igual: { rotulo: 'Igual, fica como está', tom: 'neutro' },
  erro: { rotulo: 'Com erro, não entra', tom: 'erro' },
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function LinhaDaPrevia({ f, novoInsumo }: { f: FichaNaPrevia; novoInsumo?: string }) {
  const s = SITUACAO[f.situacao];
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 font-medium text-texto">
          {f.nome} <span className="text-[12px] font-normal text-suave">linha {f.linhas}</span>
        </p>
        <Selo tom={s.tom}>{s.rotulo}</Selo>
      </div>
      {f.situacao !== 'erro' && (
        <p className="mt-0.5 text-[13px] tabular-nums text-suave">
          {plural(f.itens, 'insumo', 'insumos')} · rende {f.rende} · {f.custo}
          {f.incompleto && <span className="text-atencao"> · custo incompleto (insumo sem preço)</span>}
          {f.mudancas.length > 0 && <span> · muda: {f.mudancas.join(', ')}</span>}
        </p>
      )}
      {f.erros.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[13px] text-erro">
          {f.erros.map((e, i) => (
            <li key={i}>
              Linha {e.linha}: {e.mensagem}
            </li>
          ))}
        </ul>
      )}
      {f.faltam.length > 0 && novoInsumo && (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          {f.faltam.map((n) => (
            <Link key={n} href={`${novoInsumo}?nome=${encodeURIComponent(n)}`} className={LINK_DE_TEXTO}>
              Cadastrar “{n}”
            </Link>
          ))}
        </p>
      )}
    </li>
  );
}

export function TelaImportarFichas({
  acaoPrevia,
  acaoImportar,
  base,
  novoInsumo,
  bloqueio,
}: {
  acaoPrevia: AcaoDeImportacao;
  acaoImportar: AcaoDeImportacao;
  base: string;
  /** Link de novo insumo (para quem pode cadastrar insumos). */
  novoInsumo?: string;
  bloqueio: string | null;
}) {
  // Um estado só: a prévia, e por cima dela o erro ou o resultado da importação
  // (um erro ao importar mantém a prévia na tela).
  const [estado, enviar] = useFormState<EstadoImportacao, FormData>(
    (anterior, form) => (form.get('passo') === 'importar' ? acaoImportar(anterior, form) : acaoPrevia(anterior, form)),
    null,
  );
  const [arquivo, setArquivo] = useState<string | null>(null);
  const previa = estado?.previa;
  const entram = previa ? previa.contagem.nova + previa.contagem.muda : 0;

  if (estado?.resultado) {
    const r = estado.resultado;
    return (
      <div className="space-y-4">
        <Aviso tom="ok" titulo="Importação concluída.">
          {plural(r.criadas, 'ficha criada', 'fichas criadas')}, {plural(r.alteradas, 'alterada', 'alteradas')},{' '}
          {plural(r.iguais, 'já estava igual', 'já estavam iguais')}
          {r.comErro > 0 ? ` e ${plural(r.comErro, 'com erro ficou de fora', 'com erro ficaram de fora')}` : ''}. Tudo está no histórico.
        </Aviso>
        <div className="flex flex-wrap gap-2">
          <Link href={base} className={classeDeBotao('primario')}>
            Ver as fichas
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
            Uma linha por insumo. As colunas da ficha (tipo, rende, descrição e modo de preparo) basta preencher numa das linhas dela. O insumo precisa
            estar cadastrado com o mesmo nome; a quantidade vai em g, kg, ml, L ou un.
          </p>
          <p className="rounded-[7px] border border-linha bg-campo px-3 py-2 font-mono text-[12px] text-texto [overflow-wrap:anywhere]">
            ficha;tipo;rende;unidade_rende;descricao;modo_de_preparo;insumo;quantidade;unidade
          </p>
          <a href="/modelos/fichas-tecnicas.csv" download className={classeDeBotao('secundario')}>
            Baixar o modelo (CSV)
          </a>
          <p className={AJUDA}>Abre no Excel ou no Google Planilhas. Salve como CSV. Fotos entram depois, na própria ficha.</p>
        </div>
      </Painel>

      <Painel titulo="Enviar a planilha">
        <form action={enviar} className="space-y-3">
          <input type="hidden" name="passo" value="previa" />
          <fieldset disabled={!!bloqueio} className="min-w-0 space-y-3">
            <div>
              <span className={ROTULO}>Arquivo CSV</span>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="planilha"
                  name="planilha"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  onChange={(e) => setArquivo(e.target.files?.[0]?.name ?? null)}
                  className="peer sr-only"
                />
                <label
                  htmlFor="planilha"
                  className={classeDeBotao(
                    'secundario',
                    'cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento',
                  )}
                >
                  Escolher arquivo
                </label>
                <span className="min-w-0 truncate text-sm text-suave">{arquivo ?? 'Nenhum arquivo escolhido'}</span>
              </div>
              <p className={AJUDA}>Até 256 KB. Nada é gravado agora: primeiro você vê a prévia.</p>
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
            {plural(previa.contagem.nova, 'nova', 'novas')} · {plural(previa.contagem.muda, 'vai mudar', 'vão mudar')} ·{' '}
            {plural(previa.contagem.igual, 'igual', 'iguais')} · {plural(previa.contagem.erro, 'com erro', 'com erro')}
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
            {previa.fichas.map((f) => (
              <LinhaDaPrevia key={f.nome} f={f} novoInsumo={novoInsumo} />
            ))}
          </ul>
          <form action={enviar} className="flex flex-col gap-2 border-t border-linha px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <input type="hidden" name="passo" value="importar" />
            <input type="hidden" name="texto" value={estado?.texto ?? ''} />
            <p className="text-[13px] text-suave">
              {entram > 0
                ? `Entram ${plural(entram, 'ficha', 'fichas')}, numa vez só.${previa.contagem.erro > 0 ? ' As com erro ficam de fora até você corrigir e enviar de novo.' : ''}`
                : 'Nada para importar: corrija os erros, ou a planilha já está igual ao cadastro.'}
            </p>
            <BotaoEnviar disabled={entram === 0 || !!bloqueio} pendente="Importando…" className="sm:min-w-44">
              {entram > 0 ? `Importar ${plural(entram, 'ficha', 'fichas')}` : 'Importar'}
            </BotaoEnviar>
          </form>
        </Painel>
      )}
    </div>
  );
}
