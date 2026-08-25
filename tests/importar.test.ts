import { describe, expect, it } from 'vitest';
import {
  COLUNAS,
  importarLinha,
  importarPlanilha,
  type EstadoImportacao,
  type LinhaPlanilha,
} from '@/lib/leds/importar';

const estadoLimpo = (): EstadoImportacao => ({ optOuts: new Set(), existentes: new Map() });
const OPTS = { lote: 'ZonaOeste-2026-08', somenteCelular: true };

const linha = (over: LinhaPlanilha = {}): LinhaPlanilha => ({
  Nome: 'Katsuo Culinaria Asiatica',
  Bairro: 'Campo Grande',
  Bloco: 'A',
  Categoria: 'Japones',
  Endereco: 'R. Irajuba, 1120',
  'Telefone/WhatsApp': '(21) 99445-8588',
  'Nota Google': '4,8',
  Avaliacoes: 2936,
  'Gap Digital (30)': '',
  Observacoes: '',
  ...over,
});

describe('contrato das colunas', () => {
  it('mantém os cabeçalhos exatos do montar_pacote.py', () => {
    expect(COLUNAS[0]).toBe('Tier');
    expect(COLUNAS).toContain('Score Base (0-70)');
    expect(COLUNAS).toContain('Telefone/WhatsApp');
    expect(COLUNAS).toContain('Gap Digital (30)');
    expect(COLUNAS).toContain('Score Final (100)');
    expect(COLUNAS.length).toBe(24);
  });
});

describe('importação — caminho feliz', () => {
  it('normaliza, pontua e classifica', () => {
    const r = importarLinha(linha(), estadoLimpo(), OPTS);
    expect(r.resultado).toBe('NOVO');
    expect(r.lead?.telefoneNormalizado).toBe('5521994458588');
    expect(r.lead?.tipoTelefone).toBe('CELULAR');
    expect(r.lead?.canal).toBe('WHATSAPP');
    // 2936 avaliações → 30; nota 4,8 ≥ 4,6 → +3 = 33. Celular 20. Bloco A 15.
    expect(r.lead?.capacidade).toBe(33);
    expect(r.lead?.acessoDecisor).toBe(20);
    expect(r.lead?.territorio).toBe(15);
    expect(r.lead?.scoreBase).toBe(68);
    expect(r.lead?.tier).toBe('T1');
  });

  it('lê nota em pt-BR e em formato americano', () => {
    expect(importarLinha(linha({ 'Nota Google': '4,8' }), estadoLimpo(), OPTS).lead?.nota).toBe(4.8);
    expect(importarLinha(linha({ 'Nota Google': '4.8' }), estadoLimpo(), OPTS).lead?.nota).toBe(4.8);
  });

  it('deixa scoreTotal nulo enquanto o Gap Digital não foi apurado', () => {
    const r = importarLinha(linha(), estadoLimpo(), OPTS);
    expect(r.lead?.gapDigital).toBeNull();
    expect(r.lead?.scoreTotal).toBeNull();
  });

  it('calcula o scoreTotal quando o Gap Digital chega', () => {
    const r = importarLinha(linha({ 'Gap Digital (30)': '25' }), estadoLimpo(), OPTS);
    expect(r.lead?.gapDigital).toBe(25);
    expect(r.lead?.scoreTotal).toBe(93);
  });
});

describe('importação — travas', () => {
  it('CONFLITO Bibi bloqueia na importação, não na tela', () => {
    const r = importarLinha(
      linha({ Nome: 'Acai da Praca', Categoria: 'Acai', Bairro: 'Tijuca' }),
      estadoLimpo(),
      OPTS,
    );
    expect(r.resultado).toBe('BLOQUEADO_CONFLITO');
    expect(r.lead?.status).toBe('CONFLITO');
    expect(r.motivo).toContain('Conflito de interesse');
  });

  it('conflito vence até quando o telefone é bom', () => {
    const r = importarLinha(
      linha({ Categoria: 'Sucos', Bairro: 'Botafogo' }),
      estadoLimpo(),
      OPTS,
    );
    expect(r.resultado).toBe('BLOQUEADO_CONFLITO');
  });

  it('OPT-OUT sobrevive à reimportação', () => {
    const estado = estadoLimpo();
    estado.optOuts.add('5521994458588');

    const r = importarLinha(linha(), estado, OPTS);

    expect(r.resultado).toBe('BLOQUEADO_OPT_OUT');
    expect(r.lead?.status).toBe('OPT_OUT');
  });

  it('opt-out continua valendo mesmo com o lead apagado do banco', () => {
    // `existentes` vazio = o lead não existe mais. O opt-out é por TELEFONE.
    const estado: EstadoImportacao = {
      optOuts: new Set(['5521994458588']),
      existentes: new Map(),
    };
    expect(importarLinha(linha(), estado, OPTS).resultado).toBe('BLOQUEADO_OPT_OUT');
  });

  it('opt-out casa apesar da formatação diferente na planilha', () => {
    const estado: EstadoImportacao = {
      optOuts: new Set(['5521994458588']),
      existentes: new Map(),
    };
    for (const t of ['+55 21 99445-8588', '21994458588', '(21) 99445.8588']) {
      expect(importarLinha(linha({ 'Telefone/WhatsApp': t }), estado, OPTS).resultado).toBe(
        'BLOQUEADO_OPT_OUT',
      );
    }
  });

  it('fixo sai da cadência e vai para Visita', () => {
    const r = importarLinha(linha({ 'Telefone/WhatsApp': '(21) 2555-1234' }), estadoLimpo(), OPTS);
    expect(r.resultado).toBe('SEM_TELEFONE');
    expect(r.lead?.canal).toBe('VISITA');
    expect(r.motivo).toContain('Visita / Instagram');
  });

  it('"SEM TELEFONE" não vira número', () => {
    const r = importarLinha(linha({ 'Telefone/WhatsApp': 'SEM TELEFONE' }), estadoLimpo(), OPTS);
    expect(r.resultado).toBe('SEM_TELEFONE');
    expect(r.lead?.telefoneNormalizado).toBeUndefined();
  });

  it('linha sem nome é inválida', () => {
    expect(importarLinha(linha({ Nome: '' }), estadoLimpo(), OPTS).resultado).toBe('INVALIDO');
  });
});

describe('reimportação', () => {
  it('lead já existente conta como ATUALIZADO, não como novo', () => {
    const estado = estadoLimpo();
    estado.existentes.set('5521994458588', 'lead-1');
    expect(importarLinha(linha(), estado, OPTS).resultado).toBe('ATUALIZADO');
  });

  it('a mesma linha repetida na planilha não vira dois leads', () => {
    const rel = importarPlanilha([linha(), linha()], estadoLimpo(), OPTS);
    expect(rel.novos).toBe(1);
    expect(rel.atualizados).toBe(1);
  });
});

describe('relatório', () => {
  it('conta por tier, bloco e canal, e junta os flagados', () => {
    const rel = importarPlanilha(
      [
        linha(),
        linha({ Nome: 'Pizza B', 'Telefone/WhatsApp': '(21) 98888-7777', Bloco: 'B', Avaliacoes: 120, 'Nota Google': '4,1', Categoria: 'Pizzaria' }),
        linha({ Nome: 'Acai Tijuca', Categoria: 'Acai', Bairro: 'Tijuca', 'Telefone/WhatsApp': '(21) 97777-6666' }),
        linha({ Nome: 'Fixo C', 'Telefone/WhatsApp': '(21) 2555-1234' }),
        linha({ Nome: 'Flagado D', 'Telefone/WhatsApp': '(21) 96666-5555', Observacoes: 'validar endereco' }),
      ],
      estadoLimpo(),
      OPTS,
    );

    expect(rel.total).toBe(5);
    expect(rel.bloqueadosConflito).toBe(1);
    expect(rel.semTelefone).toBe(1);
    expect(rel.novos).toBe(3);
    expect(rel.comCelular).toBe(4);
    expect(rel.porBloco['A']).toBeGreaterThan(0);
    expect(rel.flagados).toContain('Flagado D');
  });
});
