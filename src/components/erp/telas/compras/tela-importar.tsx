/**
 * Importar o XML da nota fiscal (F.1b), a MESMA tela do nível 1 e da pessoa do parceiro: o que é o arquivo, de onde vem e o que
 * acontece depois (nada é lançado até a conferência). O formulário é o `FormImportarXml`.
 */

import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Painel } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeDocumento } from './documentos-estado';
import { FormImportarXml } from './form-importar';

export function TelaImportarXml({ base, contexto, acao, bloqueio }: { base: string; contexto: string; acao: AcaoDeDocumento; bloqueio: string | null }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Importar XML' }]} />
      <Voltar href={base}>Voltar para as notas recebidas</Voltar>
      <PageHeader icone="importar" cor={COR.compras} titulo="Importar XML da nota" subtitulo={`${contexto} · o sistema lê a nota e você só escolhe o insumo de cada item`} />
      <Painel titulo="Como funciona">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-suave marker:text-texto">
          <li>Você envia o arquivo XML que o fornecedor mandou com a nota. O sistema lê os itens e os valores.</li>
          <li>Nada é lançado ainda: a nota fica esperando a sua conferência.</li>
          <li>Para cada item você escolhe o insumo e a embalagem. Da próxima nota do mesmo fornecedor em diante, o sistema já lembra.</li>
          <li>Quando tudo confere, você concilia: a nota de compra é lançada e o custo e o estoque seguem a regra de sempre.</li>
        </ol>
        <p className="mt-3 border-t border-linha pt-3 text-[12px] text-suave">
          O sistema não pede senha, certificado nem acesso ao site do governo que autoriza as notas (a SEFAZ): só o arquivo. A assinatura digital da nota não é conferida aqui, por isso a conferência dos itens e dos valores é sempre sua.
        </p>
      </Painel>
      <FormImportarXml acao={acao} base={base} bloqueio={bloqueio} />
    </div>
  );
}
