#!/usr/bin/env node
/**
 * Portão de conteúdo do site atual (F1 do Caminho 1).
 *
 * Falha com código 1 se qualquer termo proibido voltar ao código-fonte. Existe porque
 * build e teste de tipo não enxergam credibilidade: "1000+" compila igualzinho a "100+".
 *
 * Uso: node scripts/gate-conteudo.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** `regex` quando a busca literal daria falso positivo dentro de outra palavra. */
const PROIBIDOS = [
  { termo: '1000+', motivo: 'número sem prova; o conservador é 100+' },
  { termo: 'calendário cheio', motivo: 'escassez inventada' },
  { termo: 'Vagas limitadas', motivo: 'escassez inventada' },
  { termo: 'gmail', motivo: 'e-mail pessoal como contato comercial' },
  { termo: 'chão de fábrica', motivo: 'restaurante não tem chão de fábrica' },
  { termo: 'Equipe FlowFoods', motivo: 'a FlowFoods é solo, sem sócios' },
  { regex: /\be outros\b/, rotulo: 'e outros', motivo: 'sugere carteira que não está listada' },
  { termo: 'Agendar Consultoria', motivo: 'a oferta de entrada é o diagnóstico gratuito' },
  { termo: 'flowfoods.rj', motivo: 'handle errado; o certo é @rrodolfoac' },
  { termo: '50+', motivo: 'número sem prova' },
  { termo: '360°', motivo: 'posicionamento antigo' },
  { termo: 'garantido', motivo: 'promessa de resultado' },
];

const arquivos = [];
(function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) varrer(caminho);
    else if (/\.(tsx?|mdx?)$/.test(nome)) arquivos.push(caminho);
  }
})('src');

let falhas = 0;
for (const arquivo of arquivos) {
  const linhas = readFileSync(arquivo, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    for (const p of PROIBIDOS) {
      const bateu = p.regex ? p.regex.test(linha) : linha.includes(p.termo);
      if (!bateu) continue;
      falhas++;
      console.error(
        `  ${arquivo}:${i + 1}  "${p.rotulo ?? p.termo}" — ${p.motivo}\n    ${linha.trim().slice(0, 110)}`,
      );
    }
  });
}

if (falhas > 0) {
  console.error(`\n  ${falhas} ocorrência(s) de conteúdo proibido.\n`);
  process.exit(1);
}
console.log(`  Portão de conteúdo limpo — ${arquivos.length} arquivos varridos.`);
