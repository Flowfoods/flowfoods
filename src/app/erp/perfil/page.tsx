import { EditorImagem } from '@/components/erp/telas/identidade/editor-imagem';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Painel } from '@/components/erp/ui/superficies';
import { exigirPessoa } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';

export const dynamic = 'force-dynamic';

/** O perfil é da pessoa autenticada, independente da marca e do parceiro selecionados. */
export default async function MeuPerfilPage() {
  const { usuario } = await exigirPessoa();
  const url = '/erp/perfil/foto';
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Meu perfil' }]} />
      <Voltar href="/erp">Voltar para as áreas da rede</Voltar>
      <PageHeader icone="acesso" cor={COR.rede} titulo="Meu perfil" subtitulo={usuario.nome} />
      <Painel titulo="Sua foto" className="max-w-2xl">
        <EditorImagem contexto={usuario.id} url={url} atual={usuario.fotoArquivo ? `${url}?v=${encodeURIComponent(usuario.fotoArquivo)}` : null} nome={usuario.nome} tipo="foto" />
      </Painel>
      <p className="max-w-2xl text-sm text-suave">A foto é pessoal. As logos das marcas são cadastradas em Lojas e marcas, na seção Identidade visual.</p>
    </div>
  );
}
