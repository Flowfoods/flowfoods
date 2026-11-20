'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { iniciais } from '@/lib/erp/modulos';
import { classeDeBotao } from '../../ui/estilos';
import { erroDaEscolha, gravarImagem } from './envio-imagem';

type Props = {
  /** Rota privada vinculada à marca ou à própria pessoa. Nunca recebe URL externa. */
  url: string;
  atual: string | null;
  nome: string;
  tipo: 'logo' | 'foto';
  podeEditar?: boolean;
  /** A rota de foto pessoal é igual para todos; a chave impede preservar a escolha após trocar de pessoa. */
  contexto?: string;
};

/** A troca de marca ou pessoa descarta a escolha local da imagem anterior. */
export function EditorImagem(props: Props) {
  return <Edicao key={`${props.url}:${props.contexto ?? ''}`} {...props} />;
}

function Edicao({ url, atual, nome, tipo, podeEditar = true }: Props) {
  const router = useRouter();
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const pedido = useRef<AbortController | null>(null);
  const [alteracao, setAlteracao] = useState<{ anterior: string | null; nova: string | null } | null>(null);
  // Mostra a alteração confirmada enquanto chega o refresh. Uma versão nova do servidor passa a valer sem apagar a mensagem de sucesso.
  const gravada = alteracao?.anterior === atual ? alteracao.nova : atual;
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [falhaDaImagem, setFalhaDaImagem] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const mostrada = previa ?? gravada;
  const falhouImagem = !!mostrada && falhaDaImagem === mostrada;
  const rotulo = tipo === 'logo' ? 'Logo' : 'Foto';

  useEffect(() => () => pedido.current?.abort(), []);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  function descartar() {
    setArquivo(null);
    setPrevia(null);
    setFalhaDaImagem(null);
    if (entrada.current) entrada.current.value = '';
  }

  function escolher(novo: File | undefined) {
    if (!novo || pedido.current) return;
    setMensagem(null);
    const aviso = erroDaEscolha(novo);
    setErro(aviso);
    if (aviso) {
      descartar();
      return;
    }
    setArquivo(novo);
    setPrevia(URL.createObjectURL(novo));
    setFalhaDaImagem(null);
  }

  async function salvar(remover = false) {
    if (pedido.current || (!remover && !arquivo)) return;
    const controlador = new AbortController();
    pedido.current = controlador;
    setOcupado(true);
    setErro(null);
    setMensagem(null);
    const resultado = await gravarImagem(url, remover ? null : arquivo, controlador.signal);
    if (controlador.signal.aborted) return;
    pedido.current = null;
    setOcupado(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    descartar();
    setAlteracao({ anterior: atual, nova: remover ? null : `${url}?v=${Date.now()}` });
    setMensagem(`${rotulo} ${remover ? 'removida' : 'salva'}.`);
    router.refresh();
  }

  return (
    <div className="min-w-0 space-y-3" aria-busy={ocupado}>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`grid shrink-0 place-items-center overflow-hidden border border-linha bg-forte text-xl font-semibold text-suave ${tipo === 'foto' ? 'h-24 w-24 rounded-full' : 'h-24 w-40 rounded-campo'}`}>
          {mostrada && !falhouImagem ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem privada autenticada ou prévia blob, incompatíveis com o otimizador público.
            <img key={mostrada} src={mostrada} alt={`${rotulo} de ${nome}`} className="h-full w-full object-contain" onError={() => setFalhaDaImagem(mostrada)} />
          ) : <span aria-label={`Iniciais de ${nome}`}>{iniciais(nome)}</span>}
        </div>
        <div className="min-w-0 flex-1 basis-40 space-y-2">
          <p id={`${id}-ajuda`} className="text-[12px] text-suave">
            {tipo === 'logo' ? 'A logo aparece no cabeçalho quando esta marca estiver selecionada.' : 'Sua foto aparece no menu do usuário e permanece ao trocar de marca.'}
          </p>
          {podeEditar && (
            <>
              <input ref={entrada} id={id} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={ocupado} onChange={(e) => escolher(e.target.files?.[0])} />
              <button type="button" className={classeDeBotao('secundario')} disabled={ocupado} aria-describedby={`${id}-ajuda ${id}-formatos${erro ? ` ${id}-erro` : ''}`} onClick={() => entrada.current?.click()}>{gravada || arquivo ? `Trocar ${tipo}` : `Escolher ${tipo}`}</button>
              <p id={`${id}-formatos`} className="text-[12px] text-suave">JPG, PNG ou WebP, até 8 MB. A proporção da imagem é preservada.</p>
            </>
          )}
        </div>
      </div>
      {falhouImagem && <p className="text-[12px] text-suave">Não foi possível exibir a imagem. {podeEditar ? 'Escolha outra ou tente recarregar a página.' : 'Tente recarregar a página.'}</p>}
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          {arquivo && <>
            <button type="button" className={classeDeBotao('primario')} disabled={ocupado} onClick={() => void salvar()}>{ocupado ? 'Salvando…' : `Salvar ${tipo}`}</button>
            <button type="button" className={classeDeBotao('fantasma')} disabled={ocupado} onClick={() => { descartar(); setErro(null); }}>Cancelar</button>
          </>}
          {gravada && !arquivo && <button type="button" className={classeDeBotao('fantasma')} disabled={ocupado} onClick={() => void salvar(true)}>{ocupado ? 'Removendo…' : `Remover ${tipo}`}</button>}
        </div>
      )}
      {arquivo && <p className="text-[12px] text-suave">Prévia. Salve para aplicar no sistema.</p>}
      <p id={`${id}-erro`} role="status" aria-live="polite" className={`min-h-5 text-[13px] ${erro ? 'text-erro' : 'text-ok'}`}>{erro ?? mensagem}</p>
    </div>
  );
}
