'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import type { IdentidadeDoCabecalho, MarcaDoCabecalho } from '@/lib/erp/marca-cabecalho';
import { Dialogo } from '../ui/Dialogo';
import { EditorImagem } from '../telas/identidade/editor-imagem';
import type { PropsDoShell } from './tipos';
import { MenuUsuario } from './MenuUsuario';
import { Popover } from './Popover';
import { ImagemDeIdentidade } from './ImagemDeIdentidade';

export function CabecalhoIdentidade({ props, slug, inicio, menuRecolhido }: { props: PropsDoShell; slug: string | null; inicio: string; menuRecolhido: boolean }) {
  const identidade = props.identidade;
  const chave = `${props.chaveDoContexto ?? ''}:${slug ?? ''}`;
  const [carregado, setCarregado] = useState<{ chave: string; dados: IdentidadeDoCabecalho } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  // "Trocar logo da marca" (decisão 536): a marca cuja logo está sendo trocada, presa ao abrir com a rota e o parceiro (trocar
  // a marca do cabeçalho com a janela aberta não muda de quem é a logo). A janela não depende de `dados`: no nível 1, salvar
  // recarrega o layout e os dados do cabeçalho somem por um instante enquanto voltam; a janela, e o "Logo salva.", ficam.
  const [logoDe, setLogoDe] = useState<{ marca: MarcaDoCabecalho; base: string; parceiroId: string } | null>(null);
  const geracao = useRef(0);
  const carregar = identidade?.modo === 'nivel1' ? identidade.carregar : null;
  const revisao = identidade?.modo === 'nivel1' ? identidade.revisao : null;

  useEffect(() => {
    let vigente = true;
    geracao.current++;
    setPendente(false);
    setFalha(null);
    setCarregado(null);
    if (carregar && slug) {
      void carregar(slug).then((dados) => {
        if (vigente) setCarregado({ chave, dados });
      }).catch(() => { if (vigente) setFalha('Não foi possível carregar as marcas. Recarregue a página.'); });
    }
    return () => { vigente = false; geracao.current++; };
  }, [carregar, slug, chave, revisao]);

  const dados = identidade?.modo === 'parceiro' ? identidade.dados : carregado?.chave === chave ? carregado.dados : null;
  // O cookie altera e revalida o layout. A seleção vem sempre do servidor,
  // inclusive após refresh motivado por outra aba; não manter uma cópia otimista antiga.
  const id = dados?.selecionada;
  const marca = dados?.marcas.find((m) => m.id === id) ?? dados?.marcas[0];

  async function escolher(id: string, fechar: () => void) {
    if (!identidade || pendente || !dados?.marcas.some((m) => m.id === id)) return;
    const atual = geracao.current;
    setPendente(true);
    setFalha(null);
    try {
      const r = identidade.modo === 'parceiro' ? await identidade.escolher(id) : slug ? await identidade.escolher(slug, id) : null;
      if (atual !== geracao.current) return;
      if (!r?.ok) { setFalha(r?.mensagem ?? 'Não foi possível trocar a marca. Tente novamente.'); return; }
      fechar();
    } catch { if (atual === geracao.current) setFalha('Não foi possível trocar a marca. Tente novamente.'); }
    finally { if (atual === geracao.current) setPendente(false); }
  }

  return (
    <header className="ff-cabecalho-identidade ff-material" data-menu={menuRecolhido ? 'recolhido' : 'expandido'} aria-label="Identidade do sistema">
      <div className="ff-cabecalho-grade">
        <Link href={inicio} className="ff-assinatura-central" aria-label="FlowFoods — início. BARNEY OS">
          <span className="ff-assinatura-pilha">
            {/* FlowFoods numa linha só (prévia aprovada em 23/11/2026, decisão 535): as duas palavras saem da MESMA imagem
                oficial transparente, recortadas pelo CSS e postas lado a lado, alinhadas pela base. Nenhum arquivo novo e nenhum
                pixel redesenhado. O CSS acompanha o tema antes da hidratação. */}
            <span className="ff-logo-linha" aria-hidden>
              {(['flow', 'foods'] as const).map((palavra) => (
                <span key={palavra} className={`ff-logo-palavra ff-logo-${palavra}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ff-logo-claro" src="/identidade/flowfoods-claro-transparente.png" alt="" width={1080} height={1080} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ff-logo-escuro" src="/identidade/flowfoods-escuro-transparente.png" alt="" width={1080} height={1080} />
                </span>
              ))}
            </span>
            <span className="ff-barney-os">BARNEY <span>OS</span></span>
          </span>
        </Link>
        <div className="ff-cabecalho-marca" aria-busy={pendente}>
          {dados ? <Popover
            rotulo={`Marca no cabeçalho: ${marca?.nome ?? 'nenhuma cadastrada'}`}
            classeDoWrapper="w-full"
            classeDoBotao="ff-marca-selecionada ff-transicao"
            alinhar="esquerda"
            // O painel nasce do seletor (Expansão, decisão 535): a segunda janela que já existia a receber o movimento.
            expansao
            conteudoDoBotao={<>
              <span className="ff-marca-imagem" aria-hidden><ImagemDeIdentidade key={marca?.logoUrl ?? marca?.id} url={marca?.logoUrl} nome={marca?.nome ?? dados.nomeParceiro} /></span>
              <span className="sr-only">Marca selecionada</span>
              <span className="ff-marca-nome">{marca?.nome ?? dados.nomeParceiro}</span>
              <ChevronDown size={15} className="ff-marca-seta" aria-hidden />
            </>}
          >{(fechar) => <div>
            <p className="px-3 py-2 text-[12px] text-suave">Marca no cabeçalho</p>
            <ul>{dados.marcas.map((m) => <li key={m.id}><button type="button" disabled={pendente} aria-pressed={marca?.id === m.id} onClick={() => void escolher(m.id, fechar)} className="flex min-h-11 w-full items-center gap-3 rounded-botao px-3 py-2 text-left text-[13px] hover:bg-texto/5 aria-pressed:bg-forte disabled:opacity-60">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-forte" aria-hidden><ImagemDeIdentidade key={m.logoUrl ?? m.id} url={m.logoUrl} nome={m.nome} /></span><span className="min-w-0 break-words">{m.nome}</span>
            </button></li>)}</ul>
            {dados.logoBase && marca && <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                // `fechar` devolve o foco ao seletor antes de a janela abrir: é para ele que o foco volta quando ela fecha.
                setLogoDe({ marca, base: dados.logoBase!, parceiroId: dados.parceiroId });
                fechar();
              }}
              className="ff-transicao mt-2 flex min-h-11 w-full items-center gap-3 rounded-botao border-t border-linha px-3 py-2.5 text-left hover:bg-texto/5"
            >
              <Pencil size={16} aria-hidden className="shrink-0 text-acento" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Trocar logo da marca</span>
                <span className="block break-words text-[12px] text-suave">Altera a imagem de {marca.nome}</span>
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-suave" />
            </button>}
            {dados.perfilHref && <Link onClick={fechar} href={dados.perfilHref} className={`block rounded-botao px-3 py-3 text-[13px] hover:bg-texto/5 ${dados.logoBase && marca ? '' : 'mt-2 border-t border-linha'}`}>Identidade visual das marcas</Link>}
            {dados.marcas.length === 0 && <p className="px-3 py-2 text-[13px] text-suave">Nenhuma marca cadastrada.</p>}
          </div>}</Popover> : <p className="text-center text-[12px] text-suave">{slug && carregar ? 'Carregando marca…' : 'FlowFoods'}</p>}
          {falha && <p role="alert" className="mt-2 text-center text-[12px] text-erro">{falha}</p>}
        </div>
        <div className="ff-cabecalho-conta"><MenuUsuario usuario={props.usuario} tema={props.tema} links={props.links} sair={props.sair} /></div>
      </div>
      {/* "Trocar logo da marca" (decisão 536): o MESMO editor da Identidade visual (prévia, Salvar logo, Cancelar), na rota da
          marca escolhida. Só aparece para quem pode alterar (`logoBase`); a rota confere de novo. Não mexe na foto pessoal, na
          marca selecionada nem em outra marca. Salvar recarrega o cabeçalho com a logo nova. */}
      <Dialogo aberto={logoDe !== null} aoFechar={() => setLogoDe(null)} titulo={logoDe ? `Logo de ${logoDe.marca.nome}` : 'Logo da marca'}>
        {logoDe && (
          <div className="px-5 pb-5 pt-4">
            <EditorImagem url={`${logoDe.base}/${encodeURIComponent(logoDe.marca.id)}/logo`} atual={logoDe.marca.logoUrl} nome={logoDe.marca.nome} tipo="logo" contexto={`${logoDe.parceiroId}:${logoDe.marca.id}`} />
          </div>
        )}
      </Dialogo>
    </header>
  );
}
