'use client';

/**
 * Formulário do insumo (novo e editar), a MESMA peça para o nível 1 e para a
 * pessoa do parceiro: a action vem de quem usa a tela. Tudo vai como texto; o
 * servidor converte, calcula e confere (permissão, versão lida, unidade
 * travada). Erro volta para o lado do campo, sem perder o que foi digitado;
 * com vários, um resumo no topo leva a cada um.
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { TIPOS, type TipoInsumo } from '@/lib/erp/insumo-campos';
import { CHAVE_DO_SISTEMA } from '@/lib/erp/categoria-campos';
import { nomeDaChave, sugerirCategoria } from '@/lib/erp/categoria-sugestao';
import type { OpcaoDeCategoria } from '@/lib/erp/categorias';
import { CONSERVACOES, type Conservacao, type Validades } from '@/lib/erp/validade';
import { UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Segmentos } from '../../ui/segmentos';
import { Painel } from '../../ui/superficies';
import { CamposDeValidade } from '../cadastro/campos-validade';
import { CamposDaEmbalagem, EMBALAGEM_VAZIA, type ValoresDaEmbalagem } from './campos-embalagem';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import { SalvandoAnunciado, useAcaoSegura } from '../cadastro/anuncio';

export interface ValoresDoInsumo extends ValoresDaEmbalagem {
  nome: string;
  tipo: TipoInsumo;
  /** '' = ainda não escolheu (I.1a: a unidade base é obrigatória e não vem marcada). */
  unidade: Unidade | '';
  /** I.1a: a categoria escolhida ('' = nenhuma ainda). */
  categoriaId: string;
  conservacao: Conservacao;
  /** 1.4: principal + validade depois de aberto em cada conservação (opcional). */
  validades: Validades | null;
}

export const INSUMO_NOVO: ValoresDoInsumo = { nome: '', tipo: 'INGREDIENTE', unidade: '', categoriaId: '', conservacao: 'SECO', validades: null, ...EMBALAGEM_VAZIA };

const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: 'Nome',
  tipo: 'Tipo',
  categoriaId: 'Categoria',
  unidade: 'Unidade base',
  conservacao: 'Conservação principal',
  conteudo: 'Quanto vem na embalagem',
  preco: 'Preço',
  frete: 'Frete',
};

/** O texto de "obrigatório" que acompanha o rótulo: dito em palavras, não só por cor ou asterisco. */
const OBRIGATORIO = <span className="font-normal text-suave"> (obrigatório)</span>;

/** O id da categoria da casa que a sugestão aponta: a da chave, se está na lista; senão "Outros / a classificar". */
function idDaSugestao(categorias: readonly OpcaoDeCategoria[], chave: string): string {
  return (categorias.find((c) => c.chave === chave && c.ativa) ?? categorias.find((c) => c.chave === CHAVE_DO_SISTEMA))?.id ?? '';
}

export function FormInsumo({
  acao,
  modo,
  base,
  aqui,
  cancelar,
  inicial = INSUMO_NOVO,
  versao,
  travaDaUnidade = null,
  bloqueio = null,
  categorias,
  envio,
}: {
  acao: AcaoDeCadastro;
  modo: 'criar' | 'editar';
  /** Lista de insumos de quem usa a tela (para o link do desativado). */
  base: string;
  /** Esta página (recarregar depois de um conflito). */
  aqui: string;
  cancelar: string;
  inicial?: ValoresDoInsumo;
  /** Editar: `atualizadoEm` lido (a gravação só passa se ainda for ele). */
  versao?: string;
  /** Editar: por que a unidade não pode mudar. */
  travaDaUnidade?: string | null;
  bloqueio?: string | null;
  /** I.1a: as categorias que a casa oferece (as ativas, mais a que o insumo já tem). */
  categorias: readonly OpcaoDeCategoria[];
  /** I.1a: a chave deste envio (um UUID por abertura do formulário): o servidor reconhece o reenvio e não cria outro. */
  envio?: string;
}) {
  const acaoSegura = useAcaoSegura(acao);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acaoSegura, null);
  const [nome, setNome] = useState(inicial.nome);
  const [unidade, setUnidade] = useState<Unidade | ''>(inicial.unidade);
  const [tipo, setTipo] = useState<TipoInsumo>(inicial.tipo);
  // A chave do envio nasce na montagem e não muda enquanto o formulário estiver aberto (nem se a página for reenviada pelo servidor).
  const [chaveDeEnvio] = useState(envio ?? '');
  const saida = useAvisoDeSaida();
  const erros = estado?.erros ?? {};
  const idBase = 'insumo';
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
  const primeiroErro = Object.keys(erros).find((c) => c !== 'geral' && erros[c]);
  const campoDoErro = useRef(primeiroErro);
  campoDoErro.current = primeiroErro;
  useEffect(() => {
    if (!vez || !campoDoErro.current) return;
    const alvo = document.getElementById(`${idBase}-${campoDoErro.current}`) ?? document.querySelector<HTMLElement>(`[aria-describedby~="${idBase}-${campoDoErro.current}-erro"]`);
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
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      {modo === 'criar' && chaveDeEnvio && <input type="hidden" name="envio" value={chaveDeEnvio} />}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={(c) => ROTULO_DO_CAMPO[c] ?? (c.startsWith('validade-') ? `Validade em ${CONSERVACOES[c.slice(9) as Conservacao]?.toLowerCase() ?? c}` : c)} />
      <ErroGeral estado={estado} recarregar={aqui} />
      <SalvandoAnunciado />

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Painel titulo="O que é">
          <div className="space-y-4">
            <div>
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

            <div>
              {prePreparo ? (
                <div>
                  <span className={ROTULO}>Tipo</span>
                  <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-[42px]">{TIPOS.PRE_PREPARO}</p>
                  <p className={AJUDA}>Pré-preparo nasce da ficha técnica e continua pré-preparo.</p>
                  <input type="hidden" name="tipo" value="PRE_PREPARO" />
                </div>
              ) : (
                <div className="sm:max-w-sm">
                  <Segmentos
                    nome="tipo"
                    legenda="Tipo"
                    opcoes={[
                      ['INGREDIENTE', TIPOS.INGREDIENTE],
                      ['EMBALAGEM', TIPOS.EMBALAGEM],
                    ]}
                    valor={tipo}
                    aoMudar={setTipo}
                  />
                  <Erro id={`${idBase}-tipo-erro`} texto={erros.tipo} />
                </div>
              )}
            </div>

            <div className="sm:max-w-md">
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
              <Erro id={`${idBase}-categoriaId-erro`} texto={erros.categoriaId} />
              {escolheu && sugestao && sugeridaId !== '' && categoriaId !== sugeridaId && (
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
          </div>
        </Painel>

        <Painel titulo="Onde guarda e quanto dura">
          <CamposDeValidade
            para="insumo"
            inicial={inicial.validades ?? { principal: inicial.conservacao, minutos: {} }}
            erros={erros}
            idBase={idBase}
            aoMudar={saida.aoMudar}
          />
        </Painel>

        <Painel titulo="Como você compra">
          <div className="space-y-4">
            <div>
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
                  descritoPor={[`${idBase}-unidade-ajuda`, erros.unidade ? `${idBase}-unidade-erro` : ''].filter(Boolean).join(' ')}
                  opcoes={(Object.keys(UNIDADES) as Unidade[]).map((k) => [k, UNIDADES[k].nome] as const)}
                  valor={unidade}
                  aoMudar={setUnidade}
                />
              )}
              <p id={`${idBase}-unidade-ajuda`} className={AJUDA}>
                Como você controla o estoque e como a ficha usa o insumo.
              </p>
              <Erro id={`${idBase}-unidade-erro`} texto={erros.unidade} />
            </div>
            {unidade ? (
              <CamposDaEmbalagem unidade={unidade} inicial={inicial} erros={erros} idBase={idBase} />
            ) : (
              <p className="rounded-[10px] border border-dashed border-linha-forte px-4 py-3 text-[13px] text-suave">
                Escolha a unidade base para informar quanto vem na embalagem e o preço.
              </p>
            )}
          </div>
        </Painel>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio} className="sm:min-w-44">
          {modo === 'criar' ? 'Cadastrar insumo' : 'Salvar alterações'}
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
