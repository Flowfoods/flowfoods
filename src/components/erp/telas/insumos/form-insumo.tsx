'use client';

import { FormularioComAcao } from '@/components/erp/ui/formulario-com-acao';

/**
 * Formulário do insumo (novo e editar), a MESMA peça para o nível 1 e para a
 * pessoa do parceiro: a action vem de quem usa a tela. Tudo vai como texto; o
 * servidor converte, calcula e confere (permissão, versão lida, unidade
 * travada). Erro volta para o lado do campo, sem perder o que foi digitado;
 * com vários, um resumo no topo leva a cada um.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useActionState } from 'react';

import { AJUDA_DO_TIPO, MARCA_MAXIMA, TIPOS, TIPOS_DO_FORM, type TipoInsumo } from '@/lib/erp/insumo-campos';
import { rotuloDaVolta } from '@/lib/erp/volta';
import { CHAVE_DO_SISTEMA } from '@/lib/erp/categoria-campos';
import { nomeDaChave, sugerirCategoria } from '@/lib/erp/categoria-sugestao';
import type { OpcaoDeCategoria } from '@/lib/erp/categorias';
import { CONSERVACOES, entradaDoFormulario, lerValidades, type Conservacao, type Validades } from '@/lib/erp/validade';
import { UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { PontoDeAjuda, useTemPonto } from '../../ui/ponto-de-ajuda';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Segmentos } from '../../ui/segmentos';
import { Painel } from '../../ui/superficies';
import { CamposDeConservacao } from './campos-conservacao';
import { CamposDaEmbalagem, EMBALAGEM_VAZIA, type ValoresDaEmbalagem } from './campos-embalagem';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import { SalvandoAnunciado, useAcaoSegura } from '../cadastro/anuncio';
import { guardarRascunho, useRascunhoDaTela } from '../cadastro/rascunho';

export interface ValoresDoInsumo extends ValoresDaEmbalagem {
  nome: string;
  tipo: TipoInsumo;
  /** '' = ainda não escolheu (I.1a: a unidade base é obrigatória e não vem marcada). */
  unidade: Unidade | '';
  /** I.1a: a categoria escolhida ('' = nenhuma ainda). */
  categoriaId: string;
  /** I.1b: '' = ainda não escolhida (cadastro novo): a conservação não tem valor padrão. */
  conservacao: Conservacao | '';
  /** I.1b: a marca de referência (texto informativo, opcional). */
  marcaReferencia: string;
  /** 1.4: principal + prazo de uso depois de aberto em cada conservação (opcional). */
  validades: Validades | null;
}

export const INSUMO_NOVO: ValoresDoInsumo = { nome: '', tipo: 'INGREDIENTE', unidade: '', categoriaId: '', conservacao: '', marcaReferencia: '', validades: null, ...EMBALAGEM_VAZIA };

/**
 * "Cadastrar outro insumo": tipo e unidade do último (só valores da lista valem: a URL nunca escolhe mais que isso). A
 * conservação NÃO é lembrada (I.1b): ela é escolhida a cada insumo, para o frango não herdar o Seco da farinha.
 */
function valoresLembrados(l?: { tipo?: string; unidade?: string }): Partial<ValoresDoInsumo> {
  const v: Partial<ValoresDoInsumo> = {};
  if (l?.tipo && (TIPOS_DO_FORM as readonly string[]).includes(l.tipo)) v.tipo = l.tipo as TipoInsumo;
  if (l?.unidade && Object.hasOwn(UNIDADES, l.unidade)) v.unidade = l.unidade as Unidade;
  return v;
}

const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: 'Nome',
  tipo: 'Tipo de item',
  categoriaId: 'Categoria',
  marcaReferencia: 'Marca de referência',
  unidade: 'Unidade base',
  conservacao: 'Conservação',
  conteudo: 'Quanto vem na embalagem',
  preco: 'Custo inicial de referência',
  frete: 'Frete',
};

/** O texto de "obrigatório" que acompanha o rótulo: dito em palavras, não só por cor ou asterisco. */
const OBRIGATORIO = <span className="font-normal text-suave"> (obrigatório)</span>;

/** O id da categoria da casa que a sugestão aponta: a da chave, se está na lista; senão "Outros / a classificar". */
function idDaSugestao(categorias: readonly OpcaoDeCategoria[], chave: string): string {
  return (categorias.find((c) => c.chave === chave && c.ativa) ?? categorias.find((c) => c.chave === CHAVE_DO_SISTEMA))?.id ?? '';
}

/**
 * INS-SALVAR-CONFIRMACAO: o que estava no formulário enviado → valores para abrir o cadastro de novo, depois de recarregar.
 * Só texto e escolhas da própria lista voltam (o servidor confere tudo ao salvar). Os prazos de uso passam pelo mesmo leitor do
 * servidor: um prazo que ele recusaria não volta, e o campo fica para conferir.
 */
export function valoresDoFormulario(form: FormData): ValoresDoInsumo {
  const txt = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : '';
  };
  const tipo = txt('tipo');
  const unidade = txt('unidade');
  const conservacao = txt('conservacao');
  const prazos = lerValidades(entradaDoFormulario((k) => form.get(k) ?? undefined), 'insumo');
  return {
    nome: txt('nome').slice(0, 80),
    tipo: tipo === 'PRE_PREPARO' || (TIPOS_DO_FORM as readonly string[]).includes(tipo) ? (tipo as TipoInsumo) : INSUMO_NOVO.tipo,
    unidade: Object.hasOwn(UNIDADES, unidade) ? (unidade as Unidade) : '',
    categoriaId: txt('categoriaId'),
    conservacao: Object.hasOwn(CONSERVACOES, conservacao) ? (conservacao as Conservacao) : '',
    marcaReferencia: txt('marcaReferencia').slice(0, MARCA_MAXIMA),
    validades: prazos.ok ? prazos.validades : null,
    conteudo: txt('conteudo'),
    escala: txt('escala') === 'menor' ? 'menor' : 'base',
    preco: txt('preco'),
    semPreco: ['on', 'sim', 'true', '1'].includes(txt('semPreco')),
    frete: txt('frete'),
  };
}

type PropsDoFormInsumo = Omit<Parameters<typeof FormInsumoBase>[0], 'recuperado' | 'aoDescartarRecuperado' | 'chaveDoRascunho'>;

/**
 * O formulário do insumo. No cadastro novo, se o ERP foi atualizado com a tela aberta (o envio não foi processado), o que
 * estava digitado fica no rascunho da aba e volta aqui depois de recarregar, com o aviso e a opção de descartar. O rascunho só é
 * lido depois do primeiro desenho: quando chega (ou se descarta), o formulário nasce de novo com os valores certos.
 */
export function FormInsumo(props: PropsDoFormInsumo) {
  const r = useRascunhoDaTela<ValoresDoInsumo>();
  const [descartou, setDescartou] = useState(false);
  const novo = props.modo === 'criar';
  const recuperado = novo && !descartou && r.valores ? r.valores : null;
  return (
    <FormInsumoBase
      key={r.valores === undefined ? 'carregando' : descartou ? 'descartado' : 'pronto'}
      {...props}
      inicial={recuperado ?? props.inicial}
      recuperado={!!recuperado}
      chaveDoRascunho={novo ? r.chave : ''}
      aoDescartarRecuperado={() => {
        r.descartar();
        setDescartou(true);
      }}
    />
  );
}

function FormInsumoBase({
  acao,
  modo,
  base,
  aqui,
  cancelar,
  inicial: inicialDado,
  nomeSugerido,
  lembrado,
  versao,
  travaDaUnidade = null,
  bloqueio = null,
  categorias,
  envio,
  volta,
  aConfirmar = false,
  de = '',
  origemLista = false,
  recuperado = false,
  aoDescartarRecuperado,
  chaveDoRascunho = '',
}: {
  acao: AcaoDeCadastro;
  modo: 'criar' | 'editar';
  /** Lista de insumos de quem usa a tela (para o link do desativado). */
  base: string;
  /** Esta página (recarregar depois de um conflito). */
  aqui: string;
  cancelar: string;
  inicial?: ValoresDoInsumo;
  /** Novo vindo da importação de fichas ("Cadastrar “Picles”"): o nome já vem escrito. */
  nomeSugerido?: string;
  /** "Cadastrar outro insumo": tipo e unidade do último (da URL; só valores da lista valem). */
  lembrado?: { tipo?: string; unidade?: string };
  /** Editar: `atualizadoEm` lido (a gravação só passa se ainda for ele). */
  versao?: string;
  /** Editar: por que a unidade não pode mudar. */
  travaDaUnidade?: string | null;
  bloqueio?: string | null;
  /** I.1a: as categorias que a casa oferece (as ativas, mais a que o insumo já tem). */
  categorias: readonly OpcaoDeCategoria[];
  /** I.1a: a chave deste envio (um UUID por abertura do formulário): o servidor reconhece o reenvio e não cria outro. */
  envio?: string;
  /** I.1b: o caminho de volta JÁ VALIDADO (veio de "Insumo que falta: cadastrar" numa nota ou ficha): salvar leva de volta para lá. */
  volta?: string | null;
  /** I.1b: Seco antigo que ninguém confirmou, numa categoria que costuma ser fria: o campo pede para conferir. */
  aConfirmar?: boolean;
  /** L.1: a lista como estava (filtros, página e tamanho), já filtrada: vai e volta junto, para salvar não perder o lugar. */
  de?: string;
  /** L.1: veio da caneta da lista: salvar volta para a LISTA, não para o detalhe. */
  origemLista?: boolean;
  /** INS-SALVAR-CONFIRMACAO: os valores vieram do rascunho guardado antes de recarregar. */
  recuperado?: boolean;
  aoDescartarRecuperado?: () => void;
  /** Cadastro novo: onde guardar o que foi digitado se o ERP foi atualizado com a tela aberta ('' = não guarda). */
  chaveDoRascunho?: string;
}) {
  const inicial: ValoresDoInsumo = inicialDado ?? { ...INSUMO_NOVO, ...valoresLembrados(lembrado), nome: (nomeSugerido ?? '').slice(0, 80) };
  const aoVersaoNova = useCallback((form: FormData) => !!chaveDoRascunho && guardarRascunho(chaveDoRascunho, valoresDoFormulario(form)), [chaveDoRascunho]);
  const acaoSegura = useAcaoSegura(acao, { aoVersaoNova });
  const [estado, enviar] = useActionState<EstadoCadastro, FormData>(acaoSegura, null);
  const [nome, setNome] = useState(inicial.nome);
  const [unidade, setUnidade] = useState<Unidade | ''>(inicial.unidade);
  const [tipo, setTipo] = useState<TipoInsumo>(inicial.tipo);
  // A chave do envio nasce na montagem e não muda enquanto o formulário estiver aberto (nem se a página for reenviada pelo servidor).
  const [chaveDeEnvio] = useState(envio ?? '');
  const saida = useAvisoDeSaida(estado);
  const erros = estado?.erros ?? {};
  const idBase = 'insumo';
  // Prioridade nº 1 (23/10): a explicação vai para o botão de ajuda do campo; sem o ponto, o texto antigo fica.
  const temPonto = { tipo: useTemPonto('tipo'), marca: useTemPonto('marca'), unidade: useTemPonto('unidade') };
  const prePreparo = inicial.tipo === 'PRE_PREPARO';

  // I.1a: a categoria sai sugerida pelo nome (sem a pessoa redigitar nada) e continua corrigível. Depois que a pessoa escolhe,
  // a sugestão não troca mais a escolha dela; "Voltar à sugestão" devolve a decisão ao nome.
  const sugestao = useMemo(() => (nome.trim().length >= 2 ? sugerirCategoria(nome, tipo) : null), [nome, tipo]);
  const sugeridaId = sugestao ? idDaSugestao(categorias, sugestao.chave) : '';
  const [escolheu, setEscolheu] = useState(!!inicial.categoriaId);
  const [categoriaId, setCategoriaId] = useState(inicial.categoriaId || sugeridaId);
  useEffect(() => {
    if (!escolheu && categoriaId !== sugeridaId) setCategoriaId(sugeridaId);
  }, [escolheu, sugeridaId, categoriaId]);
  const doNome = sugestao && sugeridaId !== '' && categoriaId === sugeridaId;
  const nomeDaSugerida = categorias.find((c) => c.id === sugeridaId)?.nome;

  // Erro do servidor: o foco vai para o primeiro campo com problema (teclado e leitor de tela não ficam procurando).
  const vez = estado?.vez;
  // Na ordem em que os campos aparecem na tela (não na ordem em que o servidor os listou).
  const ORDEM_NA_TELA = ['nome', 'tipo', 'categoriaId', 'marcaReferencia', 'conservacao', 'validade-SECO', 'validade-PISTA_FRIA', 'validade-REFRIGERADO', 'validade-CONGELADO', 'unidade', 'conteudo', 'preco', 'frete'];
  const comErro = Object.keys(erros).filter((c) => c !== 'geral' && erros[c]);
  const primeiroErro = [...comErro].sort((x, y) => (ORDEM_NA_TELA.indexOf(x) + 1 || 99) - (ORDEM_NA_TELA.indexOf(y) + 1 || 99))[0];
  const campoDoErro = useRef(primeiroErro);
  campoDoErro.current = primeiroErro;
  useEffect(() => {
    if (!vez || !campoDoErro.current) return;
    const c = campoDoErro.current;
    // Unidade e tipo são grupos de rádio: o foco vai para a primeira opção (ou a marcada).
    const alvo =
      document.getElementById(`${idBase}-${c}`) ??
      document.querySelector<HTMLElement>(`input[name="${c}"]:checked`) ??
      document.querySelector<HTMLElement>(`input[name="${c}"]`) ??
      document.querySelector<HTMLElement>(`[aria-describedby~="${idBase}-${c}-erro"]`);
    alvo?.focus({ preventScroll: false });
  }, [vez]);

  const ajudaDaCategoria = (() => {
    if (!sugestao && !categoriaId) return 'Ao digitar o nome, a categoria é sugerida. É a natureza do insumo para o CMV, não onde ele fica guardado.';
    if (doNome && sugestao?.origem === 'termo') return `Sugerida pelo nome (“${sugestao.termos[0]}”). Confira e troque se precisar.`;
    if (doNome && sugestao?.origem === 'tipo') return 'Sugerida pelo tipo: embalagem. Confira e troque se precisar.';
    if (doNome && sugestao) return `${sugestao.motivo ?? 'Não deu para decidir pelo nome.'} Se ficar em Outros / a classificar, o insumo entra na fila de revisão.`;
    if (sugestao && nomeDaSugerida && categoriaId !== sugeridaId) return `Você escolheu outra categoria. O nome sugeria ${nomeDaSugerida}.`;
    return 'É a natureza do insumo para o CMV, não onde ele fica guardado: coxa de frango é Proteína, mesmo congelada.';
  })();

  return (
    <FormularioComAcao action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      {modo === 'criar' && chaveDeEnvio && <input type="hidden" name="envio" value={chaveDeEnvio} />}
      {modo === 'criar' && volta && <input type="hidden" name="volta" value={volta} />}
      {de && <input type="hidden" name="de" value={de} />}
      {origemLista && <input type="hidden" name="origem" value="lista" />}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={(c) => ROTULO_DO_CAMPO[c] ?? (c.startsWith('validade-') ? `Prazo de uso após abertura em ${CONSERVACOES[c.slice(9) as Conservacao]?.toLowerCase() ?? c}` : c)} />
      <ErroGeral estado={estado} recarregar={aqui} />
      {recuperado && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-linha-forte px-4 py-3 text-sm">
          <p className="text-texto">
            Recuperamos o que você tinha digitado antes de recarregar. Nada foi salvo ainda: confira e salve.
          </p>
          <button type="button" onClick={aoDescartarRecuperado} className="ff-transicao min-h-11 rounded-[7px] px-3 text-[13px] font-medium text-suave underline underline-offset-4 hover:text-texto sm:min-h-9 [@media(pointer:coarse)]:min-h-11">
            Descartar e começar de novo
          </button>
        </div>
      )}
      <SalvandoAnunciado />

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Painel titulo="O que é">
          {/* No computador, categoria e marca lado a lado (a ordem de leitura e de Tab é a mesma: nome, tipo, categoria, marca). */}
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
            <div className="lg:col-span-2">
              <label htmlFor={`${idBase}-nome`} className={ROTULO}>
                Nome do insumo{OBRIGATORIO}
              </label>
              <input
                id={`${idBase}-nome`}
                name="nome"
                required
                aria-required="true"
                maxLength={80}
                autoComplete="off"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Blend bovino 180 g"
                className={CAMPO}
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? `${idBase}-nome-erro` : undefined}
              />
              <Erro id={`${idBase}-nome-erro`} texto={erros.nome} />
              {estado?.desativadoId && (
                <Link href={`${base}/${estado.desativadoId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-block`}>
                  Abrir o insumo desativado para reativar
                </Link>
              )}
              {estado?.existenteId && (
                <Link href={`${base}/${estado.existenteId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-block`}>
                  Abrir o insumo que já existe
                </Link>
              )}
            </div>

            <div className="lg:col-span-2">
              {prePreparo ? (
                <div>
                  <span className={ROTULO}>Tipo de item</span>
                  <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-[42px]">{TIPOS.PRE_PREPARO}</p>
                  <p className={AJUDA}>Pré-preparo nasce da ficha técnica e continua pré-preparo.</p>
                  <input type="hidden" name="tipo" value="PRE_PREPARO" />
                </div>
              ) : (
                <div className="sm:max-w-xl">
                  <Segmentos
                    nome="tipo"
                    legenda="Tipo de item"
                    descritoPor={`${idBase}-tipo-ajuda`}
                    opcoes={TIPOS_DO_FORM.map((k) => [k, TIPOS[k]] as const)}
                    valor={tipo}
                    aoMudar={setTipo}
                  />
                  <div className="mt-1.5 flex items-center gap-1">
                    <p id={`${idBase}-tipo-ajuda`} aria-live="polite" className={AJUDA.replace('mt-1.5', '')}>
                      {AJUDA_DO_TIPO[tipo as keyof typeof AJUDA_DO_TIPO] ?? ''}
                      {!temPonto.tipo && ' O tipo é o papel do item; a categoria é a natureza dele para o CMV; a conservação é onde fica guardado.'}
                    </p>
                    <PontoDeAjuda ponto="tipo" className="-my-3 sm:-my-1.5" />
                  </div>
                  {tipo === 'MATERIAL' && (
                    <p className="mt-1.5 text-[13px] text-atencao">
                      Não entra em ficha técnica. As compras dele ainda contam no CMV por enquanto.
                    </p>
                  )}
                  <Erro id={`${idBase}-tipo-erro`} texto={erros.tipo} />
                </div>
              )}
            </div>

            <div className="sm:max-w-md lg:max-w-none">
              <label htmlFor={`${idBase}-categoriaId`} className={ROTULO}>
                Categoria{OBRIGATORIO}
              </label>
              <select
                id={`${idBase}-categoriaId`}
                name="categoriaId"
                required
                aria-required="true"
                value={categoriaId}
                onChange={(e) => {
                  setCategoriaId(e.target.value);
                  setEscolheu(true);
                }}
                className={`${CAMPO} pr-8`}
                aria-invalid={!!erros.categoriaId}
                aria-describedby={[`${idBase}-categoriaId-ajuda`, erros.categoriaId ? `${idBase}-categoriaId-erro` : ''].filter(Boolean).join(' ')}
              >
                <option value="" disabled>
                  Selecione a categoria
                </option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.ativa ? '' : ' (desativada)'}
                  </option>
                ))}
              </select>
              <p id={`${idBase}-categoriaId-ajuda`} aria-live="polite" className={AJUDA}>
                {ajudaDaCategoria}
              </p>
              <Erro id={`${idBase}-categoriaId-erro`} texto={erros.categoriaId && nomeDaSugerida && categoriaId !== sugeridaId ? `${erros.categoriaId} A sugestão era ${nomeDaSugerida}.` : erros.categoriaId} />
              {(escolheu || !!erros.categoriaId) && sugestao && sugeridaId !== '' && categoriaId !== sugeridaId && (
                <button
                  type="button"
                  onClick={() => {
                    setEscolheu(false);
                    setCategoriaId(sugeridaId);
                  }}
                  className={`${LINK_DE_TEXTO} mt-1 inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`}
                >
                  Voltar à sugestão ({nomeDaSugerida})
                </button>
              )}
              {categorias.length === 0 && (
                <p className="mt-1.5 text-[13px] text-atencao">A casa ainda não tem categorias. Abra Categorias, no menu, para criar as dez padrão.</p>
              )}
            </div>

            <div className="sm:max-w-md lg:max-w-none">
              <div className="mb-1.5 flex items-center gap-1">
                <label htmlFor={`${idBase}-marcaReferencia`} className={ROTULO.replace('mb-1.5 ', '')}>
                  Marca de referência <span className="font-normal text-suave">(opcional)</span>
                </label>
                <PontoDeAjuda ponto="marca" className="-my-3 sm:-my-1.5" />
              </div>
              <input
                id={`${idBase}-marcaReferencia`}
                name="marcaReferencia"
                maxLength={MARCA_MAXIMA}
                autoComplete="off"
                defaultValue={inicial.marcaReferencia}
                placeholder="Ex.: Camil"
                className={CAMPO}
                aria-invalid={!!erros.marcaReferencia}
                aria-describedby={[temPonto.marca ? '' : `${idBase}-marcaReferencia-ajuda`, erros.marcaReferencia ? `${idBase}-marcaReferencia-erro` : ''].filter(Boolean).join(' ') || undefined}
              />
              {!temPonto.marca && (
                <p id={`${idBase}-marcaReferencia-ajuda`} className={AJUDA}>
                  A marca comercial que você costuma comprar. É só uma informação: não trava compra nem cotação e não é o fornecedor (a mesma marca pode vir de vários).
                </p>
              )}
              <Erro id={`${idBase}-marcaReferencia-erro`} texto={erros.marcaReferencia} />
            </div>
          </div>
        </Painel>

        <Painel titulo="Conservação e prazo de uso após abertura">
          <CamposDeConservacao
            principalInicial={inicial.conservacao}
            validadesIniciais={inicial.validades}
            erros={erros}
            idBase={idBase}
            aoMudar={saida.aoMudar}
            aConfirmar={aConfirmar}
          />
        </Painel>

        <Painel
          titulo="Unidade, embalagem de compra e custo"
          subtitulo={temPonto.unidade ? undefined : 'Três coisas diferentes: a unidade em que você controla, quanto vem em cada embalagem que compra e quanto paga por ela.'}
          acessorio={<PontoDeAjuda ponto="unidade" alvo={`${idBase}-regiao-unidade`} />}
        >
          <div className="space-y-4">
            <div id={`${idBase}-regiao-unidade`}>
              {travaDaUnidade && unidade ? (
                <div>
                  <span className={ROTULO}>Unidade base</span>
                  <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-[42px]">{UNIDADES[unidade].nome}</p>
                  <p className={AJUDA}>{travaDaUnidade}</p>
                  <input type="hidden" name="unidade" value={unidade} />
                </div>
              ) : (
                <Segmentos
                  nome="unidade"
                  legenda="Unidade base"
                  obrigatorio
                  invalido={!!erros.unidade}
                  descritoPor={[temPonto.unidade ? '' : `${idBase}-unidade-ajuda`, erros.unidade ? `${idBase}-unidade-erro` : ''].filter(Boolean).join(' ')}
                  opcoes={(Object.keys(UNIDADES) as Unidade[]).map((k) => [k, UNIDADES[k].nome] as const)}
                  valor={unidade}
                  aoMudar={setUnidade}
                />
              )}
              {!temPonto.unidade && (
                <p id={`${idBase}-unidade-ajuda`} className={AJUDA}>
                  A medida em que você controla o estoque e que a ficha usa (kg, L ou un). Não é a embalagem: a caixa de 5 kg é medida em kg.
                </p>
              )}
              <Erro id={`${idBase}-unidade-erro`} texto={erros.unidade} />
            </div>
            {unidade ? (
              <CamposDaEmbalagem unidade={unidade} inicial={inicial} erros={erros} idBase={idBase} modo="insumo" />
            ) : (
              <p className="rounded-[10px] border border-dashed border-linha-forte px-4 py-3 text-[13px] text-suave">
                Escolha a unidade base para informar quanto vem na embalagem de compra e o custo inicial de referência.
              </p>
            )}
          </div>
        </Painel>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {modo === 'criar' && volta ? (
          // Volta lendo a página de novo: o roteador guarda a anterior por uns segundos, e a versão da ficha ou da nota pode ter mudado.
          <a href={volta} className={classeDeBotao('fantasma')}>
            Cancelar
          </a>
        ) : (
          <Link href={cancelar} className={classeDeBotao('fantasma')}>
            Cancelar
          </Link>
        )}
        <BotaoEnviar disabled={!!bloqueio} className="sm:min-w-44">
          {modo === 'criar' ? (volta ? `Cadastrar e voltar para ${rotuloDaVolta(volta)}` : 'Cadastrar insumo') : 'Salvar alterações'}
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </FormularioComAcao>
  );
}
