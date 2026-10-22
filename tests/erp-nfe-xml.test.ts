/**
 * ERP F.1b · o leitor seguro do XML da NF-e e a parte pura da conferência (sem banco, sem Next).
 *
 * O XML sintético `tests/fixtures/nfe-sintetica.xml` é o dos critérios da análise (muçarela, bacon e guardanapo, frete R$ 30,00,
 * total R$ 580,00). Os ataques da análise viram teste aqui: XXE e "billion laughs" (recusados ANTES do leitor), arquivo grande,
 * zip, PDF, itens demais, dinheiro em notação estranha (sem float), chave adulterada, NFC-e, sem protocolo, evento, resumo.
 *
 *   npx vitest run tests/erp-nfe-xml.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chaveValida, digitoDaChave, lerCentavosDoXml, lerMilesimosDoXml, lerNfeXml, LIMITES_DO_XML } from '@/lib/erp/nfe-xml';
import {
  chaveDaMemoria,
  colunasDaEmbalagem,
  conferirTotalDoDocumento,
  contaDoItem,
  dadosDoFornecedorProvisorio,
  embalagemDaMemoria,
  embalagensDoItem,
  errosPorItemDoDocumento,
  fatorParaCampo,
  formatarChave,
  lerFator,
  lerFiltrosDeDocumento,
  montarEntradaDaNota,
  queryDosFiltrosDeDocumento,
} from '@/lib/erp/documento-fiscal-campos';

const FIXTURE = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'nfe-sintetica.xml'), 'utf8');
const CHAVE = '33261011222333000181550010000045211123456784';
const HOJE = new Date('2026-10-22T12:00:00-03:00');
const enc = (t: string) => new TextEncoder().encode(t);
const ler = (t: string | Uint8Array) => lerNfeXml(typeof t === 'string' ? enc(t) : t, HOJE);
const erro = (t: string | Uint8Array) => {
  const r = ler(t);
  if (r.ok) throw new Error('era para recusar');
  return r.erro;
};
const com = (de: string | RegExp, para: string) => FIXTURE.replace(de, para);

describe('F.1b · o XML sintético do roteiro', () => {
  it('lê a nota: chave, número, emitente, destinatário, totais em centavos e os 3 itens', () => {
    const r = ler(FIXTURE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = r.nota;
    expect(n).toMatchObject({
      chaveAcesso: CHAVE,
      modelo: 55,
      serie: '1',
      numero: '4521',
      emitidaEm: '2026-10-21',
      protocolo: { cStat: '100', nProt: '333260000000001' },
      destinatarioDocumento: '11444777000161',
      emitente: { documento: '11222333000181', razao: 'LATICINIOS EXEMPLO LTDA', fantasia: 'Laticínios Exemplo', inscricaoEstadual: '12345678', uf: 'RJ', municipio: 'Rio de Janeiro', cep: '21020000' },
      totais: { vProdCentavos: 55470, vDescCentavos: 470, vFreteCentavos: 3000, vNfCentavos: 58000, temAjusteQueNaoLanca: false },
    });
    expect(n.itens.map((i) => [i.nItem, i.codigoProduto, i.unidadeComercial, i.qComMilesimos, i.vProdCentavos, i.vDescCentavos, i.liquidoCentavos])).toEqual([
      [1, 'QJ-MUS-2K', 'PC', 3000, 14970, 470, 14500],
      [2, 'BAC-CX10', 'CX', 2000, 38000, 0, 38000],
      [3, 'GUAR-500', 'FD', 1000, 2500, 0, 2500],
    ]);
    // O frete que o emitente dividiu por item é guardado e NÃO é o que o lançamento usa.
    expect(n.itens.map((i) => i.vFreteCentavos)).toEqual([800, 2000, 200]);
    expect(n.duplicatas).toEqual([
      { numero: '001', vencimento: '2026-11-18', valorCentavos: 29000 },
      { numero: '002', vencimento: '2026-12-16', valorCentavos: 29000 },
    ]);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.texto).toContain('<nfeProc');
  });

  it('o dígito verificador da chave do roteiro está certo, e uma chave adulterada não passa', () => {
    expect(digitoDaChave(CHAVE.slice(0, 43))).toBe(4);
    expect(chaveValida(CHAVE)).toBe(true);
    expect(chaveValida(`${CHAVE.slice(0, 43)}5`)).toBe(false);
    expect(chaveValida('123')).toBe(false);
    expect(erro(FIXTURE.split(CHAVE).join(`${CHAVE.slice(0, 43)}5`))).toMatch(/dígito verificador/);
  });

  it('o mesmo arquivo dá sempre a mesma impressão; um espaço a mais dá outra (a mesma chave com outro conteúdo é outro arquivo)', () => {
    const a = ler(FIXTURE);
    const b = ler(FIXTURE);
    const c = ler(`${FIXTURE}\n`);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(a.sha256).toBe(b.sha256);
      expect(a.sha256).not.toBe(c.sha256);
    }
  });

  it('aceita o BOM do UTF-8 e as cinco entidades do XML nos textos (decodificadas à mão)', () => {
    const comBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc(FIXTURE)]);
    expect(ler(comBom).ok).toBe(true);
    const r = ler(com('<xFant>Laticínios Exemplo</xFant>', '<xFant>Queijos &amp; Frios &quot;Zé&quot; &#233;</xFant>'));
    expect(r.ok && r.nota.emitente.fantasia).toBe('Queijos & Frios "Zé" é');
  });
});

describe('F.1b · ataques ao leitor (recusados antes de gravar qualquer coisa)', () => {
  it('XXE: DOCTYPE com ENTITY externa', () => {
    const xxe = FIXTURE.replace('<nfeProc', '<!DOCTYPE nfeProc [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<nfeProc').replace('Venda de mercadoria', '&xxe;');
    expect(erro(xxe)).toMatch(/instruções extras/);
  });

  it('"billion laughs": entidades que se multiplicam são recusadas antes de qualquer expansão', () => {
    const lolz = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">]><nfeProc>&lol3;</nfeProc>`;
    const t0 = Date.now();
    expect(erro(lolz)).toMatch(/instruções extras/);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('entidade solta no meio do texto (sem DOCTYPE) também é recusada', () => {
    expect(erro(com('Venda de mercadoria', 'Venda &xxe; de mercadoria'))).toMatch(/instruções extras/);
    expect(erro(com('Venda de mercadoria', 'Venda & mercadoria'))).toMatch(/instruções extras/);
  });

  it('instrução de processamento (xml-stylesheet) e tags com nome de protótipo são recusadas', () => {
    expect(erro(FIXTURE.replace('<nfeProc', '<?xml-stylesheet href="x.xsl"?><nfeProc'))).toMatch(/instruções extras/);
    expect(erro(com('<natOp>Venda de mercadoria</natOp>', '<__proto__>x</__proto__>'))).toMatch(/instruções extras/);
  });

  it('arquivo de 1,5 MB (acima dos 900 KB), vazio, zip, PDF e binário', () => {
    expect(erro(`${FIXTURE}<!-- ${'x'.repeat(1_500_000)} -->`)).toMatch(/limite é 900 KB/);
    expect(erro(new Uint8Array())).toMatch(/vazio/);
    expect(erro(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]))).toMatch(/compactado/);
    expect(erro(enc('%PDF-1.4 fake'))).toMatch(/PDF/);
    expect(erro(new Uint8Array([0x3c, 0x61, 0x3e, 0x00, 0x01]))).toMatch(/não é um XML de texto/);
  });

  it('o limite de 900 KB é exato: 900.000 bytes passam do tamanho (e falham por ser lixo), 900.001 não', () => {
    const justo = enc(`<a>${'x'.repeat(LIMITES_DO_XML.bytes - 7)}</a>`);
    expect(justo.length).toBe(LIMITES_DO_XML.bytes);
    expect(erro(justo)).not.toMatch(/limite é 900 KB/);
    expect(erro(enc(`<a>${'x'.repeat(LIMITES_DO_XML.bytes - 6)}</a>`))).toMatch(/limite é 900 KB/);
  });

  it('itens demais: 201 itens (e 5.000) são recusados; 200 passam', () => {
    const item = (n: number) => FIXTURE.slice(FIXTURE.indexOf('<det nItem="1">'), FIXTURE.indexOf('</det>') + 6).replace('nItem="1"', `nItem="${n}"`);
    const monta = (qtd: number) => FIXTURE.replace(/<det nItem="1">[\s\S]*<\/det>(?=\s*<total>)/, Array.from({ length: qtd }, (_, i) => item(i + 1)).join('\n'));
    expect(erro(monta(201))).toMatch(/201 itens e o limite da importação é 200/);
    expect(erro(monta(5000))).toMatch(/limite|itens|complicado/);
    // 200 itens: o leitor aceita (o total é que não fecharia, mas isso é da conciliação).
    const r = ler(monta(200));
    expect(r.ok && r.nota.itens).toHaveLength(200);
  });

  it('aninhamento e quantidade de elementos fora do normal', () => {
    expect(erro(`<a>${'<b>'.repeat(100)}${'</b>'.repeat(100)}</a>`)).toMatch(/complicado demais/);
    expect(erro(`<a>${'<b/>'.repeat(LIMITES_DO_XML.tags + 10)}</a>`)).toMatch(/complicado demais/);
  });

  it('não é UTF-8, ou diz que é outra codificação', () => {
    expect(erro(new Uint8Array([0x3c, 0x61, 0x3e, 0xe7, 0x3c, 0x2f, 0x61, 0x3e]))).toMatch(/UTF-8/);
    expect(erro(FIXTURE.replace('encoding="UTF-8"', 'encoding="ISO-8859-1"'))).toMatch(/outra codificação/);
  });

  it('XML torto, texto qualquer e nota fora do esquema da NF-e', () => {
    expect(erro('<a><b></a>')).toMatch(/bem formado/);
    expect(erro('isso não é xml')).toMatch(/não parece um XML/);
    expect(erro(FIXTURE.replace(/xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe"/g, 'xmlns="http://outro.exemplo/nfe"'))).toMatch(/padrão brasileiro/);
  });
});

describe('F.1b · só entra nota fiscal autorizada, de venda, de verdade', () => {
  it('NFC-e (modelo 65)', () => {
    expect(erro(com('<mod>55</mod>', '<mod>65</mod>'))).toMatch(/NFC-e/);
    expect(erro(com('<mod>55</mod>', '<mod>57</mod>'))).toMatch(/modelo 55/);
  });

  it('NFe sem protocolo, resumo e evento têm a frase de cada um', () => {
    expect(erro(FIXTURE.replace(/<nfeProc[^>]*>/, '').replace(/<protNFe[\s\S]*<\/protNFe>/, '').replace('</nfeProc>', ''))).toMatch(/ainda não foi autorizada/);
    expect(erro(FIXTURE.replace(/<protNFe[\s\S]*<\/protNFe>/, ''))).toMatch(/não traz a autorização da Receita/);
    expect(erro('<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"><chNFe>1</chNFe></resNFe>')).toMatch(/só o resumo/);
    expect(erro('<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe"><evento/></procEventoNFe>')).toMatch(/evento/);
    expect(erro('<outraCoisa/>')).toMatch(/não é de uma nota fiscal eletrônica \(NF-e\) autorizada/);
  });

  it('cStat que não é 100 nem 150 (denegada 110, cancelada 101)', () => {
    expect(erro(com('<cStat>100</cStat>', '<cStat>110</cStat>'))).toMatch(/não está com o uso autorizado/);
    expect(erro(com('<cStat>100</cStat>', '<cStat>101</cStat>'))).toMatch(/não está com o uso autorizado/);
    expect(ler(com('<cStat>100</cStat>', '<cStat>150</cStat>')).ok).toBe(true);
  });

  it('a chave do protocolo tem de ser a da nota', () => {
    expect(erro(com(`<chNFe>${CHAVE}</chNFe>`, `<chNFe>${CHAVE.replace('4521', '4522')}</chNFe>`))).toMatch(/chave do protocolo/);
  });

  it('chave que não combina com o resto do documento (número, CNPJ, mês, série)', () => {
    expect(erro(com('<nNF>4521</nNF>', '<nNF>4522</nNF>'))).toMatch(/não combina/);
    expect(erro(com('<serie>1</serie>', '<serie>2</serie>'))).toMatch(/não combina/);
    expect(erro(com('<dhEmi>2026-10-21', '<dhEmi>2026-09-21'))).toMatch(/não combina/);
    expect(erro(com('<emit>\n        <CNPJ>11222333000181</CNPJ>', '<emit>\n        <CNPJ>11222333000262</CNPJ>'))).toMatch(/não combina/);
  });

  it('homologação, entrada do emitente, nota complementar/devolução, pessoa física e CNPJ torto', () => {
    expect(erro(com(/<tpAmb>1<\/tpAmb>\s*<verAplic>/, '<tpAmb>2</tpAmb><verAplic>'))).toMatch(/HOMOLOGAÇÃO/);
    expect(erro(com('<tpNF>1</tpNF>', '<tpNF>0</tpNF>'))).toMatch(/ENTRADA do próprio emitente/);
    expect(erro(com('<finNFe>1</finNFe>', '<finNFe>4</finNFe>'))).toMatch(/complementar, de ajuste ou de devolução/);
    expect(erro(com('<CNPJ>11444777000161</CNPJ>', '<CPF>52998224725</CPF>'))).toMatch(/pessoa física/);
    expect(erro(com('<CNPJ>11444777000161</CNPJ>', '<CNPJ>11444777000162</CNPJ>'))).toMatch(/destinatário.*dígitos verificadores/);
  });

  it('data de emissão futura', () => {
    expect(erro(lerFuturo())).toMatch(/futura/);
  });
});

function lerFuturo(): string {
  // Emitida "amanhã de amanhã" em relação ao relógio fixo do teste (a chave é refeita, para só a data valer como motivo).
  const nova = FIXTURE.replace('2026-10-21T09:00:00', '2026-12-31T09:00:00').split(CHAVE).join('33261211222333000181550010000045211123456784'.slice(0, 43) + '0');
  return nova;
}

describe('F.1b · dinheiro e quantidade como texto, sem float', () => {
  it('centavos: só ponto, até 2 casas, sem sinal, sem expoente e sem milhar', () => {
    expect(lerCentavosDoXml('149.70')).toBe(14970);
    expect(lerCentavosDoXml('0.05')).toBe(5);
    expect(lerCentavosDoXml('1234')).toBe(123400);
    expect(lerCentavosDoXml('7.5')).toBe(750);
    for (const ruim of ['1.234,56', '1,5', '1e3', '1.005', '-1.00', '', ' ', '1.2.3', 'NaN', '0x10', '12345678901234.00', '99999999999.99']) expect(lerCentavosDoXml(ruim), ruim).toBeNull();
    expect(lerCentavosDoXml(undefined)).toBeNull();
    expect(lerCentavosDoXml(12)).toBeNull();
  });

  it('milésimos: até 4 casas, a quarta arredonda a terceira (metade para cima); zero e negativo não valem', () => {
    expect(lerMilesimosDoXml('3.0000')).toBe(3000);
    expect(lerMilesimosDoXml('2.5')).toBe(2500);
    expect(lerMilesimosDoXml('0.3333')).toBe(333);
    expect(lerMilesimosDoXml('0.3335')).toBe(334);
    expect(lerMilesimosDoXml('0.0004')).toBeNull();
    expect(lerMilesimosDoXml('0')).toBeNull();
    expect(lerMilesimosDoXml('1.23456')).toBeNull();
    expect(lerMilesimosDoXml('1e2')).toBeNull();
    expect(lerMilesimosDoXml('-1')).toBeNull();
  });

  it('o XML com valor em formato torto é recusado com o nome do campo', () => {
    expect(erro(com('<vProd>380.00</vProd>', '<vProd>1.234,56</vProd>'))).toMatch(/Item 2.*vProd/);
    expect(erro(com('<vProd>380.00</vProd>', '<vProd>3.8e2</vProd>'))).toMatch(/Item 2.*vProd/);
    expect(erro(com('<vProd>380.00</vProd>', '<vProd>380.005</vProd>'))).toMatch(/Item 2.*vProd/);
    expect(erro(com('<qCom>2.0000</qCom>', '<qCom>2,0</qCom>'))).toMatch(/Item 2.*quantidade/);
    expect(erro(com('<qCom>2.0000</qCom>', '<qCom>0.0000</qCom>'))).toMatch(/quantidade/);
    expect(erro(com('<vNF>580.00</vNF>', '<vNF>5,80</vNF>'))).toMatch(/totais.*vNF/);
    expect(erro(com('<vDesc>4.70</vDesc>\n          <indTot>', '<vDesc>990.00</vDesc>\n          <indTot>'))).toMatch(/desconto é maior/);
  });

  it('IPI e ICMS ST entram no valor líquido do item; a nota que traz desoneração é marcada', () => {
    const r = ler(
      com('<imposto>\n          <ICMS>\n            <ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>380.00</vBC>', '<imposto><IPI><IPITrib><vIPI>10.00</vIPI></IPITrib></IPI>\n          <ICMS>\n            <ICMS10><orig>0</orig><CST>10</CST><vICMSST>5.50</vICMSST><vFCPST>0.50</vFCPST></ICMS10><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>380.00</vBC>'),
    );
    expect(r.ok && r.nota.itens[1]).toMatchObject({ vIpiCentavos: 1000, vStCentavos: 600, liquidoCentavos: 38000 + 1000 + 600 });
    const d = ler(com('<vICMSDeson>0.00</vICMSDeson>', '<vICMSDeson>3.00</vICMSDeson>'));
    expect(d.ok && d.nota.totais.temAjusteQueNaoLanca).toBe(true);
  });
});

describe('F.1b · a conferência do total e a conta do item', () => {
  const itens = [{ liquidoCentavos: 14500 }, { liquidoCentavos: 38000 }, { liquidoCentavos: 2500 }];

  it('itens + frete = total da nota: fecha; 581,00 não fecha e a frase diz a diferença', () => {
    expect(conferirTotalDoDocumento(itens, { vFreteCentavos: 3000, vNfCentavos: 58000 })).toMatchObject({ fecha: true, somaItensCentavos: 55000, calculadoCentavos: 58000, diferencaCentavos: 0, frase: null });
    const c = conferirTotalDoDocumento(itens, { vFreteCentavos: 3000, vNfCentavos: 58100 });
    expect(c.fecha).toBe(false);
    expect(c.diferencaCentavos).toBe(100);
    expect(c.frase).toMatch(/dão R\$\s580,00, mas a nota diz R\$\s581,00 \(diferença de R\$\s1,00\)/);
    expect(conferirTotalDoDocumento(itens, { vFreteCentavos: 3000, vNfCentavos: 58000, temAjusteQueNaoLanca: true }).fecha).toBe(true);
    expect(conferirTotalDoDocumento(itens, { vFreteCentavos: 3000, vNfCentavos: 57000, temAjusteQueNaoLanca: true }).frase).toMatch(/desoneração/);
  });

  it('a conta do roteiro: 3 PC → 6 kg, 2 CX → 20 kg, 1 FD → 500 un', () => {
    expect(contaDoItem({ qComMilesimos: 3000, unidadeComercial: 'PC', fatorMilesimos: 1000 }, { conteudoMilesimos: 2000, unidade: 'KG' })).toMatchObject({ curta: '3 PC → 6 kg', quantidadeMilesimos: 6000 });
    expect(contaDoItem({ qComMilesimos: 2000, unidadeComercial: 'CX', fatorMilesimos: 10000 }, { conteudoMilesimos: 1000, unidade: 'KG' })).toMatchObject({ curta: '2 CX → 20 kg', quantidadeMilesimos: 20000 });
    expect(contaDoItem({ qComMilesimos: 1000, unidadeComercial: 'FD', fatorMilesimos: 1000 }, { conteudoMilesimos: 500000, unidade: 'UN' })).toMatchObject({ curta: '1 FD → 500 un', quantidadeMilesimos: 500000 });
    expect(contaDoItem({ qComMilesimos: 2000, unidadeComercial: 'CX', fatorMilesimos: 10000 }, { conteudoMilesimos: 1000, unidade: 'KG' }).longa).toBe('2 CX × 10 = 20 embalagens · 20 kg');
  });

  it('o fator: de 0,001 a 1.000, vírgula ou ponto, e as frases dos erros', () => {
    expect(lerFator('10', 'CX')).toEqual({ ok: true, milesimos: 10000 });
    expect(lerFator('0,5', 'CX')).toEqual({ ok: true, milesimos: 500 });
    expect(lerFator('1.5', 'CX')).toMatchObject({ ok: false });
    expect(lerFator('', 'CX')).toMatchObject({ ok: false, erro: 'Diga quantas embalagens vêm em 1 CX.' });
    expect(lerFator('0', 'CX')).toMatchObject({ ok: false, erro: expect.stringMatching(/maior que zero/) });
    expect(lerFator('1001', 'CX')).toMatchObject({ ok: false, erro: expect.stringMatching(/passa de 1.000/) });
    expect(lerFator('abc', 'CX')).toMatchObject({ ok: false });
    expect(fatorParaCampo(10000)).toBe('10');
    expect(fatorParaCampo(500)).toBe('0,5');
    expect(embalagensDoItem(333, 1500)).toBe(500);
  });

  it('a memória é por código + unidade, em caixa alta e sem espaço nas pontas', () => {
    expect(chaveDaMemoria('  qj-mus-2k ', ' pc ')).toEqual({ codigoProduto: 'QJ-MUS-2K', unidadeComercial: 'PC' });
    expect(chaveDaMemoria('A  B', 'kg')).toEqual({ codigoProduto: 'A B', unidadeComercial: 'KG' });
    expect(chaveDaMemoria('x', 'KG')).not.toEqual(chaveDaMemoria('x', 'PC'));
  });

  it('a embalagem do seletor vira colunas e volta', () => {
    expect(colunasDaEmbalagem('padrao')).toEqual({ varianteId: null, aGranel: false });
    expect(colunasDaEmbalagem('granel')).toEqual({ varianteId: null, aGranel: true });
    expect(colunasDaEmbalagem('v:abc123')).toEqual({ varianteId: 'abc123', aGranel: false });
    expect(colunasDaEmbalagem('v:')).toBeNull();
    expect(colunasDaEmbalagem('v:x y')).toBeNull();
    expect(colunasDaEmbalagem('outra')).toBeNull();
    expect(embalagemDaMemoria({ varianteId: 'abc', aGranel: false })).toBe('v:abc');
    expect(embalagemDaMemoria({ varianteId: null, aGranel: true })).toBe('granel');
    expect(embalagemDaMemoria({ varianteId: null, aGranel: false })).toBe('padrao');
  });

  it('a chave em grupos de 4 e o filtro da lista na URL', () => {
    expect(formatarChave(CHAVE)).toBe('3326 1011 2223 3300 0181 5500 1000 0045 2111 2345 6784');
    expect(lerFiltrosDeDocumento({})).toEqual({ lojaId: '', fornecedorId: '', situacao: 'fila', pagina: 1 });
    expect(lerFiltrosDeDocumento({ situacao: 'conciliadas', loja: 'abc', pagina: '3' })).toEqual({ lojaId: 'abc', fornecedorId: '', situacao: 'conciliadas', pagina: 3 });
    expect(lerFiltrosDeDocumento({ situacao: '__proto__', loja: '../x' })).toMatchObject({ situacao: 'fila', lojaId: '' });
    expect(queryDosFiltrosDeDocumento({ lojaId: 'a', fornecedorId: '', situacao: 'todas', pagina: 2 })).toBe('loja=a&situacao=todas&pagina=2');
  });

  it('o fornecedor provisório leva só o que veio no XML (razão, fantasia, CNPJ, IE, endereço, UF); e-mail e WhatsApp ficam de fora', () => {
    const r = ler(FIXTURE);
    if (!r.ok) throw new Error('fixture');
    const p = dadosDoFornecedorProvisorio(r.nota.emitente);
    expect(p).toEqual({ nome: 'Laticínios Exemplo', razaoSocial: 'LATICINIOS EXEMPLO LTDA', documento: '11222333000181', inscricaoEstadual: '12345678', endereco: 'Rua das Flores, 100, Centro', municipio: 'Rio de Janeiro', uf: 'RJ', cep: '21020000' });
    expect(Object.keys(p)).not.toContain('email');
    expect(Object.keys(p)).not.toContain('whatsapp');
  });
});

describe('F.1b · do documento para a entrada da nota (o mesmo núcleo da nota digitada)', () => {
  const doc = { lojaId: 'l1', fornecedorId: 'f1', numero: '4521', serie: '1', vFreteCentavos: 3000, vNfCentavos: 58000 };
  const itens = [
    { nItem: 1, unidadeComercial: 'PC', qComMilesimos: 3000, liquidoCentavos: 14500 },
    { nItem: 2, unidadeComercial: 'CX', qComMilesimos: 2000, liquidoCentavos: 38000 },
    { nItem: 3, unidadeComercial: 'FD', qComMilesimos: 1000, liquidoCentavos: 2500 },
  ];
  const escolhas = [
    { nItem: 1, insumoId: 'muc', embalagem: 'v:peca', fator: '1' },
    { nItem: 2, insumoId: 'bac', embalagem: 'v:pac', fator: '10' },
    { nItem: 3, insumoId: 'gua', embalagem: 'v:fardo', fator: '1' },
  ];

  it('monta a entrada: embalagens = qCom × fator, valor = líquido, frete e total da nota, data como digitada', () => {
    const r = montarEntradaDaNota(doc, itens, escolhas, '22/10/2026');
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.montada.entrada).toEqual({
      lojaId: 'l1',
      fornecedorId: 'f1',
      numero: '4521',
      serie: '1',
      data: '22/10/2026',
      frete: '30,00',
      total: '580,00',
      itens: [
        { insumoId: 'muc', embalagem: 'v:peca', quantidade: '3', valor: '145,00' },
        { insumoId: 'bac', embalagem: 'v:pac', quantidade: '20', valor: '380,00' },
        { insumoId: 'gua', embalagem: 'v:fardo', quantidade: '1', valor: '25,00' },
      ],
    });
    expect(r.montada.itensDaLinha).toEqual([[1], [2], [3]]);
  });

  it('o mesmo insumo na mesma embalagem em dois itens vira UMA linha (quantidade e valor somam); o erro dela volta nos dois itens', () => {
    const r = montarEntradaDaNota(doc, itens, [escolhas[0], escolhas[1], { ...escolhas[2], insumoId: 'muc', embalagem: 'v:peca' }], '22/10/2026');
    if (!r.ok) throw new Error('era para montar');
    expect(r.montada.entrada.itens).toEqual([
      { insumoId: 'muc', embalagem: 'v:peca', quantidade: '4', valor: '170,00' },
      { insumoId: 'bac', embalagem: 'v:pac', quantidade: '20', valor: '380,00' },
    ]);
    expect(r.montada.itensDaLinha).toEqual([[1, 3], [2]]);
    expect(errosPorItemDoDocumento({ 'item-0': 'Quantidade fora da faixa.', total: 'x' }, r.montada.itensDaLinha)).toEqual({ 'item-1': 'Quantidade fora da faixa.', 'item-3': 'Quantidade fora da faixa.', total: 'x' });
  });

  it('item sem insumo ou com fator torto vira erro naquele item, sem montar nada', () => {
    expect(montarEntradaDaNota(doc, itens, [escolhas[0], { ...escolhas[1], insumoId: '' }, { ...escolhas[2], fator: 'dez' }], 'x')).toEqual({
      ok: false,
      erros: { 'item-2': 'Escolha o insumo deste item.', 'fator-3': 'Número inválido. Ex.: 1, 10 ou 0,5.' },
    });
  });

  it('frete zero fica vazio (a nota digitada trata vazio como zero)', () => {
    const r = montarEntradaDaNota({ ...doc, vFreteCentavos: 0, vNfCentavos: 55000 }, itens, escolhas, 'x');
    expect(r.ok && r.montada.entrada.frete).toBe('');
  });
});
