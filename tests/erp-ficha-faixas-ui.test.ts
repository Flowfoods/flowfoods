/** Render de componentes reais e prévias puras; DOM, teclado e impressão nativa têm QA separado. */
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';

const resposta = vi.hoisted(() => ({ estado: null as EstadoCadastro }));
vi.mock('next/navigation', () => ({ usePathname: () => '/erp/fichas/canais', useSearchParams: () => new URLSearchParams(), redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('react-dom', async original => ({ ...await original<typeof import('react-dom')>(), useFormStatus: () => ({ pending: false }) }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useActionState: () => [resposta.estado, undefined] }));
import { FormFaixasDeCmv } from '@/components/erp/telas/fichas/form-faixas-cmv';
import { FarolDeCmv, IntervalosDoFarol, SeloDaFaixa } from '@/components/erp/telas/fichas/farol';
import { FiltrosDasFichas } from '@/components/erp/telas/fichas/filtros';
import { PrecoEMargemPorCanal, type PrecosParaTela } from '@/components/erp/telas/fichas/custo-por-canal';
import { FormEmbalagens } from '@/components/erp/telas/fichas/form-embalagens';
import { precosDasEmbalagens, contaDasEmbalagensNaTela } from '@/components/erp/telas/fichas/conta-das-embalagens';
import { DocumentoDaFicha } from '@/components/erp/telas/fichas/impressao';
import { TelaListaFichas, type LinhaNaTela } from '@/components/erp/telas/fichas/lista';
import { concluirEtapaDaFicha } from '@/components/erp/telas/fichas/continuar';
import { cmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { CAMPOS_DO_FAROL, campoDaFaixa, type ConfiguracaoDoFarol, type CortesDoFarol, type ResultadoDoFarol, type FiltroDaFaixaDoCmv } from '@/lib/erp/cmv-faixas-campos';
import { ORDEM_DOS_CANAIS, type CanalVenda } from '@/lib/erp/canal-campos';
import { entradaParaTela, type EntradaDoCanal } from '@/lib/erp/preco-campos';
import { deSeguroDaFicha, lerFiltrosDeFicha, type FiltroDoCmv } from '@/lib/erp/ficha-campos';
import type { FichaNoPapel } from '@/lib/erp/ficha-papel';

const cortes: CortesDoFarol = { aBp: 2500, bBp: 3000, cBp: 3500, dBp: 4000 };
const vazio: ConfiguracaoDoFarol = { LOJA: null, DELIVERY_PROPRIO: null, IFOOD: null };
const configurado: ConfiguracaoDoFarol = { LOJA: cortes, DELIVERY_PROPRIO: cortes, IFOOD: cortes };
const entrada = (canal: CanalVenda, custo = 3000, incompleto = false): EntradaDoCanal => ({ canal, custoDaFicha: { porRendimento: { num: BigInt(custo), den: 1n }, faltaPreco: incompleto ? ['Arroz'] : [] }, embalagens: [], taxa: null });
const conta = (custo = 3000, p: Partial<Parameters<typeof cmvDoCanal>[1]> = {}, canal: CanalVenda = 'LOJA', incompleto = false) => cmvDoCanal(entrada(canal, custo, incompleto), { metaBp: 2500, precoCentavos: 10000, cortesDoFarol: cortes, ...p });
const render = <P extends object>(componente: (props: P) => React.ReactNode, props: P) => renderToStaticMarkup(createElement(componente, props)).replace(/\s/g, ' ');
const campos = (html: string, nome: string) => [...html.matchAll(/<input\b[^>]*>/g)].map(([s]) => s).filter(s => s.includes(`name="${nome}"`));
const formProps: ComponentProps<typeof FormFaixasDeCmv> = { acao: async () => null, aqui: '/erp/fichas/canais', versao: 'v1', inicial: vazio, bloqueio: null };
beforeEach(() => { resposta.estado = null; });

describe('3B configuração explícita, sem valores padrão', () => {
  it('envia os doze campos vazios e uma versão em um formulário próprio, sem preço/meta', () => {
    const h = render(FormFaixasDeCmv, formProps);
    expect(h.match(/<form\b/g)).toHaveLength(1);
    for (const canal of ORDEM_DOS_CANAIS) for (const campo of CAMPOS_DO_FAROL) expect(campos(h, campoDaFaixa(canal, campo))).toEqual([expect.stringContaining('value=""')]);
    expect(campos(h, 'versao')[0]).toContain('v1');
    expect(h.match(/Sem faixas configuradas/g)).toHaveLength(3);
    expect(h).not.toMatch(/name="preco|name="metaCmv|value="28"|value="32"/);
  });
  it('exibe rótulos e intervalos precisos, incluindo limites com duas casas e acima de 100%', () => {
    const h = render(FormFaixasDeCmv, { ...formProps, inicial: { ...vazio, LOJA: { aBp: 0, bBp: 10001, cBp: 12005, dBp: 15000 } } });
    for (const rotulo of ['Favorável a partir de', 'Confortável a partir de', 'Confortável até', 'Atenção até']) expect(h).toContain(rotulo);
    expect(h).toContain('De 0% até menos de 100,01%');
    expect(h).toContain('De 100,01% a 120,05%, incluindo os limites');
    expect(h).toContain('Acima de 120,05% até 150%');
    expect(h).toContain('Acima de 150%');
    expect(h).toContain('Prévia dos intervalos — ainda não salva');
  });
  it('erro/conflito conserva os valores exibidos e liga erro ao campo; bloqueio desabilita três canais', () => {
    resposta.estado = { ok: false, vez: 1, conflito: true, erros: { geral: 'Outra pessoa alterou os limites.', farol_LOJA_c: 'Confira o limite.' } };
    const h = render(FormFaixasDeCmv, { ...formProps, inicial: configurado, bloqueio: 'Parceiro bloqueado.' });
    expect(campos(h, 'farol_LOJA_c')[0]).toContain('value="35"');
    expect(campos(h, 'farol_LOJA_c')[0]).toContain('aria-invalid="true"');
    expect(campos(h, 'farol_LOJA_c')[0]).toContain('farol_LOJA_c-erro');
    expect(h).toContain('Confira o limite.'); expect(h).toContain('Outra pessoa alterou os limites.');
    expect(h.match(/<fieldset[^>]*disabled=""/g)).toHaveLength(3);
  });
  it('configuração ausente não inventa intervalos', () => {
    const h = render(IntervalosDoFarol, { cortes: null });
    expect(h).toContain('Sem faixas configuradas'); expect(h).not.toMatch(/Muito favorável|Confortável|%/);
  });
});

describe('3B farol e meta independentes na apresentação', () => {
  it.each([
    ['muitoFavoravel', 'text-ok', true], ['favoravel', 'text-ok', false], ['confortavel', 'text-ok', false],
    ['atencao', 'text-atencao', false], ['critico', 'text-erro', false], ['semDados', 'text-suave', false],
    ['naoOfertado', 'text-suave', false], ['faixasNaoConfiguradas', 'text-suave', false],
  ] satisfies [ResultadoDoFarol['faixa'], string, boolean][])('%s usa o tom aprovado e texto, sem exigir cor exclusiva', (faixa, tom, cheio) => {
    const h = render(SeloDaFaixa, { faixa }); expect(h).toContain(tom);
    expect(h.includes('bg-ok/15')).toBe(cheio); expect(h).not.toContain('bg-erro/15');
    expect(h).toContain('whitespace-normal');
  });
  it('duas contas exibidas como 30,0% conservam faixas exatas diferentes e intervalos explicáveis', () => {
    const abaixo = render(FarolDeCmv, { conta: conta(2996) });
    const limite = render(FarolDeCmv, { conta: conta(3000) });
    expect(abaixo).toContain('30,0%'); expect(limite).toContain('30,0%');
    expect(abaixo).toContain('Favorável'); expect(abaixo).toContain('até menos de 30%');
    expect(limite).toContain('Confortável'); expect(limite).toContain('incluindo os limites');
    expect(limite).toContain('acima da meta');
  });
  it('35,0% arredondado pode estar acima de 35%, sem classificar pelo texto exibido', () => {
    const h = render(FarolDeCmv, { conta: conta(3504) });
    expect(h).toContain('35,0%'); expect(h).toContain('Atenção'); expect(h).toContain('Acima de 35% até 40%');
  });
  it('meta ausente mantém CMV e faixa válidos, identificando separadamente a falta da meta', () => {
    const h = render(FarolDeCmv, { conta: conta(3000, { metaBp: null }) });
    expect(h).toContain('30,0%'); expect(h).toContain('Confortável'); expect(h).toContain('Meta: não definida');
    expect(h).not.toContain('Sem dados');
  });
  it('configuração ausente mantém número, enquanto custo zero/incompleto/preço ausente não ganha faixa', () => {
    const semConfig = render(FarolDeCmv, { conta: conta(3000, { cortesDoFarol: null }) });
    expect(semConfig).toContain('30,0%'); expect(semConfig).toContain('Faixas não configuradas');
    for (const x of [conta(0), conta(3000, { precoCentavos: null }), conta(3000, {}, 'LOJA', true)]) {
      const h = render(FarolDeCmv, { conta: x }); expect(h).toContain('Sem dados'); expect(h).not.toMatch(/Muito favorável|Confortável|>0,0%</);
    }
    const h = render(FarolDeCmv, { conta: conta(3000, { ofertado: false }) });
    expect(h).toContain('Não ofertado'); expect(h).not.toContain('30,0%');
  });
});

describe('3B: configuração chega às prévias, sem alterar a fórmula ou preço manual', () => {
  const dados: PrecosParaTela = { entradas: ORDEM_DOS_CANAIS.map(c => entradaParaTela(entrada(c))), metasDeCmv: { LOJA: 2500, DELIVERY_PROPRIO: 2500, IFOOD: 2500 }, faixas: configurado, precosProprios: { LOJA: 10000, DELIVERY_PROPRIO: 10000, IFOOD: 10000 }, ofertados: { LOJA: true, DELIVERY_PROPRIO: true, IFOOD: true }, impressaoDosPrecos: 'p', impressaoDosCustos: 'c' };
  it('prévia de preço usa cortes recebidos e responde ao preço escolhido, preservando a comparação com a meta', () => {
    const h = render(PrecoEMargemPorCanal, { dados, podeConfigurar: true, aqui: '/erp/fichas/f', acao: async () => null });
    expect(h).toContain('Confortável'); expect(h).toContain('acima da meta'); expect(h).toContain('value="100,00"');
    const outro = render(PrecoEMargemPorCanal, { dados: { ...dados, precosProprios: { ...dados.precosProprios, LOJA: 20000 } }, podeConfigurar: true, aqui: '/erp/fichas/f' });
    expect(outro).toContain('Muito favorável'); expect(outro).toContain('15,0%');
  });
  it('projeção das embalagens transporta cortes e refaz a mesma fração/faixa do servidor', () => {
    const servidor = [conta(3000, {}, 'DELIVERY_PROPRIO'), conta(3000, { metaBp: null }, 'IFOOD')];
    const precos = precosDasEmbalagens(servidor)!;
    expect(precos.DELIVERY_PROPRIO.cortesDoFarol).toEqual(cortes);
    for (const x of servidor) {
      if (x.canal === 'LOJA') continue;
      const tela = contaDasEmbalagensNaTela({ canal: x.canal, porcao: { num: 3000n, den: 1n }, faltaPreco: [], embalagens: [], preco: precos[x.canal] });
      expect(tela.cmvBp).toEqual(x.cmvBp); expect(tela.farol).toEqual(x.farol); expect(tela.precoCentavos).toBe(10000);
    }
    const h = render(FormEmbalagens, { acao: async () => null, aqui: '/erp/fichas/f/canais', cancelar: '/erp/fichas/f', opcoes: [], inicial: [], impressao: 'v', porcao: { num: '3000', den: '1' }, faltaPreco: [], podeConferirPrecos: true, bloqueio: null, precos });
    expect(h).toContain('Confortável'); expect(h).toContain('Meta: não definida'); expect(h).toContain('incluindo os limites');
    expect(h).not.toMatch(/name="preco|name="farol/);
  });
});

describe('3B: dois grupos explícitos e retorno completo', () => {
  const filtros = lerFiltrosDeFicha({ cmv: ['LOJA-acima', 'IFOOD-semDados'], faixaCmv: ['LOJA-confortavel', 'DELIVERY_PROPRIO-semDados'], secao: 'secaoA', pagina: '2' });
  it('checkboxes/chips identificam grupo e canal, sem produto cartesiano ou perda do outro grupo', () => {
    const h = render(FiltrosDasFichas, { base: '/erp/fichas', filtros });
    const marcados = (nome: string) => campos(h, nome).filter(s => s.includes('checked=""'));
    expect(campos(h, 'faixaCmv')).toHaveLength(24);
    expect(marcados('cmv')).toHaveLength(2); expect(marcados('faixaCmv')).toHaveLength(2);
    expect(marcados('faixaCmv').join(' ')).toContain('LOJA-confortavel');
    expect(marcados('faixaCmv').join(' ')).toContain('DELIVERY_PROPRIO-semDados');
    expect(h).toContain('Limpar faixas'); expect(h).toContain('Limpar comparação');
    expect(h).toContain('Os canais podem ser diferentes'); expect(h).toContain('Tirar faixa Delivery'); expect(h).toContain('Tirar comparação iFood');
    const operacional = render(FiltrosDasFichas, { base: '/erp/fichas', filtros, verCustos: false });
    expect(operacional).not.toMatch(/name="cmv"|name="faixaCmv"|name="custo"|Faixas selecionadas/);
  });
  it('lista mostra os dois mapas de correspondência, sem derivar a faixa do estado da meta', () => {
    const valor = { num: 3000n, den: 1n };
    const linha: LinhaNaTela = { id: 'f', nome: 'Prato', tipo: 'PRATO', descricao: null, rendimentoMilesimos: 1000, unidadeRendimento: 'UN', ativa: true, foto: null, itens: 1, preparos: 0, validades: null, consumoImediato: true, classificacao: { secao: null, subsecao: null }, custo: { total: valor, porRendimento: valor, itens: [], semPreco: [], preparosIncompletos: [], faltaPreco: [] } };
    const h = render(TelaListaFichas, { base: '/erp/fichas', filtros, linhas: [linha], total: 1, pagina: 1, paginas: 1, cmv: new Map([['f', ORDEM_DOS_CANAIS.map(c => conta(3000, {}, c))]]), correspondenciasCmv: new Map<string, FiltroDoCmv[]>([['f', [{ canal: 'LOJA', status: 'acima' }]]]), correspondenciasFaixasCmv: new Map<string, FiltroDaFaixaDoCmv[]>([['f', [{ canal: 'LOJA', faixa: 'confortavel' }]]]) });
    expect(h).toContain('Meta: Loja · acima da meta; Faixa: Loja · Confortável');
    expect(h).toContain('A faixa considera o CMV sem arredondar');
    const celular = h.slice(h.indexOf('<ul'), h.indexOf('<table'));
    expect(celular.indexOf('Corresponde:')).toBeGreaterThan(celular.indexOf('</a>'));
    const resumo = celular.slice(celular.indexOf('Corresponde:'));
    expect(resumo).toMatch(/<dt[^>]*>Loja<\/dt>/); expect(resumo).toMatch(/<dt[^>]*>Delivery<\/dt>/); expect(resumo).toMatch(/<dt[^>]*>iFood<\/dt>/);
    expect(resumo.match(/30,0%/g)).toHaveLength(3);
    expect(resumo.match(/Acima da meta/g)).toHaveLength(3);
    const canais = resumo.slice(resumo.indexOf('<dl'), resumo.indexOf('</dl>'));
    expect(canais.match(/Confortável/g)).toHaveLength(3);
    expect(resumo).not.toContain('todos os canais');
    expect(resumo).toContain('Ver preço, meta e detalhes do CMV de Prato');
    expect(resumo).toContain('href="/erp/fichas/f?de=');
  });
  it.each(['/erp/fichas', '/rodolfo/erp/casa-a/fichas'])('retorno mantém os dois pares repetidos e seção nas continuações de %s', base => {
    const de = deSeguroDaFicha('cmv=LOJA-acima&cmv=IFOOD-semDados&faixaCmv=LOJA-confortavel&faixaCmv=DELIVERY_PROPRIO-semDados&secao=secaoA&pagina=2');
    for (const etapa of ['embalagens', 'precos'] as const) {
      let destino = '';
      try { concluirEtapaDaFicha({ ok: true, id: 'f', mudou: ['nome'] }, null, base, { mudou: 'salva' }, etapa, { de }); } catch (e) { destino = (e as Error).message.replace('REDIRECT:', ''); }
      const volta = new URLSearchParams(new URL(destino, 'http://local').searchParams.get('de')!);
      expect(volta.getAll('faixaCmv')).toEqual(['LOJA-confortavel', 'DELIVERY_PROPRIO-semDados']);
      expect(volta.getAll('cmv')).toHaveLength(2); expect(volta.get('secao')).toBe('secaoA');
    }
  });
});

describe('3B impressão financeira e operacional', () => {
  const valor = { num: 3504n, den: 1n };
  const ficha: FichaNoPapel = { materiais: [], versaoOperacional: 'papel-v1', id: 'f', nome: 'Prato no papel', tipo: 'PRATO', ativa: true, versao: '2026-11-06T12:00:00.000Z', descricao: null, rendimentoMilesimos: 1000, unidadeRendimento: 'UN', validades: null, consumoImediato: true, foto: null, passosPreparo: [], modoPreparo: null, verCustos: true, custo: { total: valor, porRendimento: valor, itens: [], semPreco: [], preparosIncompletos: [], faltaPreco: [] }, itens: [] };
  it('papel financeiro traz intervalo e meta independentes, sem depender de cor ou hover', () => {
    const h = render(DocumentoDaFicha, { ficha, canais: [conta(3504)], contexto: 'Casa', base: '/erp/fichas', geradoEm: new Date('2026-11-06') });
    expect(h).toContain('35,0%'); expect(h).toContain('Atenção'); expect(h).toContain('Acima de 35% até 40%'); expect(h).toContain('acima da meta');
    expect(h).toContain('A faixa considera o CMV sem arredondar'); expect(h).toContain('print:text-black');
  });
  it('papel operacional não renderiza farol nem configuração mesmo se houver contas no argumento', () => {
    const h = render(DocumentoDaFicha, { ficha: { ...ficha, verCustos: false, custo: null }, canais: [conta(3504)], contexto: 'Casa', base: '/erp/fichas', geradoEm: new Date('2026-11-06') });
    expect(h).not.toMatch(/35,0%|Acima de 35%|Atenção|CMV|R\$/);
    expect(h).toContain('Prato no papel');
  });
});
