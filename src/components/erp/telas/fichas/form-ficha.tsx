// Scanner avoid-ai-design, SD4d (P2) aceito: "Prato · rende 1 porção" e "R$ 3,20 · R$ 1,60 por porção" seguem o subtítulo do contrato ("Rede Completa · N fichas") como linha de apoio, igual aos insumos da 1.1. (O ignore do scanner não aceita id com minúscula.)
'use client';

/**
 * Formulário da ficha técnica (nova e editar), a MESMA peça para o nível 1 e
 * para a pessoa do parceiro: a action vem de quem usa a tela. Cada linha é um
 * insumo OU um pré-preparo (1.3: outra ficha, com o custo dela em cascata), com
 * a quantidade LIMPA e o fator de correção (o peso bruto aparece embaixo). Tudo vai como
 * texto (a foto já foi enviada pela rota própria: vai só o nome); o servidor converte g/kg/ml/L/un, calcula o
 * custo e confere permissão, versão lida e insumos do parceiro. A conta que
 * aparece aqui embaixo é PRÉVIA, feita com a mesma regra.
 */

import Link from 'next/link';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormState } from 'react-dom';
import { Trash2 } from 'lucide-react';
import {
  formatarFator,
  lerFator,
  LIMITES_DA_FICHA,
  colocarInsumoCriado,
  quantidadeBruta,
  RENDE_DO_PREPARO,
  RENDE_EM,
  TIPOS_DE_FICHA,
  type RendeEm,
  type TipoFicha,
} from '@/lib/erp/ficha-campos';
import type { InsumoDoFormulario, PreparoDoFormularioNaTela } from '@/lib/erp/fichas';
import {
  custoDoUso,
  custoPorUnidade,
  escalaDaSigla,
  formatarFracao,
  formatarQuantidade,
  lerInteiro,
  lerQuantidadeNa,
  porRendimento,
  SIGLAS_DIGITAVEIS,
  somar,
  UNIDADES,
  ZERO,
  type Fracao,
  type Unidade,
} from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { PontoDeAjuda, useTemPonto } from '../../ui/ponto-de-ajuda';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Segmentos } from '../../ui/segmentos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import { AvisoDeRascunho, AvisoDeRascunhoVelho, guardarRascunho, useRascunhoDaTela } from '../cadastro/rascunho';
import { AtalhoNovoInsumo, AvisoInsumoCriado } from '../insumos/atalho-novo-insumo';
import { SeletorDeItem } from './seletor-de-item';
import type { OpcaoDoSeletor } from '@/lib/erp/seletor-campos';
import { CampoFoto } from './campo-foto';
import { CamposDeValidade } from '../cadastro/campos-validade';
import { CONSERVACOES, entradaDoFormulario, lerValidades, type Conservacao, type Validades } from '@/lib/erp/validade';
import { PREFIXO_DO_PREPARO } from './prefixo';
import { EditorDePassos } from './editor-passos';

export interface LinhaDoItem {
  /** Id do insumo, ou "ficha:<id>" do pré-preparo (o valor do seletor). */
  escolha: string;
  quantidade: string;
  unidade: string;
  fator: string;
}

export interface ValoresDaFicha {
  nome: string;
  tipo: TipoFicha;
  descricao: string;
  modoPreparo: string;
  /** N.4: as etapas do preparo, na ordem (rascunho antigo, sem o campo: nenhuma). */
  passos?: string[];
  rendimento: string;
  rendimentoUnidade: RendeEm;
  itens: LinhaDoItem[];
  /** 1.4: onde fica e quanto dura (null = não informada). */
  validades: Validades | null;
  /** F4: sai da cozinha para o cliente sem guardar (rascunho antigo, sem o campo: não). */
  consumoImediato?: boolean;
}

const VAZIA: LinhaDoItem = { escolha: '', quantidade: '', unidade: '', fator: '' };
const NOVA: ValoresDaFicha = {
  nome: '',
  tipo: 'PRATO',
  descricao: '',
  modoPreparo: '',
  passos: [],
  rendimento: '1',
  rendimentoUnidade: 'porcao',
  itens: [VAZIA],
  validades: null,
};

const ROTULOS: Record<string, string> = {
  nome: 'Nome',
  tipo: 'Tipo',
  descricao: 'Descrição comercial',
  passos: 'Modo de preparo',
  foto: 'Foto',
  rendimento: 'Rendimento',
  itens: 'Insumos e pré-preparos',
  modoPreparo: 'Modo de preparo',
  conservacao: 'Conservação principal',
  consumoImediato: 'Consumo imediato',
};
const rotuloDoCampo = (c: string) =>
  ROTULOS[c] ??
  (c.startsWith('item-')
    ? `Item ${Number(c.slice(5)) + 1}`
    : c.startsWith('passo-')
      ? `Etapa ${Number(c.slice(6)) + 1} do preparo`
      : c.startsWith('validade-')
      ? `Validade em ${CONSERVACOES[c.slice(9) as Conservacao]?.toLowerCase() ?? c}`
      : c);

/** O que a linha escolheu: um insumo ou um pré-preparo, com o custo por unidade (null = sem preço). */
interface Escolhido {
  nome: string;
  unidade: Unidade;
  porUnidade: Fracao | null;
  preparo: boolean;
  incompleto: boolean;
}

/** Linha na prévia: quantidade limpa e bruta, custo (null = sem preço) — ou nada, se ainda incompleta. */
function contaDaLinha(l: LinhaDoItem, e: Escolhido | undefined) {
  if (!e) return null;
  const escala = escalaDaSigla(l.unidade, e.unidade);
  const q = escala ? lerQuantidadeNa(l.quantidade.trim(), e.unidade, escala) : null;
  const f = lerFator(l.fator);
  if (!q || !f.ok) return null;
  return { q, fator: f.milesimos, bruta: quantidadeBruta(q, f.milesimos), custo: e.porUnidade ? custoDoUso(e.porUnidade, q, f.milesimos) : null };
}

export function FormFicha(props: PropsDoFormFicha) {
  // I.1b: voltou de "Insumo que falta: cadastrar"? O que estava preenchido volta junto, e o insumo novo já está na lista.
  const r = useRascunhoDaTela<ValoresDaFicha>(props.modo === 'editar' ? props.versao : undefined);
  const [descartou, setDescartou] = useState(false);
  const recuperado = !descartou && r.valores ? r.valores : null;
  const criado = !descartou && r.insumoCriado ? props.opcoes.find((i) => i.id === r.insumoCriado) : undefined;
  let valores = recuperado ?? props.inicial ?? NOVA;
  let escolhido = false;
  if (criado) {
    const colocado = colocarInsumoCriado(valores.itens, 'escolha', criado.id, { unidade: SIGLAS_DIGITAVEIS[criado.unidade][0] }, VAZIA, LIMITES_DA_FICHA.itens);
    valores = { ...valores, itens: colocado.itens };
    escolhido = colocado.escolhido;
  }
  return (
    <FormFichaBase
      // O rascunho só é lido depois do primeiro desenho: quando chega (ou se descarta), o formulário nasce de novo com os valores certos.
        key={r.valores === undefined ? 'carregando' : descartou ? 'descartado' : 'pronto'}
      {...props}
      inicial={valores}
      chaveDoRascunho={r.chave}
      avisos={
        <>
          {criado && <AvisoInsumoCriado nome={criado.nome} escolhido={escolhido} />}
          <AvisoDeRascunhoVelho quando={r.versaoMudou} oQue="A ficha" />
          <AvisoDeRascunho
            quando={!!recuperado}
            observacao="A foto que você tinha escolhido não é guardada: se for trocar a foto, escolha de novo."
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

type PropsDoFormFicha = {
  acao: AcaoDeCadastro;
  modo: 'criar' | 'editar';
  /** Lista de fichas de quem usa a tela (link da desativada). */
  base: string;
  aqui: string;
  cancelar: string;
  opcoes: InsumoDoFormulario[];
  /** Pré-preparos que podem entrar (sem a própria ficha), com o custo por unidade. */
  preparos?: PreparoDoFormularioNaTela[];
  /** Permissão efetiva; as opções já chegam do servidor sem valores quando falsa. */
  verCustos: boolean;
  inicial?: ValoresDaFicha;
  fotoAtual?: string | null;
  versao?: string;
  bloqueio?: string | null;
  /** Link para cadastrar insumo (só para quem pode). */
  novoInsumo?: string;
};

function FormFichaBase({
  acao,
  modo,
  base,
  aqui,
  cancelar,
  opcoes,
  preparos = [],
  verCustos,
  inicial = NOVA,
  fotoAtual = null,
  versao,
  bloqueio = null,
  novoInsumo,
  chaveDoRascunho,
  avisos,
}: PropsDoFormFicha & { chaveDoRascunho: string; avisos: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const saida = useAvisoDeSaida(estado);
  const [tipo, setTipo] = useState<TipoFicha>(inicial.tipo);
  const [consumo, setConsumo] = useState(inicial.consumoImediato === true);
  const [nome, setNome] = useState(inicial.nome);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [rendimento, setRendimento] = useState(inicial.rendimento);
  const [rendeEm, setRendeEm] = useState<RendeEm>(inicial.tipo === 'PRATO' ? 'kg' : inicial.rendimentoUnidade);
  const proximaChave = useRef(inicial.itens.length);
  const [linhas, setLinhas] = useState(() => inicial.itens.map((l, i) => ({ ...l, chave: i })));
  const erros = estado?.erros ?? {};
  const idBase = 'ficha';
  // Prioridade nº 1 (23/10): a explicação vai para o botão de ajuda do campo; sem o ponto, o texto antigo fica.
  const temPonto = { tipo: useTemPonto('tipo'), descricao: useTemPonto('descricao'), rendimento: useTemPonto('rendimento') };
  // F4: a busca do item acha pelo nome ou pela categoria; pré-preparos primeiro, depois as categorias na ordem da casa.
  const opcoesDoSeletor = useMemo<OpcaoDoSeletor[]>(
    () => [
      ...preparos.map((p) => ({
        valor: `${PREFIXO_DO_PREPARO}${p.id}`,
        nome: p.nome,
        grupo: 'Pré-preparos da casa',
        ordemDoGrupo: -1,
        detalhe: [p.ativo ? null : 'desativado', verCustos && p.incompleto ? 'custo incompleto' : null].filter(Boolean).join(' · ') || null,
      })),
      ...opcoes.map((i) => ({
        valor: i.id,
        nome: i.nome,
        grupo: i.categoria?.nome ?? 'Sem categoria',
        ordemDoGrupo: i.categoria?.ordem ?? Number.MAX_SAFE_INTEGER,
        detalhe: [i.ativo ? null : 'desativado', verCustos && !i.custo ? 'custo não informado' : null].filter(Boolean).join(' · ') || null,
      })),
    ],
    [opcoes, preparos, verCustos],
  );
  const porEscolha = useMemo(() => {
    const m = new Map<string, Escolhido>();
    for (const i of opcoes) m.set(i.id, { nome: i.nome, unidade: i.unidade, porUnidade: verCustos && i.custo ? custoPorUnidade(i.custo) : null, preparo: false, incompleto: false });
    for (const p of preparos) {
      m.set(`${PREFIXO_DO_PREPARO}${p.id}`, {
        nome: p.nome,
        unidade: p.unidade,
        porUnidade: verCustos && p.custo ? { num: BigInt(p.custo.num), den: BigInt(p.custo.den) } : null,
        preparo: true,
        incompleto: verCustos && p.incompleto === true,
      });
    }
    return m;
  }, [opcoes, preparos, verCustos]);

  function mudarLinha(chave: number, mudanca: Partial<LinhaDoItem>) {
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.chave !== chave) return l;
        const nova = { ...l, ...mudanca };
        // Trocou o item: a unidade passa a ser a dele (g para kg, ml para L, un).
        if (mudanca.escolha !== undefined) {
          const e = porEscolha.get(mudanca.escolha);
          if (e && !SIGLAS_DIGITAVEIS[e.unidade].includes(nova.unidade)) nova.unidade = SIGLAS_DIGITAVEIS[e.unidade][0];
        }
        return nova;
      }),
    );
    saida.aoMudar();
  }

  // Prévia da conta, com a mesma regra do servidor.
  const previa = useMemo(() => {
    let total: Fracao = ZERO;
    const semPreco: string[] = [];
    const incompletos: string[] = [];
    const porLinha = new Map<number, ReturnType<typeof contaDaLinha>>();
    for (const l of linhas) {
      const e = porEscolha.get(l.escolha);
      const c = contaDaLinha(l, e);
      porLinha.set(l.chave, c);
      if (!c || !e) continue;
      if (!c.custo) semPreco.push(e.nome);
      else total = somar(total, c.custo);
      if (e.incompleto) incompletos.push(e.nome);
    }
    let rende: number | null = null;
    if (tipo === 'PRATO') {
      const n = lerInteiro(rendimento.trim() || '1');
      rende = n ? n * 1000 : null;
    } else {
      const { unidade, escala } = RENDE_EM[rendeEm];
      rende = lerQuantidadeNa(rendimento.trim(), unidade, escala) || null;
    }
    return { total, semPreco, incompletos, porLinha, porRende: rende ? porRendimento(total, rende) : null };
  }, [linhas, porEscolha, tipo, rendimento, rendeEm]);

  /** I.1b: antes de ir cadastrar o insumo que falta, guarda o que está na tela (a ficha inteira, menos a foto) para recuperar na volta. */
  function guardarOQueFoiPreenchido() {
    if (!formRef.current) return;
    const f = new FormData(formRef.current);
    const t = (k: string) => (typeof f.get(k) === 'string' ? (f.get(k) as string) : '');
    const v = lerValidades(entradaDoFormulario((k) => f.get(k)), 'ficha');
    const valores: ValoresDaFicha = {
      nome: t('nome'),
      tipo,
      descricao: t('descricao'),
      modoPreparo: t('modoPreparo'),
      passos: f.getAll('passo').map((x) => (typeof x === 'string' ? x : '')),
      rendimento,
      rendimentoUnidade: rendeEm,
      itens: linhas.map(({ chave: _c, ...l }) => l),
      validades: v.ok ? v.validades : null,
      consumoImediato: consumo,
    };
    guardarRascunho(chaveDoRascunho, valores, modo === 'editar' ? versao : undefined);
  }

  // O custo da prévia é por unidade BASE (kg, L, un), mesmo com o rendimento digitado em g ou ml (como no servidor).
  const unidadeDoRende = tipo === 'PRATO' ? 'porção' : UNIDADES[RENDE_EM[rendeEm].unidade].sigla;

  return (
    <form ref={formRef} action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      {avisos}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={rotuloDoCampo} />
      <ErroGeral estado={estado} recarregar={aqui} />

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Painel titulo="O que é">
          {/* No computador, a descrição comercial e a foto lado a lado (a ordem de leitura e de Tab não muda). */}
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
            <div className="lg:col-span-2">
              <label htmlFor={`${idBase}-nome`} className={ROTULO}>
                Nome da ficha
              </label>
              <input
                id={`${idBase}-nome`}
                name="nome"
                required
                maxLength={LIMITES_DA_FICHA.nome}
                autoComplete="off"
                defaultValue={inicial.nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: X-Burger da casa"
                className={CAMPO}
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? `${idBase}-nome-erro` : undefined}
              />
              <Erro id={`${idBase}-nome-erro`} texto={erros.nome} />
              {estado?.desativadoId && (
                <Link href={`${base}/${estado.desativadoId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-block`}>
                  Abrir a ficha desativada para reativar
                </Link>
              )}
            </div>
            <div className="sm:max-w-xl lg:col-span-2">
              <Segmentos
                nome="tipo"
                legenda="É um prato ou um pré-preparo?"
                opcoes={[
                  ['PRATO', TIPOS_DE_FICHA.PRATO],
                  ['PRE_PREPARO', TIPOS_DE_FICHA.PRE_PREPARO],
                ]}
                valor={tipo}
                aoMudar={setTipo}
              />
              <div className="mt-1.5 flex items-center gap-1">
                <p className={AJUDA.replace('mt-1.5', '')}>
                  {tipo === 'PRATO'
                    ? (verCustos ? 'Prato rende porções: o custo sai por porção.' : 'Prato rende porções.')
                    : temPonto.tipo
                      ? 'Pré-preparo rende em kg, L ou un e entra em outras fichas.'
                      : verCustos
                        ? 'Pré-preparo (molho, massa, recheio) rende em kg, L ou un, entra em outras fichas e aparece em Insumos com o custo desta receita.'
                        : 'Pré-preparo (molho, massa, recheio) rende em kg, L ou un, entra em outras fichas e aparece em Insumos.'}
                </p>
                <PontoDeAjuda ponto="tipo" className="-my-3 sm:-my-1.5" />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-1">
                <label htmlFor={`${idBase}-descricao`} className={ROTULO.replace('mb-1.5 ', '')}>
                  Descrição comercial <span className="font-normal text-suave">(uma ou duas linhas)</span>
                </label>
                <PontoDeAjuda ponto="descricao" className="-my-3 sm:-my-1.5" />
              </div>
              <textarea
                id={`${idBase}-descricao`}
                name="descricao"
                rows={2}
                maxLength={LIMITES_DA_FICHA.descricao}
                defaultValue={inicial.descricao}
                placeholder="Ex.: Pão brioche, blend 180 g, cheddar e molho da casa"
                className={`${CAMPO} resize-y`}
                aria-invalid={!!erros.descricao}
                aria-describedby={[temPonto.descricao ? '' : `${idBase}-descricao-ajuda`, erros.descricao ? `${idBase}-descricao-erro` : ''].filter(Boolean).join(' ') || undefined}
              />
              {!temPonto.descricao && (
                <p id={`${idBase}-descricao-ajuda`} className={AJUDA}>
                  Texto de apresentação para cardápios e marketplaces. Não vai para lugar nenhum sozinho. O passo a passo da cozinha fica no modo de preparo.
                </p>
              )}
              <Erro id={`${idBase}-descricao-erro`} texto={erros.descricao} />
            </div>
            <CampoFoto atual={fotoAtual} nome={nome} erro={erros.foto} idBase={idBase} envio={`${base}/fotos`} aoMudar={saida.aoMudar} aoOcupar={setEnviandoFoto} />
          </div>
        </Painel>

        <Painel titulo="Rendimento" acessorio={<PontoDeAjuda ponto="rendimento" />}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <label htmlFor={`${idBase}-rendimento`} className={ROTULO}>
                Rende
              </label>
              <input
                id={`${idBase}-rendimento`}
                name="rendimento"
                inputMode="decimal"
                autoComplete="off"
                value={rendimento}
                onChange={(e) => setRendimento(e.target.value)}
                className={`${CAMPO} text-right tabular-nums`}
                aria-invalid={!!erros.rendimento}
                aria-describedby={erros.rendimento ? `${idBase}-rendimento-erro` : undefined}
              />
            </div>
            {tipo === 'PRATO' ? (
              <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-[42px]">porções</p>
            ) : (
              <div className="w-28">
                <label htmlFor={`${idBase}-rende-em`} className="sr-only">
                  Unidade do rendimento
                </label>
                <select
                  id={`${idBase}-rende-em`}
                  name="rendimentoUnidade"
                  value={rendeEm}
                  onChange={(e) => setRendeEm(e.target.value as RendeEm)}
                  className={CAMPO}
                >
                  {RENDE_DO_PREPARO.map((r) => (
                    <option key={r} value={r}>
                      {RENDE_EM[r].rotulo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <Erro id={`${idBase}-rendimento-erro`} texto={erros.rendimento} />
          {tipo === 'PRE_PREPARO' && !temPonto.rendimento && (
            <p className={AJUDA}>Quanto sai pronto, já pesado depois do preparo: o que o cozimento tira ou acrescenta já está aqui.</p>
          )}
        </Painel>

        <Painel titulo="Onde fica e quanto dura">
          {/* F4: consumo imediato não é um lugar a mais nem um prazo: marcado, os lugares de guarda saem da tela. */}
          <label className="mb-3 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-texto">
            <input
              type="checkbox"
              name="consumoImediato"
              value="sim"
              checked={consumo}
              onChange={(e) => {
                setConsumo(e.target.checked);
                saida.aoMudar();
              }}
              className={`${MARCAR} mt-0.5`}
              aria-describedby={erros.consumoImediato ? `${idBase}-consumo-erro` : `${idBase}-consumo-ajuda`}
            />
            <span>
              <span className="font-medium">Consumo imediato</span>
              <span id={`${idBase}-consumo-ajuda`} className="block text-[12px] text-suave">
                Sai da cozinha para o cliente, sem ser guardado. Não tem lugar de guarda nem prazo.
              </span>
            </span>
          </label>
          <Erro id={`${idBase}-consumo-erro`} texto={erros.consumoImediato} />
          {consumo ? <input type="hidden" name="validadeNoFormulario" value="sim" /> : <CamposDeValidade para="ficha" inicial={inicial.validades} erros={erros} idBase={idBase} aoMudar={saida.aoMudar} />}
        </Painel>

        <Painel titulo="Insumos e pré-preparos" semRespiro>
          <p className="border-b border-linha px-4 py-3 text-[12px] leading-relaxed text-suave sm:px-5">
            Quantidade <strong className="font-semibold text-texto">limpa</strong>. Fator = bruto ÷ limpo (cebola: 1,18). Vazio = sem perda.
          </p>
          {erros.itens && (
            <p id={`${idBase}-itens`} className="border-b border-linha px-4 py-3 text-[13px] text-erro sm:px-5">
              {erros.itens}
            </p>
          )}
          <div
            aria-hidden
            className={`hidden ${verCustos ? 'grid-cols-[minmax(0,1fr)_6.5rem_5rem_5.5rem_7rem_auto]' : 'grid-cols-[minmax(0,1fr)_6.5rem_5rem_5.5rem_auto]'} gap-2 border-b border-linha bg-forte px-5 py-2 text-[12px] font-semibold text-suave sm:grid`}
          >
            <span>Insumo ou pré-preparo</span>
            <span className="text-right">Quantidade</span>
            <span>Medida</span>
            <span className="text-right">Fator</span>
            {verCustos && <span className="text-right">Custo</span>}
            <span className="w-11" />
          </div>
          <ul className="divide-y divide-linha">
            {linhas.map((l, n) => {
              const e = porEscolha.get(l.escolha);
              const siglas = e ? SIGLAS_DIGITAVEIS[e.unidade] : ['g', 'kg', 'ml', 'L', 'un'];
              const c = previa.porLinha.get(l.chave);
              const erro = erros[`item-${n}`];
              return (
                <li key={l.chave} className="px-4 py-3 sm:px-5">
                  <div className={`grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_auto] gap-2 ${verCustos ? 'sm:grid-cols-[minmax(0,1fr)_6.5rem_5rem_5.5rem_7rem_auto]' : 'sm:grid-cols-[minmax(0,1fr)_6.5rem_5rem_5.5rem_auto]'} sm:items-center`}>
                    <div className="col-span-4 sm:col-span-1">
                      <label htmlFor={`${idBase}-item-${n}`} className="sr-only">
                        Insumo ou pré-preparo {n + 1}
                      </label>
                      <SeletorDeItem
                        id={`${idBase}-item-${n}`}
                        name="item_insumo"
                        valor={l.escolha}
                        opcoes={opcoesDoSeletor}
                        aoEscolher={(v) => mudarLinha(l.chave, { escolha: v })}
                        rotulo={`Insumo ou pré-preparo ${n + 1}`}
                        invalido={!!erro}
                        descritoPor={erro ? `${idBase}-item-${n}-erro` : undefined}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${idBase}-item-${n}-qtd`} className="sr-only">
                        Quantidade limpa do item {n + 1}
                      </label>
                      <input
                        id={`${idBase}-item-${n}-qtd`}
                        name="item_quantidade"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Qtd."
                        value={l.quantidade}
                        onChange={(ev) => mudarLinha(l.chave, { quantidade: ev.target.value })}
                        className={`${CAMPO} text-right tabular-nums`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${idBase}-item-${n}-un`} className="sr-only">
                        Medida do item {n + 1}
                      </label>
                      <select
                        id={`${idBase}-item-${n}-un`}
                        name="item_unidade"
                        value={l.unidade || siglas[0]}
                        onChange={(ev) => mudarLinha(l.chave, { unidade: ev.target.value })}
                        className={CAMPO}
                      >
                        {siglas.map((sg) => (
                          <option key={sg} value={sg}>
                            {sg}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${idBase}-item-${n}-fator`} className="sr-only">
                        Fator de correção do item {n + 1} (vazio = 1)
                      </label>
                      <input
                        id={`${idBase}-item-${n}-fator`}
                        name="item_fator"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Fator 1"
                        value={l.fator}
                        onChange={(ev) => mudarLinha(l.chave, { fator: ev.target.value })}
                        className={`${CAMPO} text-right tabular-nums placeholder:text-[13px]`}
                      />
                    </div>
                    {verCustos && (
                      <p
                        className="col-span-4 row-start-3 flex items-center justify-end text-right text-[13px] tabular-nums text-suave sm:col-span-1 sm:row-start-auto sm:min-h-[42px]"
                        aria-live="polite"
                      >
                        <span className="mr-1 sm:hidden">Custo</span>
                        {!c ? '—' : c.custo ? formatarFracao(c.custo) : <span className="text-atencao">não informado</span>}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setLinhas((ls) => (ls.length === 1 ? [{ ...VAZIA, chave: proximaChave.current++ }] : ls.filter((x) => x.chave !== l.chave)));
                        saida.aoMudar();
                      }}
                      aria-label={`Tirar ${e?.nome ?? `o item ${n + 1}`} da ficha`}
                      className={classeDeBotao('fantasma', 'px-3')}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                  {e && c && (c.fator !== 1000 || (e.preparo && verCustos)) && (
                    <p className="mt-1.5 text-[12px] tabular-nums text-suave">
                      {c.fator !== 1000 && (
                        <>
                          Bruto {formatarQuantidade(c.bruta, e.unidade)} (fator {formatarFator(c.fator)})
                        </>
                      )}
                      {c.fator !== 1000 && e.preparo && verCustos && ' · '}
                      {e.preparo && verCustos && (
                        <>
                          Pré-preparo a {e.porUnidade ? formatarFracao(e.porUnidade) : '—'} por {UNIDADES[e.unidade].sigla}
                          {e.incompleto && <span className="text-atencao"> (custo incompleto)</span>}
                        </>
                      )}
                    </p>
                  )}
                  <Erro id={`${idBase}-item-${n}-erro`} texto={erro} />
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setLinhas((ls) => [...ls, { ...VAZIA, chave: proximaChave.current++ }]);
                  saida.aoMudar();
                }}
                disabled={linhas.length >= LIMITES_DA_FICHA.itens}
                className={classeDeBotao('secundario')}
              >
                Adicionar item
              </button>
              {novoInsumo && <AtalhoNovoInsumo href={novoInsumo} aoSair={guardarOQueFoiPreenchido} />}
            </div>
            {verCustos && <p className="text-right text-sm tabular-nums" aria-live="polite">
              <span className="text-suave">Prévia: </span>
              {/* Nenhum item com custo: R$ 0,00 seria um custo que ninguém informou. */}
              <span className="font-semibold">{previa.total.num === 0n && (previa.semPreco.length > 0 || previa.incompletos.length > 0) ? '—' : formatarFracao(previa.total)}</span>
              {previa.porRende && !(previa.total.num === 0n && (previa.semPreco.length > 0 || previa.incompletos.length > 0)) && (
                <span className="text-suave">
                  {' · '}
                  {formatarFracao(previa.porRende)} por {unidadeDoRende}
                </span>
              )}
              {previa.semPreco.length > 0 && <span className="block text-[12px] text-atencao">Custo incompleto: falta o custo de {previa.semPreco.join(', ')}.</span>}
              {previa.incompletos.length > 0 && (
                <span className="block text-[12px] text-atencao">Custo incompleto dentro de {previa.incompletos.join(', ')}.</span>
              )}
            </p>}
          </div>
        </Painel>

        <Painel titulo="Modo de preparo" subtitulo="Em etapas numeradas: uma ação por etapa">
          <EditorDePassos inicial={inicial.passos ?? []} textoAnterior={inicial.modoPreparo} erros={erros} idBase={idBase} aoMudar={saida.aoMudar} />
        </Painel>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio || enviandoFoto} className="sm:min-w-44">
          {modo === 'criar' ? 'Cadastrar ficha' : 'Salvar alterações'}
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
