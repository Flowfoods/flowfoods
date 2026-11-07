'use client';

/**
 * Embalagens por canal da ficha (1.9), a MESMA peça no nível 1 e na pessoa
 * do parceiro. Dois painéis — Delivery próprio e iFood —, cada um com as suas
 * linhas: embalagem (só insumo tipo Embalagem do estoque) + quanto vai em UMA
 * porção (un, ou g/kg, ml/L). Sem fator: a embalagem entra inteira. A conta
 * ao lado é PRÉVIA, pela mesma regra; quem decide é o servidor (permissão,
 * lista lida, insumo do parceiro, tipo).
 */

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { useFormState } from 'react-dom';
import type { EmbalagemDoFormulario } from '@/lib/erp/canais';
import { CANAIS, type CanalComEmbalagem } from '@/lib/erp/canal-campos';
import { SIGLAS_DIGITAVEIS } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { classeDeBotao } from '../../ui/estilos';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import { AvisoDeRascunho, AvisoDeRascunhoVelho, guardarRascunho, useRascunhoDaTela } from '../cadastro/rascunho';
import { AvisoInsumoCriado } from '../insumos/atalho-novo-insumo';
import type { PrecosDasEmbalagens } from './conta-das-embalagens';
import { CamposEmbalagens, type LinhaDaEmbalagem } from './campos-embalagens';
export type { LinhaDaEmbalagem } from './campos-embalagens';
type RascunhoEmbalagens = { linhas: LinhaDaEmbalagem[]; retorno: { canal: CanalComEmbalagem; indice: number } };

export function FormEmbalagens(props: PropsDoFormEmbalagens) {
  // I.1b: voltou de "Cadastrar em Insumos"? O que estava preenchido volta junto, e a embalagem nova já está na lista.
  const r = useRascunhoDaTela<LinhaDaEmbalagem[] | RascunhoEmbalagens>(props.impressao);
  const [descartou, setDescartou] = useState(false);
  const completo = !descartou && r.valores && !Array.isArray(r.valores) && Array.isArray(r.valores.linhas) ? r.valores : null;
  const recuperado = !descartou && Array.isArray(r.valores) ? r.valores : completo?.linhas ?? null;
  const criado = !descartou && r.insumoCriado ? props.opcoes.find((o) => o.id === r.insumoCriado && o.embalagem) : undefined;
  let linhas = recuperado ?? props.inicial;
  let escolhido = false;
  if (criado) {
    const vaga = completo ? linhas.findIndex((l, n) => n === completo.retorno.indice && l.canal === completo.retorno.canal && !l.insumoId) : linhas.findIndex((l) => !l.insumoId);
    if (vaga >= 0) {
      linhas = linhas.map((l, n) => (n === vaga ? { ...l, insumoId: criado.id, unidade: SIGLAS_DIGITAVEIS[criado.unidade].includes(l.unidade) ? l.unidade : SIGLAS_DIGITAVEIS[criado.unidade][0] } : l));
      escolhido = true;
    }
  }
  return (
    <FormEmbalagensBase
      // O rascunho só é lido depois do primeiro desenho: quando chega (ou se descarta), o formulário nasce de novo com os valores certos.
        key={r.valores === undefined ? 'carregando' : descartou ? 'descartado' : 'pronto'}
      {...props}
      inicial={linhas}
      gravadas={props.inicial}
      chaveDoRascunho={r.chave}
      avisos={
        <>
          {criado && <AvisoInsumoCriado nome={criado.nome} escolhido={escolhido} />}
          <AvisoDeRascunhoVelho quando={r.versaoMudou} oQue="A lista de embalagens da ficha" />
          <AvisoDeRascunho
            quando={!!recuperado}
            aoDescartar={() => {
              r.descartar();
              setDescartou(true);
            }}
          />
        </>
      }
    />
  );
}

type PropsDoFormEmbalagens = {
  acao: AcaoDeCadastro;
  aqui: string;
  cancelar: string;
  opcoes: EmbalagemDoFormulario[];
  inicial: LinhaDaEmbalagem[];
  /** A lista que esta tela leu (o servidor confere antes de gravar). */
  impressao: string;
  /** Custo de uma porção da ficha (fração em texto: BigInt não atravessa). */
  porcao: { num: string; den: string };
  /** A parte conhecida da receita não pode parecer um custo completo. */
  faltaPreco: string[];
  podeConferirPrecos: boolean;
  bloqueio: string | null;
  /** Link para cadastrar insumo (só para quem pode). */
  novoInsumo?: string;
  /** Meta, preço escolhido e oferta de cada canal: sem isso, a tela não mostra sugestão nem CMV (compatível). */
  precos?: PrecosDasEmbalagens | null;
  /** Insumos que são itens diretos da receita salva: embalagem repetida no canal ganha um aviso (sem bloquear). */
  naReceita?: readonly string[];
  de?: string;
};

function FormEmbalagensBase({
  acao,
  aqui,
  cancelar,
  opcoes,
  inicial,
  impressao,
  porcao,
  faltaPreco,
  podeConferirPrecos,
  bloqueio,
  novoInsumo,
  precos,
  gravadas,
  naReceita,
  de,
  chaveDoRascunho,
  avisos,
}: PropsDoFormEmbalagens & { chaveDoRascunho: string; avisos: ReactNode; gravadas: readonly LinhaDaEmbalagem[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const saida = useAvisoDeSaida(estado);
  const [linhas, setLinhas] = useState(() => inicial.map((l, i) => ({ ...l, chave: i })));
  const erros = estado?.erros ?? {};
  function guardarOQueFoiPreenchido(canal: CanalComEmbalagem, chave?: number) {
    let proximas = linhas;
    let indice = linhas.findIndex(l => l.chave === chave && l.canal === canal && !l.insumoId);
    if (indice < 0) {
      indice = linhas.length;
      proximas = [...linhas, { chave: Math.max(-1, ...linhas.map(l => l.chave)) + 1, canal, insumoId: '', quantidade: '1', unidade: 'un' }];
      setLinhas(proximas);
    }
    const guardado = guardarRascunho(chaveDoRascunho, { linhas: proximas.map(({ chave: _c, ...l }) => l), retorno: { canal, indice } } satisfies RascunhoEmbalagens, impressao);
    setFalhaDeRascunho(!guardado);
    return guardado;
  }
  const [falhaDeRascunho, setFalhaDeRascunho] = useState(false);
  const idBase = 'embalagens';
  const rotuloDoErro = (campo: string) => {
    const m = /^emb-(DELIVERY_PROPRIO|IFOOD)-(\d+)$/.exec(campo);
    return m ? `${CANAIS[m[1] as CanalComEmbalagem].rotulo}, linha ${Number(m[2]) + 1}` : campo;
  };

  return (
    <form ref={formRef} action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      <input type="hidden" name="impressao" value={impressao} />
      {de && <input type="hidden" name="de" value={de} />}
      {avisos}
      {falhaDeRascunho && <p role="alert" className="text-sm text-atencao">Não foi possível guardar o rascunho. Mantenha esta tela aberta e cadastre a embalagem em outra aba.</p>}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={rotuloDoErro} />
      <ErroGeral estado={estado} recarregar={aqui} />

      <CamposEmbalagens opcoes={opcoes} linhas={linhas} aoMudar={proximas => { setLinhas(proximas); saida.aoMudar(); }} gravadas={gravadas} porcao={{ num: BigInt(porcao.num), den: BigInt(porcao.den) }} faltaPreco={faltaPreco} precos={precos} naReceita={naReceita} novoInsumo={novoInsumo} aoCadastrar={guardarOQueFoiPreenchido} erros={erros} desabilitado={!!bloqueio} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio} variante={podeConferirPrecos ? 'secundario' : 'primario'} className="sm:min-w-44">
          Salvar embalagens
        </BotaoEnviar>
        {podeConferirPrecos && <BotaoEnviar nome="continuar" valor="precos" disabled={!!bloqueio}>Salvar e conferir preços</BotaoEnviar>}
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
