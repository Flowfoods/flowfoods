/**
 * Importar leads em tela própria (E5.1, revisão de UX), como as importações do ERP: largura limitada, trilha, Voltar e
 * "Como funciona" em passos. Antes era um formulário no fim da lista de Leads.
 */

import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Painel } from '@/components/erp/ui/superficies';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { ImportarForm } from '../importar-form';

export const dynamic = 'force-dynamic';

export default async function ImportarLeadsPage() {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Importar leads' }]} />
      <Voltar href="/rodolfo/leads">Voltar para Leads</Voltar>
      <PageHeader icone="importar" cor={COR.comercial} titulo="Importar leads" subtitulo="A planilha do ledsflowfoods vira leads prontos para a cadência" />
      <Painel titulo="Como funciona">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-suave marker:text-texto">
          <li>No ledsflowfoods, exporte a planilha e copie o conteúdo exportado.</li>
          <li>Dê um nome ao lote (a região e o mês, por exemplo) e cole o conteúdo abaixo.</li>
          <li>Quem tem celular fica pronto para a cadência de WhatsApp; quem já estava na base com o mesmo celular é atualizado, sem duplicar.</li>
          <li>Telefone fixo ou sem telefone vai para Visita e Instagram.</li>
          <li>Conflito com o Grupo Bibi Sucos e quem já pediu para sair entram na lista, mas nunca recebem mensagem (o bloqueio é pelo telefone).</li>
          <li>Nada é enviado na importação: os leads só recebem mensagem quando entram num lote que você aprova, em Cadência.</li>
        </ol>
      </Painel>
      <Painel titulo="Planilha">
        <ImportarForm />
      </Painel>
    </div>
  );
}
