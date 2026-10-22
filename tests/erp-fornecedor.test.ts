/**
 * ERP F.1a · cadastro do fornecedor evoluído e CNPJ da loja — a parte PURA (sem banco, sem Next).
 *
 * Critérios da F.1a conferidos aqui: 1 (sem e-mail ou sem WhatsApp = recusa), 2 (CNPJ com dígito errado), 3 (WhatsApp sem DDD recusa e
 * com DDD grava só os dígitos), 4 (Compras sem nota fiscal só pede nome e WhatsApp), 8 (UF "XX" recusa; IE "ISENTO" grava) e o CNPJ da
 * loja (validado). O resto (duplicidade, migração, idempotência, isolamento, permissões) está nos testes com banco.
 *
 *   npx vitest run tests/erp-fornecedor.test.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cnpjValido,
  documentoAConferir,
  emailValido,
  faltaNoCadastro,
  formatarCep,
  formatarWhatsapp,
  lerCnpjDaLoja,
  lerFormFornecedor,
  normalizarInscricao,
  normalizarWhatsapp,
  raizDoCnpj,
  retratoDoFornecedor,
  UFS,
} from '@/lib/erp/compra-campos';
import { caminhoDeVolta, voltaComFornecedor } from '@/lib/erp/volta';
import { documentoParaSaida } from '../scripts/erp-conferir-migracao';

const COMPLETO = {
  nome: 'Laticínios Exemplo',
  razaoSocial: 'Laticínios Exemplo Ltda',
  documento: '11.222.333/0001-81',
  email: 'vendas@exemplo.com.br',
  whatsapp: '(21) 99641-6060',
};

const lido = (entrada: Record<string, unknown>) => lerFormFornecedor(entrada);
const erros = (entrada: Record<string, unknown>) => {
  const r = lido(entrada);
  return r.ok ? {} : r.erros;
};

describe('F.1a · o formulário do fornecedor', () => {
  it('o cadastro completo vira dados normalizados (documento e WhatsApp só em dígitos, e-mail em minúsculo)', () => {
    const r = lido({ ...COMPLETO, email: ' Vendas@Exemplo.com.br ', inscricaoEstadual: '12.345.678', endereco: ' Rua  A,  10 ', municipio: 'Rio de Janeiro', uf: 'rj', cep: '21020-000', contatoComercial: 'Seu Jorge', prazoPagamentoDias: '28' });
    expect(r).toEqual({
      ok: true,
      dados: {
        nome: 'Laticínios Exemplo',
        razaoSocial: 'Laticínios Exemplo Ltda',
        documento: '11222333000181',
        inscricaoEstadual: '12345678',
        endereco: 'Rua A, 10',
        municipio: 'Rio de Janeiro',
        uf: 'RJ',
        cep: '21020000',
        email: 'vendas@exemplo.com.br',
        whatsapp: '21996416060',
        contatoComercial: 'Seu Jorge',
        prazoPagamentoDias: 28,
        semNotaFiscal: false,
      },
    });
  });

  it('critério 1: sem e-mail ou sem WhatsApp não salva, e cada falta volta no campo dela', () => {
    expect(erros({ ...COMPLETO, email: '' })).toEqual({ email: expect.stringMatching(/e-mail/) });
    expect(erros({ ...COMPLETO, whatsapp: '' })).toEqual({ whatsapp: expect.stringMatching(/WhatsApp com DDD/) });
    expect(Object.keys(erros({ nome: 'Laticínios Exemplo' })).sort()).toEqual(['documento', 'email', 'razaoSocial', 'whatsapp']);
    expect(erros({ ...COMPLETO, razaoSocial: '  ' })).toEqual({ razaoSocial: expect.stringMatching(/razão social/) });
    expect(erros({ ...COMPLETO, nome: '' })).toMatchObject({ nome: expect.any(String) });
  });

  it('critério 2: CNPJ com dígito verificador errado, número torto e sequência repetida são recusados', () => {
    expect(erros({ ...COMPLETO, documento: '11.222.333/0001-82' })).toEqual({ documento: 'CNPJ ou CPF inválido. Confira os números.' });
    expect(erros({ ...COMPLETO, documento: '123' }).documento).toMatch(/inválido/);
    expect(erros({ ...COMPLETO, documento: '00000000000000' }).documento).toMatch(/inválido/);
    // CPF válido passa (produtor rural, autônomo).
    expect(lido({ ...COMPLETO, documento: '529.982.247-25' })).toMatchObject({ ok: true, dados: { documento: '52998224725' } });
  });

  it('critério 3: WhatsApp sem DDD é recusado; com DDD guarda só os dígitos, sem o 55', () => {
    expect(erros({ ...COMPLETO, whatsapp: '99641-6060' }).whatsapp).toMatch(/DDD/);
    expect(lido({ ...COMPLETO, whatsapp: '(21) 99641-6060' })).toMatchObject({ ok: true, dados: { whatsapp: '21996416060' } });
    expect(lido({ ...COMPLETO, whatsapp: '+55 21 99641-6060' })).toMatchObject({ ok: true, dados: { whatsapp: '21996416060' } });
    expect(lido({ ...COMPLETO, whatsapp: '5521996416060' })).toMatchObject({ ok: true, dados: { whatsapp: '21996416060' } });
  });

  it('polimento: letra no CNPJ/CPF ou no WhatsApp é recusada, não descartada em silêncio', () => {
    expect(erros({ ...COMPLETO, documento: '11.222.333/0001-81 matriz' }).documento).toMatch(/inválido/);
    expect(erros({ ...COMPLETO, documento: 'A11222333000181' }).documento).toMatch(/inválido/);
    expect(erros({ ...COMPLETO, whatsapp: '(21) 99641-6060 ramal 2' }).whatsapp).toMatch(/inválido/);
    expect(erros({ ...COMPLETO, whatsapp: '2199641x6060' }).whatsapp).toMatch(/inválido/);
    expect(lido({ ...COMPLETO, documento: ' 11 222 333/0001-81 ', whatsapp: '+55 (21) 99641-6060' }).ok).toBe(true);
  });

  it('critério 4: "Compras sem nota fiscal" salva só com nome e WhatsApp; o resto vale se vier', () => {
    expect(lido({ nome: 'Feira do Seu Zé', semNotaFiscal: 'on', whatsapp: '(21) 99641-6060' })).toEqual({
      ok: true,
      dados: {
        nome: 'Feira do Seu Zé',
        razaoSocial: null,
        documento: null,
        inscricaoEstadual: null,
        endereco: null,
        municipio: null,
        uf: null,
        cep: null,
        email: null,
        whatsapp: '21996416060',
        contatoComercial: null,
        prazoPagamentoDias: null,
        semNotaFiscal: true,
      },
    });
    // O WhatsApp continua obrigatório; e o documento, se vier, continua conferido.
    expect(erros({ nome: 'Feira', semNotaFiscal: 'on' })).toEqual({ whatsapp: expect.stringMatching(/WhatsApp/) });
    expect(erros({ nome: 'Feira', semNotaFiscal: 'on', whatsapp: '(21) 99641-6060', documento: '11.222.333/0001-82' }).documento).toMatch(/inválido/);
  });

  it('critério 8: UF fora das 27 siglas é recusada; IE aceita ISENTO e números, e recusa o resto', () => {
    expect(erros({ ...COMPLETO, uf: 'XX' }).uf).toMatch(/UF inválida/);
    expect(UFS).toHaveLength(27);
    expect(lido({ ...COMPLETO, inscricaoEstadual: 'isento' })).toMatchObject({ ok: true, dados: { inscricaoEstadual: 'ISENTO' } });
    expect(lido({ ...COMPLETO, inscricaoEstadual: '77.123.456-7' })).toMatchObject({ ok: true, dados: { inscricaoEstadual: '771234567' } });
    expect(erros({ ...COMPLETO, inscricaoEstadual: '1' }).inscricaoEstadual).toMatch(/Inscrição estadual inválida/);
    expect(erros({ ...COMPLETO, inscricaoEstadual: 'ABC123' }).inscricaoEstadual).toMatch(/inválida/);
    expect(erros({ ...COMPLETO, inscricaoEstadual: '123456789012345' }).inscricaoEstadual).toMatch(/inválida/);
  });

  it('CEP, e-mail e prazo: formato e faixa', () => {
    expect(erros({ ...COMPLETO, cep: '123' }).cep).toMatch(/CEP inválido/);
    expect(erros({ ...COMPLETO, cep: 'abc21020000' }).cep).toMatch(/CEP inválido/);
    expect(erros({ ...COMPLETO, email: 'sem-arroba' }).email).toMatch(/E-mail inválido/);
    expect(erros({ ...COMPLETO, email: 'a@b' }).email).toMatch(/E-mail inválido/);
    expect(erros({ ...COMPLETO, email: 'a b@c.com' }).email).toMatch(/E-mail inválido/);
    expect(lido({ ...COMPLETO, prazoPagamentoDias: '0' })).toMatchObject({ ok: true, dados: { prazoPagamentoDias: 0 } });
    expect(lido({ ...COMPLETO, prazoPagamentoDias: '180' })).toMatchObject({ ok: true, dados: { prazoPagamentoDias: 180 } });
    for (const ruim of ['181', '-1', '1,5', '28 dias', '1e2', '١٢']) expect(erros({ ...COMPLETO, prazoPagamentoDias: ruim }).prazoPagamentoDias, ruim).toMatch(/0 a 180/);
    expect(lido({ ...COMPLETO, prazoPagamentoDias: '' })).toMatchObject({ ok: true, dados: { prazoPagamentoDias: null } });
  });

  it('o nome vem em NFC, sem invisíveis e com espaços colapsados; textos acima do teto são recusados', () => {
    const decomposto = 'Laticínios'.normalize('NFD');
    const r = lido({ ...COMPLETO, nome: `  ${decomposto}​  Exemplo­ `, razaoSocial: `Ltda​  Exemplo` });
    expect(r).toMatchObject({ ok: true, dados: { nome: 'Laticínios Exemplo'.normalize('NFC'), razaoSocial: 'Ltda Exemplo' } });
    if (r.ok) expect(r.dados.nome).toBe(r.dados.nome.normalize('NFC'));
    expect(erros({ ...COMPLETO, razaoSocial: 'x'.repeat(121) }).razaoSocial).toMatch(/longo demais/);
    expect(erros({ ...COMPLETO, endereco: 'x'.repeat(201) }).endereco).toMatch(/longo demais/);
    expect(erros({ ...COMPLETO, municipio: 'x'.repeat(61) }).municipio).toMatch(/longo demais/);
    expect(erros({ ...COMPLETO, contatoComercial: 'x'.repeat(81) }).contatoComercial).toMatch(/longo demais/);
    expect(erros({ ...COMPLETO, nome: 'x'.repeat(81) }).nome).toMatch(/longo demais/);
  });

  it('entrada que não é texto não derruba nada', () => {
    expect(lido({ nome: 123, documento: { a: 1 }, whatsapp: ['x'], email: null }).ok).toBe(false);
  });
});

describe('F.1a · WhatsApp, inscrição e e-mail (as peças)', () => {
  it('WhatsApp: DDD que existe, celular com 9, fixo com 10, o 55 do país sai', () => {
    const casos: [string, string | null][] = [
      ['(21) 99641-6060', '21996416060'],
      ['21 2222-3333', '2122223333'],
      ['+55 (11) 98888-7777', '11988887777'],
      ['0 21 99641-6060', null],
      ['(00) 99641-6060', null],
      ['(10) 99641-6060', null],
      ['(21) 89641-6060', null],
      ['(21) 9641-606', null],
      ['996416060', null],
      ['', null],
      ['abc', null],
      ['(55) 99641-6060', '55996416060'],
      ['+55 (55) 99641-6060', '55996416060'],
    ];
    for (const [entrada, esperado] of casos) expect(normalizarWhatsapp(entrada), entrada).toBe(esperado);
    expect(formatarWhatsapp('21996416060')).toBe('(21) 99641-6060');
    expect(formatarWhatsapp('2122223333')).toBe('(21) 2222-3333');
    expect(formatarWhatsapp(null)).toBeNull();
  });

  it('inscrição: ISENTO/ISENTA ou 2 a 14 dígitos; letras e tamanhos fora, não', () => {
    expect(normalizarInscricao('ISENTA')).toBe('ISENTO');
    expect(normalizarInscricao(' 12.345.678/9 ')).toBe('123456789');
    expect(normalizarInscricao('1')).toBeNull();
    expect(normalizarInscricao('12A45')).toBeNull();
  });

  it('e-mail e CEP', () => {
    expect(emailValido('vendas@fornecedor.com.br')).toBe(true);
    expect(emailValido('vendas@fornecedor')).toBe(false);
    expect(emailValido('@x.com')).toBe(false);
    expect(emailValido(`${'a'.repeat(120)}@x.com`)).toBe(false);
    expect(formatarCep('21020000')).toBe('21020-000');
    expect(formatarCep(null)).toBeNull();
  });
});

describe('F.1a · o que falta no cadastro (uma regra só)', () => {
  const vazio = { razaoSocial: null, documento: null, email: null, whatsapp: null, semNotaFiscal: false };
  it('o antigo só com nome falta quatro coisas; sem nota fiscal só falta o WhatsApp', () => {
    expect(faltaNoCadastro(vazio)).toEqual(['razão social', 'CNPJ ou CPF', 'e-mail', 'WhatsApp']);
    expect(faltaNoCadastro({ ...vazio, semNotaFiscal: true })).toEqual(['WhatsApp']);
    expect(faltaNoCadastro({ razaoSocial: 'X', documento: '11222333000181', email: 'a@b.com', whatsapp: '21996416060', semNotaFiscal: false })).toEqual([]);
    expect(faltaNoCadastro({ ...vazio, semNotaFiscal: true, whatsapp: '21996416060' })).toEqual([]);
  });

  it('documento gravado que não passa nos dígitos verificadores pede conferência', () => {
    expect(documentoAConferir('11222333000182')).toBe(true);
    expect(documentoAConferir('123')).toBe(true);
    expect(documentoAConferir('11222333000181')).toBe(false);
    expect(documentoAConferir(null)).toBe(false);
  });
});

describe('F.1a · o conferidor da migração não imprime CPF inteiro', () => {
  it('CPF sai mascarado, CNPJ (empresa) sai inteiro', () => {
    expect(documentoParaSaida('52998224725')).toBe('***.982.247-**');
    expect(documentoParaSaida('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('F.1a · CNPJ (fornecedor, filial e loja)', () => {
  it('matriz, filial e loja do roteiro têm dígitos verificadores certos; CPF não é CNPJ', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000262')).toBe(true);
    expect(cnpjValido('11444777000161')).toBe(true);
    expect(cnpjValido('11444777000243')).toBe(false);
    expect(cnpjValido('52998224725')).toBe(false);
  });

  it('a filial tem a mesma raiz e outro CNPJ; CPF não tem raiz', () => {
    expect(raizDoCnpj('11222333000181')).toBe('11222333');
    expect(raizDoCnpj('11222333000262')).toBe('11222333');
    expect(raizDoCnpj('11222333000181')).not.toBe(raizDoCnpj('11444777000161'));
    expect(raizDoCnpj('52998224725')).toBeNull();
    expect(raizDoCnpj(null)).toBeNull();
  });

  it('critério 10 (a parte pura): o CNPJ da loja é validado, vazio limpa e CPF é recusado', () => {
    expect(lerCnpjDaLoja('11.444.777/0001-61')).toEqual({ ok: true, cnpj: '11444777000161' });
    expect(lerCnpjDaLoja('  ')).toEqual({ ok: true, cnpj: null });
    expect(lerCnpjDaLoja('11.444.777/0001-62')).toMatchObject({ ok: false, erro: expect.stringMatching(/CNPJ inválido/) });
    expect(lerCnpjDaLoja('529.982.247-25')).toMatchObject({ ok: false });
    expect(lerCnpjDaLoja('11444777000161abc')).toMatchObject({ ok: false });
  });
});

describe('F.1a · o retrato do histórico', () => {
  it('leva os números como a pessoa os lê e o estado do cadastro', () => {
    const r = lido(COMPLETO);
    if (!r.ok) throw new Error('lido');
    expect(retratoDoFornecedor({ ...r.dados, situacaoCadastro: 'COMPLETO' })).toMatchObject({
      nome: 'Laticínios Exemplo',
      documento: '11.222.333/0001-81',
      whatsapp: '(21) 99641-6060',
      email: 'vendas@exemplo.com.br',
      prazoPagamento: null,
      semNotaFiscal: 'não',
      cadastro: 'completo',
    });
    expect(retratoDoFornecedor({ ...r.dados, prazoPagamentoDias: 1, situacaoCadastro: 'A_COMPLETAR' })).toMatchObject({ prazoPagamento: '1 dia', cadastro: 'a completar' });
  });
});

describe('F.1a · "Fornecedor novo: cadastrar" volta para a nota, e só para dentro da área do ERP', () => {
  it('a volta aceita a nota e recusa o que sai da área ou volta ao próprio cadastro', () => {
    expect(caminhoDeVolta('/erp/compras/nova', '/erp/')).toBe('/erp/compras/nova');
    expect(caminhoDeVolta('/rodolfo/erp/casa/compras/nova', '/rodolfo/erp/casa/')).toBe('/rodolfo/erp/casa/compras/nova');
    expect(caminhoDeVolta('https://outro.site/erp/x', '/erp/')).toBeNull();
    expect(caminhoDeVolta('//outro.site', '/erp/')).toBeNull();
    expect(caminhoDeVolta('/erp/compras/fornecedores/novo', '/erp/')).toBeNull();
    expect(caminhoDeVolta('/erp/compras/fornecedores/novo?volta=/erp/compras/nova', '/erp/')).toBeNull();
    expect(voltaComFornecedor('/erp/compras/nova', 'abc')).toBe('/erp/compras/nova?fornecedorCriado=abc');
    // O parâmetro do fornecedor anterior não se acumula.
    expect(caminhoDeVolta('/erp/compras/nova?fornecedorCriado=x&insumoCriado=y', '/erp/')).toBe('/erp/compras/nova');
  });
});

describe('F.1a · os contatos NUNCA recebem mensagem automática (teste-guarda)', () => {
  const RAIZ = process.cwd();
  const arquivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  // O código do fornecedor e das compras: regra, telas e actions das duas árvores.
  const alvo = [
    ...arquivos(join(RAIZ, 'src/lib/erp')).filter((p) => /\/(compras|compra-campos|compras-custo|estrutura)\.ts$/.test(p)),
    ...arquivos(join(RAIZ, 'src/components/erp/telas/compras')),
    ...arquivos(join(RAIZ, 'src/components/erp/telas/estrutura')),
    ...arquivos(join(RAIZ, 'src/app/erp/compras')),
    ...arquivos(join(RAIZ, 'src/app/rodolfo/(painel)/erp/[slug]/compras')),
  ];

  it('há arquivos para vigiar', () => {
    expect(alvo.length).toBeGreaterThan(15);
  });

  it('nenhum importa Evolution/WhatsApp/e-mail/fetch nem monta link de conversa', () => {
    const proibido = /evolution|wa\.me|api\.whatsapp|whatsapp-web|baileys|nodemailer|sendgrid|resend|mailto:|\bfetch\s*\(|XMLHttpRequest|sendMessage|enviarMensagem|twilio/i;
    const achados = alvo.filter((p) => proibido.test(readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
    expect(achados).toEqual([]);
  });
});
