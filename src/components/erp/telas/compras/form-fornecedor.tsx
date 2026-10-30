'use client';

/**
 * Cadastro do fornecedor (F.1a): quem vende, onde fica, como falar e quanto tempo de prazo. Obrigatórios ditos em palavras
 * ("obrigatório"): nome fantasia, razão social, CNPJ ou CPF, e-mail e WhatsApp com DDD. A única exceção é "Compras sem nota
 * fiscal" (feira, atacarejo): pede só o nome e o WhatsApp. A conferência é refeita ao salvar (dígitos verificadores, documento
 * repetido, nome parecido, formato); aqui o erro volta para o lado do campo, sem perder o que foi digitado. O mesmo envio feito duas
 * vezes (clique repetido, conexão que caiu) cadastra um fornecedor só.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { LIMITES_DO_FORNECEDOR, rotuloDoCampoDoFornecedor, UFS } from '@/lib/erp/compra-campos';
import { rotuloDaVolta } from '@/lib/erp/volta';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel } from '../../ui/superficies';
import { SalvandoAnunciado, useAcaoSegura } from '../cadastro/anuncio';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';

export interface ValoresDoFornecedor {
  nome: string;
  razaoSocial: string;
  documento: string;
  inscricaoEstadual: string;
  endereco: string;
  municipio: string;
  uf: string;
  cep: string;
  email: string;
  whatsapp: string;
  contatoComercial: string;
  prazoPagamentoDias: string;
  semNotaFiscal: boolean;
}

export const FORNECEDOR_NOVO: ValoresDoFornecedor = {
  nome: '',
  razaoSocial: '',
  documento: '',
  inscricaoEstadual: '',
  endereco: '',
  municipio: '',
  uf: '',
  cep: '',
  email: '',
  whatsapp: '',
  contatoComercial: '',
  prazoPagamentoDias: '',
  semNotaFiscal: false,
};

/** Na ordem em que os campos aparecem na tela (o foco vai para o primeiro com problema). */
const ORDEM_NA_TELA = ['nome', 'razaoSocial', 'documento', 'inscricaoEstadual', 'endereco', 'municipio', 'uf', 'cep', 'contatoComercial', 'whatsapp', 'email', 'prazoPagamentoDias'];

/** O texto de "obrigatório" que acompanha o rótulo: dito em palavras, não só por cor ou asterisco. */
const OBRIGATORIO = <span className="font-normal text-suave"> (obrigatório)</span>;
const OPCIONAL = <span className="font-normal text-suave"> (opcional)</span>;

export function FormFornecedor({
  acao,
  modo,
  base,
  aqui,
  cancelar,
  inicial = FORNECEDOR_NOVO,
  versao,
  bloqueio = null,
  envio,
  volta,
  falta = [],
  contatoAntigo = null,
}: {
  acao: AcaoDeCadastro;
  modo: 'criar' | 'editar';
  base: string;
  aqui: string;
  cancelar: string;
  inicial?: ValoresDoFornecedor;
  versao?: string;
  bloqueio?: string | null;
  /** A chave deste envio (um UUID por abertura do formulário): o servidor reconhece o reenvio e não cria outro fornecedor. */
  envio?: string;
  /** O caminho de volta JÁ VALIDADO (veio de "Fornecedor novo: cadastrar" numa nota): salvar leva de volta para lá. */
  volta?: string | null;
  /** Editar um cadastro "a completar": o que falta (a lista que a regra montou). */
  falta?: string[];
  /** O texto livre do cadastro antigo, só para consulta: a F.1a não o converte em WhatsApp nem e-mail. */
  contatoAntigo?: string | null;
}) {
  const acaoSegura = useAcaoSegura(acao);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acaoSegura, null);
  const [semNota, setSemNota] = useState(inicial.semNotaFiscal);
  // A chave do envio nasce na montagem e não muda enquanto o formulário estiver aberto.
  const [chaveDeEnvio] = useState(envio ?? '');
  const saida = useAvisoDeSaida(estado);
  const erros = estado?.erros ?? {};
  const idBase = 'fornecedor';

  const vez = estado?.vez;
  const comErro = Object.keys(erros).filter((c) => c !== 'geral' && erros[c]);
  const primeiroErro = [...comErro].sort((x, y) => (ORDEM_NA_TELA.indexOf(x) + 1 || 99) - (ORDEM_NA_TELA.indexOf(y) + 1 || 99))[0];
  const campoDoErro = useRef(primeiroErro);
  campoDoErro.current = primeiroErro;
  useEffect(() => {
    if (!vez || !campoDoErro.current) return;
    document.getElementById(`${idBase}-${campoDoErro.current}`)?.focus({ preventScroll: false });
  }, [vez]);

  const obrigatorioSalvoSemNota = semNota ? OPCIONAL : OBRIGATORIO;

  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      {modo === 'criar' && chaveDeEnvio && <input type="hidden" name="envio" value={chaveDeEnvio} />}
      {modo === 'criar' && volta && <input type="hidden" name="volta" value={volta} />}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={rotuloDoCampoDoFornecedor} />
      <ErroGeral estado={estado} recarregar={aqui} />
      <SalvandoAnunciado />
      {modo === 'editar' && falta.length > 0 && (
        <Aviso tom="alerta" titulo="Cadastro a completar.">
          Falta: {falta.join(', ')}. Complete e salve; a nota que já usa este fornecedor continua valendo.
        </Aviso>
      )}

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Painel titulo="Quem vende">
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idBase}-nome`} className={ROTULO}>
                Nome fantasia{OBRIGATORIO}
              </label>
              <input
                id={`${idBase}-nome`}
                name="nome"
                required
                aria-required="true"
                maxLength={LIMITES_DO_FORNECEDOR.nome}
                autoComplete="off"
                defaultValue={inicial.nome}
                placeholder="Como a equipe chama"
                className={CAMPO}
                aria-invalid={!!erros.nome}
                aria-describedby={`${idBase}-nome-ajuda${erros.nome ? ` ${idBase}-nome-erro` : ''}`}
              />
              <p id={`${idBase}-nome-ajuda`} className={AJUDA}>
                Não repete. Outro estabelecimento da mesma empresa? Acrescente o bairro ou a cidade (Laticínios Exemplo - Penha).
              </p>
              <Erro id={`${idBase}-nome-erro`} texto={erros.nome} />
              {estado?.desativadoId && erros.nome && (
                <Link href={`${base}/${estado.desativadoId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-flex min-h-0 items-center [@media(pointer:coarse)]:min-h-11`}>
                  Abrir o fornecedor desativado para reativar
                </Link>
              )}
              {estado?.existenteId && erros.nome && (
                <Link href={`${base}/${estado.existenteId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-flex min-h-0 items-center [@media(pointer:coarse)]:min-h-11`}>
                  Abrir o fornecedor que já existe
                </Link>
              )}
            </div>

            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border border-linha px-3 py-2.5 text-sm text-texto">
              <input
                type="checkbox"
                name="semNotaFiscal"
                checked={semNota}
                onChange={(e) => setSemNota(e.target.checked)}
                className={`${MARCAR} mt-0.5`}
                aria-describedby={`${idBase}-semNotaFiscal-ajuda`}
              />
              <span>
                <span className="block font-medium">Compras sem nota fiscal</span>
                <span id={`${idBase}-semNotaFiscal-ajuda`} className="block text-[12px] text-suave">
                  Feira, atacarejo, quem não emite nota. Pede só o nome e o WhatsApp, e este cadastro nunca é ligado a uma nota fiscal.
                </span>
              </span>
            </label>

            <div>
              <label htmlFor={`${idBase}-razaoSocial`} className={ROTULO}>
                Razão social{obrigatorioSalvoSemNota}
              </label>
              <input
                id={`${idBase}-razaoSocial`}
                name="razaoSocial"
                aria-required={!semNota}
                maxLength={LIMITES_DO_FORNECEDOR.razaoSocial}
                autoComplete="off"
                defaultValue={inicial.razaoSocial}
                placeholder="Como está escrita na nota"
                className={CAMPO}
                aria-invalid={!!erros.razaoSocial}
                aria-describedby={erros.razaoSocial ? `${idBase}-razaoSocial-erro` : undefined}
              />
              <Erro id={`${idBase}-razaoSocial-erro`} texto={erros.razaoSocial} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${idBase}-documento`} className={ROTULO}>
                  CNPJ ou CPF{obrigatorioSalvoSemNota}
                </label>
                <input
                  id={`${idBase}-documento`}
                  name="documento"
                  inputMode="numeric"
                  aria-required={!semNota}
                  autoComplete="off"
                  maxLength={20}
                  defaultValue={inicial.documento}
                  className={`${CAMPO} tabular-nums`}
                  aria-invalid={!!erros.documento}
                  aria-describedby={`${idBase}-documento-ajuda${erros.documento ? ` ${idBase}-documento-erro` : ''}`}
                />
                <p id={`${idBase}-documento-ajuda`} className={AJUDA}>
                  Com ou sem pontos. É por ele que o sistema reconhece o fornecedor na nota fiscal.
                </p>
                <Erro id={`${idBase}-documento-erro`} texto={erros.documento} />
                {estado?.existenteId && erros.documento && (
                  <Link href={`${base}/${estado.existenteId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-flex min-h-0 items-center [@media(pointer:coarse)]:min-h-11`}>
                    Abrir o fornecedor que já existe
                  </Link>
                )}
                {estado?.desativadoId && erros.documento && (
                  <Link href={`${base}/${estado.desativadoId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-flex min-h-0 items-center [@media(pointer:coarse)]:min-h-11`}>
                    Abrir o fornecedor desativado para reativar
                  </Link>
                )}
              </div>
              <div>
                <label htmlFor={`${idBase}-inscricaoEstadual`} className={ROTULO}>
                  Inscrição estadual{OPCIONAL}
                </label>
                <input
                  id={`${idBase}-inscricaoEstadual`}
                  name="inscricaoEstadual"
                  autoComplete="off"
                  maxLength={20}
                  defaultValue={inicial.inscricaoEstadual}
                  placeholder="Números ou ISENTO"
                  className={`${CAMPO} tabular-nums`}
                  aria-invalid={!!erros.inscricaoEstadual}
                  aria-describedby={erros.inscricaoEstadual ? `${idBase}-inscricaoEstadual-erro` : undefined}
                />
                <Erro id={`${idBase}-inscricaoEstadual-erro`} texto={erros.inscricaoEstadual} />
              </div>
            </div>
          </div>
        </Painel>

        <Painel titulo="Onde fica" subtitulo="Opcional. Ajuda a reconhecer a nota e a separar um estabelecimento do outro">
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idBase}-endereco`} className={ROTULO}>
                Endereço{OPCIONAL}
              </label>
              <input
                id={`${idBase}-endereco`}
                name="endereco"
                maxLength={LIMITES_DO_FORNECEDOR.endereco}
                autoComplete="off"
                defaultValue={inicial.endereco}
                placeholder="Rua, número, bairro"
                className={CAMPO}
                aria-invalid={!!erros.endereco}
                aria-describedby={erros.endereco ? `${idBase}-endereco-erro` : undefined}
              />
              <Erro id={`${idBase}-endereco-erro`} texto={erros.endereco} />
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
              <div>
                <label htmlFor={`${idBase}-municipio`} className={ROTULO}>
                  Município{OPCIONAL}
                </label>
                <input
                  id={`${idBase}-municipio`}
                  name="municipio"
                  maxLength={LIMITES_DO_FORNECEDOR.municipio}
                  autoComplete="off"
                  defaultValue={inicial.municipio}
                  className={CAMPO}
                  aria-invalid={!!erros.municipio}
                  aria-describedby={erros.municipio ? `${idBase}-municipio-erro` : undefined}
                />
                <Erro id={`${idBase}-municipio-erro`} texto={erros.municipio} />
              </div>
              <div>
                <label htmlFor={`${idBase}-uf`} className={ROTULO}>
                  UF{OPCIONAL}
                </label>
                <select
                  id={`${idBase}-uf`}
                  name="uf"
                  defaultValue={inicial.uf}
                  className={`${CAMPO} pr-8`}
                  aria-invalid={!!erros.uf}
                  aria-describedby={erros.uf ? `${idBase}-uf-erro` : undefined}
                >
                  <option value="">—</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <Erro id={`${idBase}-uf-erro`} texto={erros.uf} />
              </div>
              <div>
                <label htmlFor={`${idBase}-cep`} className={ROTULO}>
                  CEP{OPCIONAL}
                </label>
                <input
                  id={`${idBase}-cep`}
                  name="cep"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  defaultValue={inicial.cep}
                  className={`${CAMPO} tabular-nums`}
                  aria-invalid={!!erros.cep}
                  aria-describedby={erros.cep ? `${idBase}-cep-erro` : undefined}
                />
                <Erro id={`${idBase}-cep-erro`} texto={erros.cep} />
              </div>
            </div>
          </div>
        </Painel>

        <Painel titulo="Como falar" subtitulo="Os contatos são só para consulta: o sistema nunca manda mensagem a eles sozinho">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${idBase}-contatoComercial`} className={ROTULO}>
                  Contato comercial{OPCIONAL}
                </label>
                <input
                  id={`${idBase}-contatoComercial`}
                  name="contatoComercial"
                  maxLength={LIMITES_DO_FORNECEDOR.contatoComercial}
                  autoComplete="off"
                  defaultValue={inicial.contatoComercial}
                  placeholder="Nome de quem atende"
                  className={CAMPO}
                  aria-invalid={!!erros.contatoComercial}
                  aria-describedby={erros.contatoComercial ? `${idBase}-contatoComercial-erro` : undefined}
                />
                <Erro id={`${idBase}-contatoComercial-erro`} texto={erros.contatoComercial} />
              </div>
              <div>
                <label htmlFor={`${idBase}-whatsapp`} className={ROTULO}>
                  WhatsApp com DDD{OBRIGATORIO}
                </label>
                <input
                  id={`${idBase}-whatsapp`}
                  name="whatsapp"
                  type="tel"
                  inputMode="tel"
                  required
                  aria-required="true"
                  autoComplete="off"
                  maxLength={20}
                  defaultValue={inicial.whatsapp}
                  placeholder="(21) 99641-6060"
                  className={`${CAMPO} tabular-nums`}
                  aria-invalid={!!erros.whatsapp}
                  aria-describedby={erros.whatsapp ? `${idBase}-whatsapp-erro` : undefined}
                />
                <Erro id={`${idBase}-whatsapp-erro`} texto={erros.whatsapp} />
              </div>
            </div>
            <div>
              <label htmlFor={`${idBase}-email`} className={ROTULO}>
                E-mail{obrigatorioSalvoSemNota}
              </label>
              <input
                id={`${idBase}-email`}
                name="email"
                type="email"
                inputMode="email"
                aria-required={!semNota}
                autoComplete="off"
                autoCapitalize="none"
                maxLength={LIMITES_DO_FORNECEDOR.email}
                defaultValue={inicial.email}
                placeholder="vendas@fornecedor.com.br"
                className={CAMPO}
                aria-invalid={!!erros.email}
                aria-describedby={erros.email ? `${idBase}-email-erro` : undefined}
              />
              <Erro id={`${idBase}-email-erro`} texto={erros.email} />
            </div>
            {contatoAntigo && (
              <p className="rounded-[10px] border border-linha px-3 py-2.5 text-[13px] text-suave">
                <span className="font-medium text-texto">Contato do cadastro antigo:</span> {contatoAntigo}. Fica só para consulta; passe o que serve para os campos acima.
              </p>
            )}
          </div>
        </Painel>

        <Painel titulo="Pagamento">
          <div className="max-w-xs">
            <label htmlFor={`${idBase}-prazoPagamentoDias`} className={ROTULO}>
              Prazo de pagamento, em dias{OPCIONAL}
            </label>
            <input
              id={`${idBase}-prazoPagamentoDias`}
              name="prazoPagamentoDias"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              defaultValue={inicial.prazoPagamentoDias}
              placeholder="Ex.: 28"
              className={`${CAMPO} tabular-nums`}
              aria-invalid={!!erros.prazoPagamentoDias}
              aria-describedby={`${idBase}-prazoPagamentoDias-ajuda${erros.prazoPagamentoDias ? ` ${idBase}-prazoPagamentoDias-erro` : ''}`}
            />
            <p id={`${idBase}-prazoPagamentoDias-ajuda`} className={AJUDA}>
              De 0 a 180. Só fica guardado: nenhum vencimento ou despesa nasce dele.
            </p>
            <Erro id={`${idBase}-prazoPagamentoDias-erro`} texto={erros.prazoPagamentoDias} />
          </div>
        </Painel>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio} className="sm:min-w-44">
          {modo === 'criar' ? (volta ? `Cadastrar e voltar para ${rotuloDaVolta(volta)}` : 'Cadastrar fornecedor') : 'Salvar alterações'}
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
