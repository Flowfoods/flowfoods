/**
 * ERP 1.4 · Validade por conservação, sem banco — e as heranças puras da 1.3:
 * (a) o insumo produzido por um pré-preparo não entra como insumo comum;
 * (b) a limpeza de JPEG guarda só os marcadores que desenham a imagem;
 * (d) faxina de foto pendente com teto e intervalo (também ao abrir a lista).
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FAXINA, faxinarPendentes, faxinarPendentesDeVezEmQuando } from '@/lib/erp/arquivos';
import { lerFormFicha, retratoDaFicha, type InsumoDaFicha, type PreparoDaFicha } from '@/lib/erp/ficha-campos';
import { lerFormInsumo } from '@/lib/erp/insumo-campos';
import { readFileSync } from 'node:fs';
import { casarComInsumos, decodificarPlanilha, lerPlanilhaDeFichas } from '@/lib/erp/ficha-planilha';
import {
  colunasDaValidade,
  entradaDoFormulario,
  formatarValidade,
  lerConservacaoDaPlanilha,
  lerValidadeDaPlanilha,
  lerValidades,
  paraMinutos,
  retratoDaValidade,
  VALIDADE_MAXIMA_MIN,
  validadeParaCampo,
  validadesDaLinha,
  validadesEmTexto,
  validadesParaCampos,
  type EntradaDeValidade,
} from '@/lib/erp/validade';
import { limparMetadados, MENSAGEM_JPEG_ESTRANHO } from '@/lib/erp/foto-metadados';
import { GPS, JPG_LIMPO, jpgComGps } from './erp-fotos-teste';

const ins = (id: string, nome: string, extra: Partial<InsumoDaFicha> = {}): InsumoDaFicha => ({
  id,
  nome,
  unidade: 'KG',
  ativo: true,
  conteudoMilesimos: 1000,
  precoEmbalagemCentavos: 500,
  taxaEntregaCentavos: 0,
  ...extra,
});

/** Formulário como o navegador manda (`aceita_X=on`, `validade_X`, `validadeEm_X`, `conservacao`). */
const form = (campos: Record<string, string>) => entradaDoFormulario((k) => campos[k]);

describe('ERP 1.4 · dias/horas ↔ minutos', () => {
  it('inteiros: 3 dias = 4320 min, 6 horas = 360 min; decimal, negativo e texto são inválidos', () => {
    expect(paraMinutos('3', 'dias')).toBe(4320);
    expect(paraMinutos(' 30 ', 'dias')).toBe(43_200);
    expect(paraMinutos('6', 'horas')).toBe(360);
    expect(paraMinutos('0', 'dias')).toBe(0);
    for (const t of ['1,5', '1.5', '-2', 'três', '', '1e3']) expect(paraMinutos(t, 'dias'), t).toBeNull();
  });

  it('volta para o campo em dias quando fecha em dias, senão em horas', () => {
    expect(validadeParaCampo(4320)).toEqual({ quantidade: '3', em: 'dias' });
    expect(validadeParaCampo(2160)).toEqual({ quantidade: '36', em: 'horas' });
    expect(validadeParaCampo(360)).toEqual({ quantidade: '6', em: 'horas' });
  });

  it('texto: "1 dia", "3 dias", "1 hora", "36 horas"; minuto quebrado aparece como é', () => {
    expect(formatarValidade(1440)).toBe('1 dia');
    expect(formatarValidade(4320)).toBe('3 dias');
    expect(formatarValidade(60)).toBe('1 hora');
    expect(formatarValidade(2160)).toBe('36 horas');
    expect(formatarValidade(90)).toBe('90 min');
  });
});

describe('ERP 1.4 · validação das conservações e validades', () => {
  const cheddar = { aceita_REFRIGERADO: 'on', validade_REFRIGERADO: '3', validadeEm_REFRIGERADO: 'dias', aceita_CONGELADO: 'on', validade_CONGELADO: '30', validadeEm_CONGELADO: 'dias', conservacao: 'REFRIGERADO' };

  it('Molho cheddar: refrigerado 3 dias e congelado 30 dias, principal refrigerado', () => {
    expect(lerValidades(form(cheddar), 'ficha')).toEqual({ ok: true, validades: { principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } } });
  });

  it('pista fria em horas', () => {
    const r = lerValidades(form({ aceita_PISTA_FRIA: 'on', validade_PISTA_FRIA: '6', validadeEm_PISTA_FRIA: 'horas' }), 'ficha');
    expect(r).toEqual({ ok: true, validades: { principal: 'PISTA_FRIA', minutos: { PISTA_FRIA: 360 } } });
  });

  it('uma marcada só: ela é a principal sem precisar escolher', () => {
    const r = lerValidades(form({ aceita_CONGELADO: 'on', validade_CONGELADO: '90' }), 'ficha');
    expect(r.ok && r.validades).toEqual({ principal: 'CONGELADO', minutos: { CONGELADO: 129_600 } });
  });

  it('ficha sem nenhuma marcada = validade não informada (null); com a principal escolhida, avisa (1.5, herança c)', () => {
    expect(lerValidades(form({}), 'ficha')).toEqual({ ok: true, validades: null });
    const r = lerValidades(form({ conservacao: 'SECO' }), 'ficha');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erros.conservacao).toMatch(/nenhuma conservação tem validade/);
  });

  it('insumo sem nenhuma marcada: fica a principal ESCOLHIDA, sem prazo; sem escolha, recusa (I.1b: nada de assumir Seco)', () => {
    expect(lerValidades(form({ conservacao: 'REFRIGERADO' }), 'insumo')).toEqual({ ok: true, validades: { principal: 'REFRIGERADO', minutos: {} } });
    for (const sem of [undefined, '', 'Conservação', 'Selecione a conservação', 'seco', 'FRIO']) {
      const r = lerValidades({ principal: sem, linhas: {} }, 'insumo');
      expect(r.ok, String(sem)).toBe(false);
      expect(!r.ok && r.erros.conservacao).toMatch(/Escolha a conservação/);
    }
    // Prazo digitado sem escolher a conservação também não escolhe por ela.
    const soPrazo = lerValidades(form({ aceita_REFRIGERADO: 'on', validade_REFRIGERADO: '3' }), 'insumo');
    expect(!soPrazo.ok && soPrazo.erros.conservacao).toMatch(/Escolha a conservação/);
  });

  it('marcada exige validade > 0 e ≤ 730 dias, inteira', () => {
    const r = lerValidades(
      form({
        aceita_SECO: 'on', validade_SECO: '',
        aceita_PISTA_FRIA: 'on', validade_PISTA_FRIA: '0', validadeEm_PISTA_FRIA: 'horas',
        aceita_REFRIGERADO: 'on', validade_REFRIGERADO: '2,5',
        aceita_CONGELADO: 'on', validade_CONGELADO: '731',
        conservacao: 'CONGELADO',
      }),
      'ficha',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros['validade-SECO']).toMatch(/Diga quanto dura em seco/);
    expect(r.erros['validade-PISTA_FRIA']).toMatch(/maior que zero/);
    expect(r.erros['validade-REFRIGERADO']).toMatch(/número inteiro de dias/);
    expect(r.erros['validade-CONGELADO']).toMatch(/730 dias/);
    // O teto exato passa.
    expect(lerValidades(form({ aceita_CONGELADO: 'on', validade_CONGELADO: '730' }), 'ficha').ok).toBe(true);
    expect(VALIDADE_MAXIMA_MIN).toBe(1_051_200);
  });

  it('a principal precisa estar marcada; com várias marcadas, precisa ser dita; valor forjado é recusado', () => {
    const naoMarcada = lerValidades(form({ ...cheddar, conservacao: 'SECO' }), 'ficha');
    expect(!naoMarcada.ok && naoMarcada.erros.conservacao).toMatch(/principal \(seco\) precisa estar marcada/);
    const semPrincipal = lerValidades(form({ ...cheddar, conservacao: '' }), 'ficha');
    expect(!semPrincipal.ok && semPrincipal.erros.conservacao).toMatch(/Diga qual é a conservação principal/);
    const forjada = lerValidades(form({ ...cheddar, conservacao: 'FORNO' }), 'ficha');
    expect(!forjada.ok && forjada.erros.conservacao).toMatch(/desconhecida/);
    const insumo = lerValidades(form({ aceita_CONGELADO: 'on', validade_CONGELADO: '30', conservacao: 'SECO' }), 'insumo');
    expect(insumo.ok).toBe(false);
  });

  it('texto para o cozinheiro: principal primeiro; histórico na ordem fixa', () => {
    const v = { principal: 'CONGELADO' as const, minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } };
    expect(validadesEmTexto(v)).toBe('Congelado: 30 dias · Refrigerado: 3 dias');
    expect(validadesEmTexto({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } })).toBe('Refrigerado: 3 dias · Congelado: 30 dias');
    expect(retratoDaValidade(v)).toBe('Refrigerado 3 dias · Congelado 30 dias');
    expect(validadesEmTexto(null)).toBeNull();
    expect(validadesEmTexto({ principal: 'SECO', minutos: {} })).toBeNull();
    expect(retratoDaValidade({ principal: 'SECO', minutos: {} })).toBeNull();
  });

  it('banco ↔ validades: as 4 colunas sempre (null onde não aceita); principal nula = não informada', () => {
    const col = colunasDaValidade({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320 } });
    expect(col).toEqual({ validadeSecoMin: null, validadePistaFriaMin: null, validadeRefrigeradoMin: 4320, validadeCongeladoMin: null });
    expect(validadesDaLinha({ ...col, conservacao: 'REFRIGERADO' })).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320 } });
    expect(validadesDaLinha({ ...colunasDaValidade(null), conservacao: null })).toBeNull();
    expect(colunasDaValidade(null)).toEqual({ validadeSecoMin: null, validadePistaFriaMin: null, validadeRefrigeradoMin: null, validadeCongeladoMin: null });
    const campos = validadesParaCampos({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, PISTA_FRIA: 360 } });
    expect(campos.REFRIGERADO).toEqual({ marcada: true, quantidade: '3', em: 'dias' });
    expect(campos.PISTA_FRIA).toEqual({ marcada: true, quantidade: '6', em: 'horas' });
    expect(campos.SECO.marcada).toBe(false);
    expect(campos.principal).toBe('REFRIGERADO');
  });
});

describe('ERP 1.4 · formulário da ficha e do insumo com validade', () => {
  const base = { nome: 'Molho cheddar', tipo: 'PRE_PREPARO', rendimento: '2', rendimentoUnidade: 'kg', itens: [{ insumoId: 'c', quantidade: '1', unidade: 'kg' }] };
  const doCadastro = new Map([['c', ins('c', 'Cheddar')]]);
  const validade: EntradaDeValidade = {
    principal: 'REFRIGERADO',
    linhas: { REFRIGERADO: { marcada: true, quantidade: '3', em: 'dias' }, CONGELADO: { marcada: true, quantidade: '30', em: 'dias' } },
  };

  it('ficha: as validades vão para os dados e para o retrato do histórico', () => {
    const r = lerFormFicha({ ...base, validade }, doCadastro);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.validades).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } });
    const retrato = retratoDaFicha(r.dados, new Map([['c', { nome: 'Cheddar', unidade: 'KG' as const }]]), null);
    expect(retrato.conservacao).toBe('REFRIGERADO');
    expect(retrato.validade).toBe('Refrigerado 3 dias · Congelado 30 dias');
  });

  it('ficha sem o bloco (planilha antiga) ou sem marcada: validades null; erro de validade volta junto com os outros', () => {
    const sem = lerFormFicha(base, doCadastro);
    expect(sem.ok && sem.dados.validades).toBeNull();
    const ruim = lerFormFicha({ ...base, nome: '', validade: { linhas: { SECO: { marcada: true, quantidade: '', em: 'dias' } } } }, doCadastro);
    expect(!ruim.ok && Object.keys(ruim.erros).sort()).toEqual(['nome', 'validade-SECO']);
  });

  it('insumo: formulário antigo (só a conservação) continua valendo; com validade, grava os minutos', () => {
    const antigo = { nome: 'Cebola', unidade: 'KG', categoriaId: 'cat1', conservacao: 'REFRIGERADO', conteudo: '5', preco: '10' };
    const r = lerFormInsumo(antigo);
    expect(r.ok && r.dados.validades).toEqual({ principal: 'REFRIGERADO', minutos: {} });
    const comValidade = lerFormInsumo({ ...antigo, aceita_REFRIGERADO: 'on', validade_REFRIGERADO: '5', validadeEm_REFRIGERADO: 'dias' });
    expect(comValidade.ok && comValidade.dados).toMatchObject({ conservacao: 'REFRIGERADO', validades: { principal: 'REFRIGERADO', minutos: { REFRIGERADO: 7200 } } });
    const errado = lerFormInsumo({ ...antigo, aceita_CONGELADO: 'on', validade_CONGELADO: '30' });
    expect(!errado.ok && errado.erros.conservacao).toMatch(/prazo em refrigerado \(a conservação principal\)/);
  });
});

describe('ERP 1.4 · planilha: célula de validade e de conservação', () => {
  it('"3", "3 dias", "3d", "1 dia" = dias; "6 h", "6 horas", "6hs" = horas; vazio = não aceita', () => {
    expect(lerValidadeDaPlanilha('3')).toBe(4320);
    expect(lerValidadeDaPlanilha('3 dias')).toBe(4320);
    expect(lerValidadeDaPlanilha('3d')).toBe(4320);
    expect(lerValidadeDaPlanilha(' 1 Dia ')).toBe(1440);
    expect(lerValidadeDaPlanilha('6 h')).toBe(360);
    expect(lerValidadeDaPlanilha('6 horas')).toBe(360);
    expect(lerValidadeDaPlanilha('6hs')).toBe(360);
    expect(lerValidadeDaPlanilha('')).toBeUndefined();
    expect(lerValidadeDaPlanilha('2 semanas')).toBeNull();
    expect(lerValidadeDaPlanilha('1,5')).toBeNull();
  });

  it('conservação pelo nome, com ou sem acento, e sinônimos de cozinha', () => {
    expect(lerConservacaoDaPlanilha('Refrigerado')).toBe('REFRIGERADO');
    expect(lerConservacaoDaPlanilha('pista_fria')).toBe('PISTA_FRIA');
    expect(lerConservacaoDaPlanilha('Freezer')).toBe('CONGELADO');
    expect(lerConservacaoDaPlanilha('ambiente')).toBe('SECO');
    expect(lerConservacaoDaPlanilha('')).toBeUndefined();
    expect(lerConservacaoDaPlanilha('forno')).toBeNull();
  });
});

describe('ERP 1.4 · planilha com e sem as colunas novas', () => {
  const insumos = new Map([['cheddar', [{ id: 'c' }]]]);
  const doCadastro = new Map([['c', ins('c', 'Cheddar')]]);

  it('planilha da 1.2/1.3 (sem as colunas) continua lendo, e não diz nada da validade (a ficha mantém a dela)', () => {
    const l = lerPlanilhaDeFichas('ficha;tipo;rende;unidade_rende;insumo;quantidade;unidade;fator\nMolho cheddar;pré-preparo;2;kg;Cheddar;1;kg;\n');
    expect(l.erros).toEqual([]);
    const f = l.fichas[0];
    expect(f.erros).toEqual([]);
    const { entrada } = casarComInsumos(f, insumos);
    expect(entrada.validade).toBeUndefined();
    const r = lerFormFicha(entrada, doCadastro);
    expect(r.ok && r.dados.validades).toBeNull();
  });

  it('com as colunas: refrigerado 3 dias (principal) e congelado 30 dias, preenchidas numa linha só da ficha', () => {
    const csv = [
      'ficha;tipo;rende;unidade_rende;insumo;quantidade;unidade;conservacao;validade_refrigerado;validade_congelado',
      'Molho cheddar;pré-preparo;2;kg;Cheddar;1;kg;Refrigerado;3 dias;30',
      'Molho cheddar;;;;Cheddar;100;g;;;',
    ].join('\n');
    const f = lerPlanilhaDeFichas(csv).fichas[0];
    expect(f.erros).toEqual([]);
    const { entrada } = casarComInsumos(f, insumos);
    const r = lerFormFicha({ ...entrada, itens: entrada.itens.slice(0, 1) }, doCadastro);
    expect(r.ok && r.dados.validades).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } });
  });

  it('cabeçalho sem acento/underline e só uma validade: ela é a principal', () => {
    const f = lerPlanilhaDeFichas('ficha,tipo,rende,unidade_rende,insumo,quantidade,unidade,Validade Pista Fria\nVinagrete,pre-preparo,1,kg,Cheddar,1,kg,6 h\n').fichas[0];
    const r = lerFormFicha(casarComInsumos(f, insumos).entrada, doCadastro);
    expect(r.ok && r.dados.validades).toEqual({ principal: 'PISTA_FRIA', minutos: { PISTA_FRIA: 360 } });
  });

  it('erros com a linha: validade ilegível, conservação desconhecida, divergência entre linhas, principal sem validade', () => {
    const csv = [
      'ficha;tipo;rende;unidade_rende;insumo;quantidade;unidade;conservacao;validade_refrigerado;validade_congelado',
      'A;pré-preparo;1;kg;Cheddar;1;kg;;2 semanas;',
      'B;pré-preparo;1;kg;Cheddar;1;kg;forno;;',
      'C;pré-preparo;1;kg;Cheddar;1;kg;;3;',
      'C;;;;Cheddar;1;kg;;4;',
    ].join('\n');
    const l = lerPlanilhaDeFichas(csv);
    const erro = (n: string) => l.fichas.find((f) => f.nome === n)!.erros;
    expect(erro('A')).toEqual([{ linha: 2, mensagem: 'Validade “2 semanas” em refrigerado: use dias ou horas inteiros (ex.: 3 dias, 12 h).' }]);
    expect(erro('B')[0]).toMatchObject({ linha: 3, mensagem: expect.stringMatching(/Conservação “forno” não existe/) });
    expect(erro('C')[0]).toMatchObject({ linha: 5, mensagem: expect.stringMatching(/Validade em refrigerado diferente/) });
    const D = lerPlanilhaDeFichas('ficha;tipo;rende;unidade_rende;insumo;quantidade;unidade;conservacao\nD;pré-preparo;1;kg;Cheddar;1;kg;congelado\n').fichas[0];
    const r = lerFormFicha(casarComInsumos(D, insumos).entrada, doCadastro);
    expect(!r.ok && r.erros['validade-CONGELADO']).toMatch(/Diga quanto dura em congelado/);
  });

  it('o modelo para baixar tem as colunas novas e lê sem erro', () => {
    const texto = decodificarPlanilha(new Uint8Array(readFileSync('public/modelos/fichas-tecnicas.csv')));
    const l = lerPlanilhaDeFichas(texto);
    expect(l.erros).toEqual([]);
    const molho = l.fichas.find((f) => f.nome === 'Molho da casa')!;
    expect(molho.erros).toEqual([]);
    expect(molho.validade).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 4320, CONGELADO: 43_200 } });
    expect(l.fichas.find((f) => f.nome === 'X-Burger')!.validade).toEqual({ principal: null, minutos: {} });
  });
});

describe('ERP 1.4 (herança a da 1.3) · insumo produzido não entra como insumo comum', () => {
  const CEBOLA = ins('cebola', 'Cebola');
  const MOLHO_INSUMO = ins('molho-insumo', 'Molho cheddar', { produzidoPor: 'Molho cheddar', precoEmbalagemCentavos: 0 });
  const MOLHO: PreparoDaFicha = { id: 'molho', nome: 'Molho cheddar', tipo: 'PRE_PREPARO', ativa: true, unidadeRendimento: 'KG' };
  const doCadastro = new Map([CEBOLA, MOLHO_INSUMO].map((i) => [i.id, i]));

  it('formulário forjado com o id do insumo produzido é recusado na linha, apontando o pré-preparo', () => {
    const r = lerFormFicha(
      { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: 'molho-insumo', quantidade: '40', unidade: 'g' }] },
      doCadastro,
      new Set(['molho-insumo']), // nem estando "já na ficha" ele passa
      { preparos: new Map([[MOLHO.id, MOLHO]]) },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros['item-0']).toMatch(/pré-preparo “Molho cheddar”: escolha-o em “Pré-preparos”/);
  });

  it('pelo pré-preparo (subficha) entra normalmente', () => {
    const r = lerFormFicha(
      { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: [{ subfichaId: 'molho', quantidade: '40', unidade: 'g' }, { insumoId: 'cebola', quantidade: '10', unidade: 'g' }] },
      doCadastro,
      new Set(),
      { preparos: new Map([[MOLHO.id, MOLHO]]) },
    );
    expect(r.ok).toBe(true);
  });
});

describe('ERP 1.4 (herança b da 1.3) · JPEG: só marcadores conhecidos ficam; o resto recusa', () => {
  /** O JPEG limpo com um segmento a mais logo depois do SOI. */
  const comSegmento = (marcador: number, dados: number[]) =>
    new Uint8Array([0xff, 0xd8, 0xff, marcador, 0, dados.length + 2, ...dados, ...JPG_LIMPO.subarray(2)]);
  const texto = (b: Uint8Array) => Buffer.from(b).toString('latin1');

  it('o JPEG de celular (EXIF/GPS, APP13, comentário, miniatura) sai limpo e inteiro', () => {
    const r = limparMetadados(jpgComGps(), 'jpg');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(texto(r.bytes)).not.toContain(GPS);
    expect(r.bytes[r.bytes.length - 2]).toBe(0xff);
    expect(r.bytes[r.bytes.length - 1]).toBe(0xd9);
  });

  it('APPn desconhecido (APP3, APP15) e comentário SAEM sem recusar a foto', () => {
    for (const m of [0xe3, 0xef, 0xfe]) {
      const r = limparMetadados(comSegmento(m, [...Buffer.from(`segredo ${GPS}`)]), 'jpg');
      expect(r.ok, `marcador ${m.toString(16)}`).toBe(true);
      if (r.ok) expect(texto(r.bytes)).not.toContain(GPS);
    }
  });

  it('marcador fora da lista (JPG0 F0, DHP DE, reservado 02, JPG13 FD) recusa a foto inteira', () => {
    for (const m of [0xf0, 0xde, 0x02, 0xfd]) {
      expect(limparMetadados(comSegmento(m, [1, 2, 3, 4]), 'jpg'), `marcador ${m.toString(16)}`).toEqual({ ok: false, erro: MENSAGEM_JPEG_ESTRANHO });
    }
    // TEM (FF01) não tem tamanho: também fora.
    const tem = new Uint8Array([0xff, 0xd8, 0xff, 0x01, ...JPG_LIMPO.subarray(2)]);
    expect(limparMetadados(tem, 'jpg')).toEqual({ ok: false, erro: MENSAGEM_JPEG_ESTRANHO });
  });

  it('DNL (DC) e EXP (DF) estão na lista e ficam', () => {
    for (const m of [0xdc, 0xdf]) {
      const r = limparMetadados(comSegmento(m, [0, 2]), 'jpg');
      expect(r.ok, `marcador ${m.toString(16)}`).toBe(true);
      if (r.ok) expect(Array.from(r.bytes.subarray(2, 4))).toEqual([0xff, m]);
    }
  });
});

describe('ERP 1.4 (herança d da 1.3) · faxina de pendentes barata, com teto e intervalo', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'erp-faxina-'));
  process.env.ERP_ARQUIVOS_DIR = pasta;
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));
  const pendentes = (parceiro: string) => join(pasta, parceiro, 'fichas', 'pendentes');
  const criar = (parceiro: string, n: number, horasAtras: number) => {
    mkdirSync(pendentes(parceiro), { recursive: true });
    const quando = new Date(Date.now() - horasAtras * 3600_000);
    for (let i = 0; i < n; i++) {
      const nome = `${(Math.random().toString(16).slice(2) + '0'.repeat(32)).slice(0, 32)}.jpg`;
      writeFileSync(join(pendentes(parceiro), nome), 'x');
      utimesSync(join(pendentes(parceiro), nome), quando, quando);
    }
  };

  it('apaga só as de mais de 24 h, e no máximo FAXINA.apagar por vez', async () => {
    criar('p1', FAXINA.apagar + 5, 30);
    criar('p1', 3, 1);
    expect(await faxinarPendentes('p1')).toBe(FAXINA.apagar);
    expect(await faxinarPendentes('p1')).toBe(5);
    expect(readdirSync(pendentes('p1'))).toHaveLength(3);
  });

  it('de vez em quando: a segunda chamada dentro do intervalo não varre; depois dele varre de novo', async () => {
    const t0 = Date.now();
    criar('p2', 2, 30);
    expect(await faxinarPendentesDeVezEmQuando('p2', t0)).toBe(2);
    criar('p2', 1, 30);
    expect(await faxinarPendentesDeVezEmQuando('p2', t0 + 1000)).toBeNull();
    expect(readdirSync(pendentes('p2'))).toHaveLength(1);
    expect(await faxinarPendentesDeVezEmQuando('p2', t0 + FAXINA.intervaloMs + 1)).toBe(1);
  });

  it('parceiro sem pasta não é erro', async () => {
    expect(await faxinarPendentesDeVezEmQuando('sem-pasta')).toBe(0);
  });
});

describe('ERP 1.4 (herança e da 1.3) · histórico de itens: entrou, saiu, mudou', () => {
  it('diz só a diferença, item a item', async () => {
    const { mudancasDosItens, descreverMudancas } = await import('@/lib/erp/historico');
    const antes = 'Pão brioche 1 un · Cebola 300 g (fator 1,18) · Picles 20 g';
    const depois = 'Pão brioche 1 un · Cebola 250 g (fator 1,2) · Molho cheddar 1.500 g · Bacon 2,5 kg';
    expect(mudancasDosItens(antes, depois)).toEqual([
      { campo: 'entrou', antes: null, depois: 'Molho cheddar 1.500 g · Bacon 2,5 kg' },
      { campo: 'saiu', antes: null, depois: 'Picles 20 g' },
      { campo: 'Cebola', antes: '300 g (fator 1,18)', depois: '250 g (fator 1,2)' },
    ]);
    expect(mudancasDosItens('A 1 un · B 2 un', 'B 2 un · A 1 un')).toEqual([{ campo: 'insumos', antes: null, depois: 'mesma receita, outra ordem' }]);
    // Fora do formato: a tela mostra as listas inteiras, como antes.
    expect(mudancasDosItens('texto livre', 'A 1 un')).toBeNull();
    const m = descreverMudancas({ nome: 'X', itens: antes }, { nome: 'X', itens: depois });
    expect(m.map((x) => x.campo)).toEqual(['entrou', 'saiu', 'Cebola']);
    // Na criação, a lista inteira (é o que nasceu).
    expect(descreverMudancas(null, { nome: 'X', itens: antes }).find((x) => x.campo === 'insumos')?.depois).toBe(antes);
  });
});
