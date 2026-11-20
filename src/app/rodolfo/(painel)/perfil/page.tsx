import { EditorImagem } from '@/components/erp/telas/identidade/editor-imagem';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Painel } from '@/components/erp/ui/superficies';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { obterFotoPessoalNivel1 } from '@/lib/erp/identidade';
import { COR } from '@/lib/erp/modulos';

export const dynamic = 'force-dynamic';

export default async function MeuPerfilNivel1Page() {
  const sessao = await exigirNivel1();
  const foto = await obterFotoPessoalNivel1(sessao);
  const url = '/rodolfo/perfil/foto';
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Meu perfil' }]} />
      <Voltar href="/rodolfo">Voltar para o início</Voltar>
      <PageHeader icone="acesso" cor={COR.rede} titulo="Meu perfil" subtitulo={sessao.autorNome} />
      <Painel titulo="Sua foto" className="max-w-2xl">
        <EditorImagem contexto={sessao.userId} url={url} atual={foto ? `${url}?v=${encodeURIComponent(foto)}` : null} nome={sessao.autorNome} tipo="foto" />
      </Painel>
      <p className="max-w-2xl text-sm text-suave">A foto é pessoal e permanece ao navegar entre parceiros. A logo de cada marca fica em Lojas e marcas, na seção Identidade visual do parceiro.</p>
    </div>
  );
}
