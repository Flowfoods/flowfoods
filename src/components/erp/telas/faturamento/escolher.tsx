/**
 * "Lançar o dia" (2.1): escolher a loja e a data, quando a pessoa lança em mais
 * de uma loja. É um formulário GET (funciona sem JavaScript): a página lê
 * `loja` e `data`, confere e leva à tela do dia. Com uma loja só, nem chega
 * aqui (a página vai direto ao dia de hoje).
 */

import Link from 'next/link';
import { CampoData } from '../../ui/campo-data';
import { CAMPO, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { PageHeader } from '../../ui/cabecalho';
import { Painel, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { COR } from '@/lib/erp/modulos';
import { formatarData } from '@/lib/erp/compra-campos';
import { Voltar } from '../cadastro/partes';

export function TelaEscolherODia({
  base,
  lojas,
  lojaSugerida,
  hoje,
  ontem,
  dataDigitada,
  erro,
  contexto,
}: {
  base: string;
  lojas: { id: string; nome: string }[];
  lojaSugerida?: string;
  hoje: string;
  ontem: string;
  dataDigitada?: string;
  erro?: string;
  contexto: string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Lançar o dia' }]} />
      <Voltar href={base}>Voltar para o faturamento</Voltar>
      <PageHeader icone="dre" cor={COR.dre} titulo="Lançar o dia" subtitulo={`${contexto} · escolha a loja e a data`} />
      {lojas.length === 0 ? (
        <Painel>
          <Vazio titulo="Nenhuma loja para lançar.">Falta “lançar faturamento” numa loja ativa do seu acesso. Fale com quem cuida da equipe.</Vazio>
        </Painel>
      ) : (
        <>
          <Painel titulo="Qual loja e qual dia">
            <form method="get" action={`${base}/lancar`} className="space-y-4">
              <div>
                <label htmlFor="loja" className={ROTULO}>
                  Loja
                </label>
                <select id="loja" name="loja" defaultValue={lojaSugerida ?? ''} required className={CAMPO}>
                  <option value="" disabled>
                    Escolha a loja
                  </option>
                  {lojas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="data" className={ROTULO}>
                  Data
                </label>
                <CampoData id="data" name="data" defaultValue={dataDigitada ?? formatarData(hoje)} required aria-describedby="data-erro" />
                {erro && (
                  <p id="data-erro" role="alert" className="mt-1.5 text-[13px] text-erro">
                    {erro}
                  </p>
                )}
              </div>
              <button type="submit" className={classeDeBotao('primario', 'w-full sm:w-auto')}>
                Abrir o dia
              </button>
            </form>
          </Painel>
          <Painel titulo="Atalhos" subtitulo="Hoje e ontem, direto na loja." semRespiro>
            <ul className="divide-y divide-linha">
              {lojas.map((l) => (
                <li key={l.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-5">
                  <span className="min-w-0 truncate text-sm font-medium text-texto">{l.nome}</span>
                  <span className="flex gap-5">
                    <Link href={`${base}/${l.id}/${ontem}`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
                      Ontem
                    </Link>
                    <Link href={`${base}/${l.id}/${hoje}`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
                      Hoje
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </Painel>
        </>
      )}
    </div>
  );
}
