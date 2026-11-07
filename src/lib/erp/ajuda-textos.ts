/**
 * Ajuda contextual (0.6) — SÓ texto. Uma entrada por tela (ou por telas que
 * se explicam do mesmo jeito: novo e editar). Chave = rota relativa à base.
 *
 * Como mexer (regra da casa, toda subfase):
 *  - tela nova ou rota nova: entrada nova aqui, no MESMO diff (o teste reprova rota sem ajuda);
 *  - função da tela mudou: ajuste o texto E suba a `versao` da entrada, depois rode
 *    `npm run ajuda:lock`. A caixa volta, com "MUDOU", para quem já tinha fechado;
 *  - texto curto, carioca, sem jargão: "a conta é refeita na hora de salvar", nunca "o servidor refaz";
 *  - sem "!", sem emoji, sem HTML, sem markdown. Até 320 caracteres por bloco; 1 a 4 frases para todos.
 *
 * `para` = quem tem QUALQUER uma dessas permissões lê o bloco (o operador não lê sobre preço).
 * É conforto: a permissão de verdade é decidida na página.
 */

import type { EntradaDeAjuda } from './ajuda';

export const ENTRADAS: EntradaDeAjuda[] = [
  {
    chave: 'inicio',
    area: 'inicio',
    rotas: [''],
    titulo: 'Visão geral da operação',
    versao: 12,
    aula: [
      { texto: 'Escolha uma loja no alto para ver seus indicadores, a evolução do faturamento e os pontos de atenção. Cada número informa a loja e o período a que se refere.' },
      { texto: 'Sem dados não é zero: o painel avisa sobre ausências e falhas, e Atualizar resumo tenta carregar de novo.' },
      { texto: 'Só aparece o que o seu acesso libera: em Rede Completa, veja o resumo da rede e as áreas disponíveis; na visão de uma loja, use o menu para abrir as áreas.' },
      { texto: 'No CMV, a comparação usa a meta e a régua do DRE do mesmo período; se faltar base, o motivo aparece no lugar da cor.', para: ['dre.ver'] },
    ],
    secoes: [
      {
        id: 'faturamento-totais',
        titulo: 'Pedidos, atendimentos e ticket',
        blocos: [
          { texto: 'Pedidos, atendimentos e ticket vêm dos mesmos lançamentos do faturamento do mês.', para: ['faturamento.ver'] },
          { texto: 'Atendimentos não são pessoas únicas; se faltarem lançamentos, a leitura fica parcial.', para: ['faturamento.ver'] },
          { texto: 'Se algum dia e canal continua sem informação de atendimentos, esse total fica Sem dado. Receita, pedidos e ticket continuam disponíveis.', para: ['faturamento.ver'] },
          { texto: 'Em um lançamento marcado Não vendeu, pedidos e atendimentos são zero e não há base para o ticket; isso é diferente de não lançar.', para: ['faturamento.ver'] },
        ],
      },
      {
        id: 'compras-categorias',
        titulo: 'Compras por categoria atual',
        blocos: [
          { texto: 'A composição de Compras reúne itens e frete das notas lançadas, pela data de entrada, no mesmo recorte do indicador.', para: ['compras.ver'] },
          { texto: 'Ela usa a categoria atual do insumo; mudar o cadastro pode redistribuir compras antigas.', para: ['compras.ver'] },
          { texto: 'Abra o relatório para conferir os valores de cada grupo e o que está reunido em Outros.', para: ['compras.ver'] },
        ],
      },
      {
        id: 'despesas-da-loja',
        titulo: 'Despesas da loja',
        blocos: [
          { texto: 'O card de Despesas soma as despesas da loja pelo período a que elas se referem, com os mesmos valores do DRE da loja no mesmo período. CMV e deduções da venda ficam fora.', para: ['dre.ver'] },
          { texto: 'Uma despesa de vários dias entra só com os dias deste período e, no período em curso, até ontem. Por isso o valor fica parcial até o fim do período.', para: ['dre.ver'] },
          { texto: 'Grupo sem lançamento aparece com traço, não como zero. A despesa da rede, sem loja, fica fora do card da loja. Período fechado vem da fotografia do fechamento.', para: ['dre.ver'] },
          { texto: 'Cada grupo mostra as linhas do DRE que têm valor. Conferir este valor abre as despesas que formam a linha, na mesma loja e no mesmo período, e Voltar para o início traz você de volta. No período fechado esse atalho não aparece, porque a fotografia não muda e as despesas podem mudar.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'pontos-de-atencao',
        titulo: 'Pontos de atenção',
        blocos: [
          { texto: 'Os pontos de atenção ficam em dois grupos: Completar dados, quando algo já aconteceu e falta registrar, e Resolver operação, quando falta fazer algo na casa. O grupo não diz o que é mais urgente.' },
          { texto: 'Lançamentos faltando contam um para cada canal que a loja vende, em cada dia sem lançamento. O atalho abre o faturamento do mês da falta, na loja escolhida no alto ou na rede, e Voltar para o início traz você de volta.', para: ['faturamento.ver'] },
          { texto: 'Abrir, voltar ou só olhar não tira o ponto da lista: ele sai quando a nova consulta ao faturamento não encontrar mais falta. O mês anterior aparece à parte enquanto tiver falta e ainda aceitar lançamento.', para: ['faturamento.ver'] },
          { texto: 'Se a consulta ao faturamento falhar, o ponto aparece como não conferido, sem número. Isso não quer dizer que o mês esteja completo.', para: ['faturamento.ver'] },
        ],
      },
      {
        id: 'xml-conferencia',
        titulo: 'XML aguardando conferência',
        blocos: [
          { texto: 'Na visão de uma loja, os pontos de atenção contam os XML atribuídos a ela aguardando conferência, sem recorte mensal. Documentos sem loja atribuída ficam fora dessa contagem.', para: ['compras.ver'] },
          { texto: 'XML recebido ainda não é compra lançada: não entra em Compras, estoque nem CMV. O atalho abre a fila de notas da loja, que também pode incluir recebidas ou com erro.', para: ['compras.ver'] },
          { texto: 'Zero vale só para XML aguardando conferência; não significa fila vazia. Se a consulta falhar, a contagem fica indisponível. Atualizar resumo consulta de novo, sem afirmar quando os documentos mudaram.', para: ['compras.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'acesso',
    area: 'rede',
    rotas: ['acesso'],
    titulo: 'Seu acesso',
    versao: 2,
    aula: [
      { texto: 'Aqui estão os seus dados, o que você pode fazer no ERP e a entrada pelo rosto no celular.' },
      { texto: 'Trocou de aparelho? Ative o rosto de novo nele. Senha esquecida: fale com a FlowFoods.' },
    ],
    secoes: [
      {
        id: 'dicas',
        titulo: 'As dicas de cada tela',
        blocos: [
          { texto: 'Logo abaixo do título de cada tela fica a linha Como funciona esta tela: ela abre um card com a explicação, sem tirar você do que estava fazendo.' },
          { texto: 'Na primeira visita o card abre sozinho e volta uma vez por semana. O X fecha agora; Não mostrar novamente faz ele parar de abrir sozinho, a não ser que o texto mude.' },
          { texto: 'No quadro Dicas, desta tela, você liga e desliga as dicas ou pede para ver de novo as que dispensou. O botão ? no alto continua sempre à mão.' },
        ],
      },
    ],
  },
  {
    chave: 'insumos',
    area: 'cadastros',
    rotas: ['insumos'],
    titulo: 'Insumos',
    versao: 5,
    // L.1: a caixa nasce recolhida (uma linha "Como funciona"): no celular a lista e os filtros ficam na primeira dobra.
    recolhida: true,
    aula: [
      { texto: 'Tudo o que a casa compra e usa: ingrediente, embalagem, material de limpeza e uso e pré-preparo.' },
      { texto: 'Antes da primeira compra vale o custo inicial de referência; depois, o último preço da nota lançada.' },
      { texto: '“Custo não informado” quer dizer que falta o custo e que as fichas que usam o insumo ficam incompletas.' },
      { texto: 'Os filtros se combinam e os que estão valendo aparecem abaixo, cada um com o seu X; em “No cadastro” está tudo o que a casa tem e em “Nesta lista” só o que sobrou, com 10, 25, 50 ou 100 itens por página; o botão Categorias abre um painel com quantos insumos há em cada uma, sem perder os filtros.' },
      { texto: 'A caneta edita e volta para esta mesma página; a lixeira mostra o que está ligado ao insumo antes de qualquer coisa.', para: ['insumos.editar'] },
      { texto: 'Marque vários insumos desta página para mudar a categoria deles de uma vez; o resumo aparece antes de confirmar.', para: ['insumos.editar'] },
      { texto: 'Cadastre do jeito que você compra: a caixa de 5 kg, não o grama.', para: ['insumos.editar'] },
    ],
    secoes: [
      {
        id: 'incompleto',
        titulo: 'Cadastro incompleto',
        blocos: [
          { texto: 'Aparece quando falta a categoria, quando ela é “Outros / a classificar”, quando a conservação está a confirmar ou, no pré-preparo, quando a ficha não diz a validade. Cada insumo diz o motivo na própria linha.' },
          { texto: 'Custo não informado é outra coisa: tem o seu filtro, “Só sem custo”. A unidade base é obrigatória, então nenhum insumo fica sem ela.' },
        ],
      },
      {
        id: 'conservacao',
        titulo: 'Conservação a confirmar',
        blocos: [
          { texto: 'Antes, o sistema assumia Seco quando ninguém escolhia a conservação. O que ficou em Seco, em Proteína, Laticínios ou Hortifruti, aparece como “a confirmar”.' },
          { texto: 'Nada foi mudado. Abra o insumo: se for outra conservação, troque em Editar; se for mesmo seco, confirme.', para: ['insumos.editar'] },
        ],
      },
    ],
  },
  {
    chave: 'insumo-novo',
    area: 'cadastros',
    rotas: ['insumos/novo', 'insumos/[id]/editar'],
    titulo: 'Cadastrar insumo',
    versao: 8,
    aula: [
      { texto: 'O nome do insumo se digita uma vez só; quem veio de uma nota ou ficha volta para lá ao salvar, e quem veio da caneta da lista volta para a mesma página dela.' },
      { texto: 'Nome, categoria, conservação e unidade base são obrigatórios; o que faltar aparece junto do campo.' },
      { texto: 'Tipo é o papel do item, categoria é a natureza dele para o CMV e conservação é onde ele fica guardado.' },
      { texto: 'O custo inicial de referência vale até a primeira compra lançada e não cria nota nem despesa.' },
    ],
    secoes: [
      {
        id: 'campos',
        titulo: 'Campo a campo',
        blocos: [
          { texto: 'A conservação não vem escolhida: “Selecione a conservação” é só a orientação e não se salva. Coxa de frango é Proteína, congelada ou não.' },
          { texto: 'Prazo de uso após abertura é opcional, em horas ou dias: quanto o produto dura depois de aberto. Não é o vencimento do lote; em branco, fica “não informado”.' },
          { texto: 'Unidade base é como você controla (kg, L ou un); embalagem de compra é quanto vem em cada uma; o custo inicial é o que você paga por ela.' },
          { texto: 'Sem custo ainda, marque “Ainda não sei o custo”: o insumo fica com “Custo não informado” e as fichas dele, incompletas, até haver custo ou compra.' },
          { texto: 'A marca de referência é opcional: não trava compra nem cotação e não é o fornecedor.' },
          { texto: 'Veio de uma nota ou ficha? O que você tinha preenchido lá é recuperado na volta. Salvou, a tela confirma com o nome, e um toque repetido não cria outro.' },
        ],
      },
      {
        // Decisão 480: os exemplos do "Complemento educacional — unidade, embalagem e custo" (Rodolfo, 25/10/2026), no lugar
        // do texto fixo do formulário. Os valores em R$ são demonstração, só para quem vê custo.
        id: 'exemplos',
        titulo: 'Entenda com exemplos',
        blocos: [
          { texto: 'Aipim: comprou em saco e usa por peso na receita? O saco é a embalagem; kg e g são o peso que você usa. Confira quanto vem no saco.' },
          { texto: 'Exemplo do aipim, só para treinar: se forem 6 sacos de 1 kg por R$ 68,34, são 6 kg e R$ 11,39 por kg. No cadastro vai UMA embalagem: 1 kg por R$ 11,39.', para: ['compras.ver'] },
          { texto: 'Margarina: comprou em pote e usa em gramas? Confira o peso líquido do pote no rótulo. O preço do pote não é o preço do quilo.' },
          { texto: 'Exemplo da margarina: R$ 56,28 por 12 potes dá R$ 4,69 por pote. Sem o peso de cada pote, esse valor não diz o custo por kg.', para: ['compras.ver'] },
          { texto: 'Refrigerante: se você vende ou usa a lata ou a garrafa inteira, conte por unidade. Se usa só uma parte do líquido na receita, a medida é de volume, em L ou ml.' },
          { texto: 'Não sabe o peso ou o volume? Confira o rótulo ou consulte o fornecedor; não estime. 1 kg são 1.000 g e 1 L são 1.000 ml, e kg não é o mesmo que L. Se o peso de cada saco ou pote varia, confirme o conteúdo de cada um.' },
        ],
      },
    ],
    pontos: [
      {
        id: 'tipo',
        titulo: 'Tipo, categoria e conservação',
        blocos: [{ texto: 'Tipo é o papel do item; categoria é a natureza dele para o CMV; conservação é onde ele fica guardado. Coxa de frango é Proteína, congelada ou não.' }],
        secao: 'campos',
      },
      {
        id: 'marca',
        titulo: 'Marca de referência',
        blocos: [{ texto: 'É a marca comercial que você costuma comprar. Só informa: não trava compra nem cotação e não é o fornecedor, porque a mesma marca pode vir de vários.' }],
      },
      {
        id: 'conservacao',
        titulo: 'Conservação principal',
        blocos: [{ texto: 'Onde o insumo fica guardado normalmente. Não é a categoria: coxa de frango é Proteína, congelada ou não.' }],
        secao: 'campos',
      },
      {
        id: 'prazo-abertura',
        titulo: 'Prazo de uso após abertura',
        blocos: [
          { texto: 'Prazo para consumir depois de abrir a embalagem, conforme o fabricante e o procedimento validado da operação. Marque só onde o insumo pode ficar; em branco, fica “não informado”. O vencimento do lote entra no recebimento da compra e nas etiquetas.' },
        ],
        secao: 'campos',
      },
      {
        id: 'unidade',
        titulo: 'Unidade, embalagem e custo',
        blocos: [
          { texto: 'Escolha a unidade pelo jeito que você usa o insumo, não pela embalagem em que ele vem.' },
          { texto: 'Unidade base é como você controla o estoque e o que a ficha usa: a caixa de 5 kg é medida em kg, e o refrigerante vendido inteiro, em un.' },
          { texto: 'Com a unidade marcada, esta ajuda segue para quanto vem na embalagem e o custo.' },
        ],
        secao: 'exemplos',
      },
      {
        id: 'conteudo',
        titulo: 'Quanto vem na embalagem',
        blocos: [
          { texto: 'Informe o conteúdo de UMA embalagem que você compra, na medida da unidade base, e não quantas comprou.' },
          { texto: 'Ex.: saco de farinha com 5 kg → 5; caixa de ovos com 30 un → 30; óleo que você mede em litro, lata de 900 ml → 900, com ml em Medida.' },
          { texto: 'Na dúvida sobre o peso ou o volume, confira o rótulo ou consulte o fornecedor, sem estimar.' },
        ],
        secao: 'exemplos',
      },
      {
        id: 'custo',
        titulo: 'Custo inicial e frete',
        blocos: [
          { texto: 'Informe quanto você paga por uma embalagem de compra; o frete que cair em cada uma, se pagar, entra junto no custo.' },
          { texto: 'Esse valor calcula o custo do insumo e das fichas antes da primeira compra registrada; depois, vale o último preço de compra.' },
          { texto: 'Ex.: saco de farinha de 5 kg por R$ 25,00 → custo de referência R$ 5,00/kg.', para: ['compras.ver'] },
        ],
        secao: 'campos',
      },
    ],
  },
  {
    chave: 'insumo',
    area: 'cadastros',
    rotas: ['insumos/[id]'],
    titulo: 'Detalhe do insumo',
    versao: 5,
    aula: [
      { texto: 'O custo de hoje e a origem dele (o último preço de compra ou o custo inicial de referência), e quanto tem em cada loja do seu acesso.' },
      { texto: 'Conservação e prazo de uso após abertura ficam lado a lado, sem confundir com o vencimento do lote.' },
      { texto: 'A categoria fica ao lado, com a forma como foi escolhida; em “Outros / a classificar” o insumo espera revisão.' },
      { texto: 'Mais embaixo, o que você pagou em cada nota e qual fornecedor saiu mais barato.', para: ['compras.ver'] },
      { texto: 'Para o histórico completo, com período, lojas e preço médio, use “Ver o histórico de compras”.', para: ['compras.ver'] },
      { texto: 'Abra uma ficha em “Onde é usado” para consultá-la. Na ficha, “Voltar para o insumo” retorna a este trecho e mantém os filtros da lista de insumos.', para: ['fichas.ver'] },
    ],
    pontos: [
      {
        id: 'categoria',
        titulo: 'Categoria',
        blocos: [{ texto: 'Categoria é a natureza do insumo para o CMV. Não é onde ele fica guardado nem a conservação: coxa de frango é Proteína, mesmo congelada.' }],
      },
    ],
  },
  {
    chave: 'insumo-remover',
    area: 'cadastros',
    rotas: ['insumos/[id]/remover'],
    titulo: 'Remover insumo',
    versao: 1,
    aula: [
      { texto: 'Antes de remover, a tela mostra tudo o que usa o insumo: fichas, notas de compra, estoque, produção e mudanças de custo.' },
      { texto: 'Com algum registro ligado, o insumo só pode ser desativado: ele sai da lista e da busca, e tudo o que já aconteceu fica como está.' },
      { texto: 'Sem nenhum registro ligado, dá para excluir de vez, marcando que você entendeu que não dá para desfazer.' },
    ],
  },
  {
    chave: 'ficha-fotos',
    area: 'cadastros',
    rotas: ['fichas/[id]/fotos'],
    titulo: 'Fotos da ficha',
    versao: 1,
    aula: [
      { texto: 'A principal é a capa; as de apoio mostram detalhe, corte, montagem ou etapas, na ordem que você escolher.' },
      { texto: 'Foto nova entra como apoio e vira capa só em “Tornar principal”; a capa antiga continua como apoio.' },
      { texto: 'Para tirar a principal, diga qual fica no lugar dela ou escolha ficar sem principal: as de apoio nunca são apagadas junto.' },
    ],
  },
  {
    chave: 'ficha-remover',
    area: 'cadastros',
    rotas: ['fichas/[id]/remover'],
    titulo: 'Remover ficha',
    versao: 1,
    aula: [
      { texto: 'Antes de remover, a tela mostra onde a ficha é usada: outras fichas, produção, lista do dia, requisições e produtos de venda.' },
      { texto: 'Remover uma ficha é desativar: ela sai da lista e da escolha nas outras fichas. Receita, preços, produções e histórico ficam como estão.' },
      { texto: 'Para voltar a usar ou editar, reative no detalhe da ficha.' },
    ],
  },
  {
    chave: 'insumo-categorias',
    area: 'cadastros',
    rotas: ['insumos/categorias'],
    titulo: 'Categorias de insumo',
    versao: 2,
    aula: [
      { texto: 'A categoria diz o que o insumo é para o CMV, como Proteína, Hortifruti ou Mercearias e secos; não é setor nem onde fica guardado.' },
      { texto: 'A lista vale para a rede inteira: as dez do plano já vêm prontas, e dá para criar, renomear e mudar a ordem.' },
      { texto: 'Categoria com insumos, com meta por categoria ou no estoque guardado de um fechamento não se exclui, desativa-se: os insumos continuam nela e o histórico fica.' },
      { texto: '“Outros / a classificar” é do sistema e fica sempre por último.' },
      { texto: 'Só quem gere as categorias mexe aqui; os demais veem a lista.', para: ['insumos.ver'] },
    ],
  },
  {
    chave: 'insumo-classificar',
    area: 'cadastros',
    rotas: ['insumos/classificar'],
    titulo: 'Classificar insumos',
    versao: 2,
    aula: [
      { texto: 'Valores de estoque aparecem somente nas lojas em que você pode consultar compras; um valor parcial fica identificado.' },
      { texto: 'Insumos cadastrados antes das categorias ficam sem categoria; aqui ganham uma, pelo nome, sem mudar preço, unidade, saldo nem ficha.' },
      { texto: 'A prévia mostra para onde cada um iria, sem gravar nada; na dúvida, vai para “Outros / a classificar”, com o motivo.' },
      { texto: 'Na fila de revisão, marque vários e escolha a categoria: cada mudança fica no histórico, com o antes e o depois.' },
      { texto: 'Aplicar vale uma vez; dá para desfazer um lote, e só volta o que ninguém mexeu depois.', para: ['insumos.categorias'] },
    ],
  },
  {
    chave: 'insumo-embalagem',
    area: 'cadastros',
    rotas: ['insumos/[id]/embalagens/[varianteId]'],
    titulo: 'Outra embalagem',
    versao: 2,
    aula: [
      { texto: 'É outra forma de comprar o mesmo insumo: caixa, fardo, outra marca.' },
      { texto: 'O nome pedido aqui é o da embalagem (ex.: caixa de 5 kg); o nome do insumo continua o mesmo.' },
      { texto: 'A tela do insumo diz qual embalagem sai mais barata.' },
    ],
  },
  {
    chave: 'fichas',
    area: 'cadastros',
    rotas: ['fichas'],
    titulo: 'Fichas técnicas',
    versao: 6,
    aula: [
      { texto: 'Cada receita da casa, com o que rende e o que leva.' },
      { texto: 'Pré-preparo (molho, base) entra dentro de outras fichas.' },
      { texto: 'Seção agrupa as fichas e subseção refina o grupo; combine com nome, tipo e situação, ou use Sem seção para encontrar as fichas ainda sem classificação.' },
      { texto: 'Para quem vê os preços, aparece o custo por porção ou “Incompleto” quando falta preço em algum insumo.', para: ['precos.ver'] },
      { texto: 'Em “Comparação com a meta”, marque uma ou mais opções por canal: entram os pratos que atendem a qualquer opção marcada, uma vez cada, considerando a lista inteira.', para: ['precos.ver'] },
      { texto: '“Faixa do farol” permite combinar as cinco faixas e os estados sem dados, não ofertado e faixas não configuradas; sem seleção, esse grupo não restringe a lista.', para: ['precos.ver'] },
      { texto: 'Com os dois grupos marcados, o prato precisa corresponder a uma opção de cada grupo e aos demais filtros.', para: ['precos.ver'] },
    ],
    pontos: [
      {
        id: 'conta',
        titulo: 'Como o CMV é calculado',
        blocos: [
          { texto: 'CMV é o custo físico (insumos e embalagens do canal) dividido pelo preço que você definiu; a taxa do iFood fica fora. A sugestão não conta como preço definido.', para: ['precos.ver'] },
          { texto: 'Meta e limites são independentes: sem meta não há comparação nem sugestão, e sem limites o número aparece com farol neutro.', para: ['precos.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'ficha-nova',
    area: 'cadastros',
    rotas: ['fichas/nova', 'fichas/[id]/editar'],
    titulo: 'Montar a ficha',
    versao: 6,
    aula: [
      { texto: 'Monte a receita com a quantidade limpa, sem casca e sem osso; o fator de correção cobre a perda da limpeza: cebola 1,18 quer dizer que 354 g sujas dão 300 g limpas.' },
      { texto: 'Pré-preparo diz quanto rende pronto, onde guarda e quanto dura; marque consumo imediato quando nada fica guardado.' },
      { texto: 'Seção e subseção são opcionais, para pratos e pré-preparos. Escolha uma existente ou escreva um nome novo; o nome novo só é criado ao salvar a ficha.' },
      { texto: 'As embalagens ficam na mesma edição, em bloco separado da receita e do preparo. Delivery próprio e iFood têm quantidades por porção; Loja usa somente a receita.', para: ['precos.ver'] },
      { texto: 'Salvar confirma receita e embalagens juntas; a prévia acompanha os ingredientes, o rendimento e as embalagens digitadas, sem mudar o preço manual.', para: ['precos.ver'] },
    ],
    secoes: [
      {
        id: 'preparo',
        titulo: 'Etapas e descrição comercial',
        blocos: [
          { texto: 'O modo de preparo vai em etapas numeradas, uma ação por etapa. Suba ou desça uma etapa pelos botões ao lado dela.' },
          { texto: 'A descrição comercial é o texto do cardápio e do marketplace. Não é publicada sozinha em lugar nenhum.' },
        ],
      },
    ],
    pontos: [
      {
        id: 'classificacao',
        titulo: 'Seção e subseção',
        blocos: [
          { texto: 'A subseção pertence à seção escolhida; trocar a seção limpa a subseção anterior, sem mudar os ingredientes nem o preparo.' },
          { texto: 'Em Gerenciar seções, renomear conserva os vínculos e arquivar retira a opção de novas escolhas. As fichas que já a usam continuam vinculadas, e só se exclui uma classificação vazia e sem vínculos.' },
        ],
      },
      {
        id: 'tipo',
        titulo: 'Prato ou pré-preparo',
        blocos: [
          { texto: 'Prato rende porções e o custo sai por porção. Pré-preparo (molho, massa, recheio) rende em kg, L ou un, entra em outras fichas e aparece em Insumos com o custo desta receita.' },
        ],
      },
      {
        id: 'descricao',
        titulo: 'Descrição comercial',
        blocos: [{ texto: 'Texto de apresentação para cardápios e marketplaces. Não vai para lugar nenhum sozinho; o passo a passo da cozinha fica nas etapas do preparo.' }],
        secao: 'preparo',
      },
      {
        id: 'foto',
        titulo: 'Foto da ficha',
        blocos: [
          { texto: 'Do prato pronto ou da montagem: quem opera bate o olho e sabe o que é. A foto é reduzida e guardada sem a localização do celular.' },
          { texto: 'Espere o envio da foto terminar antes de cadastrar um insumo; se ela não estiver mais disponível ao voltar, escolha novamente, mantendo os outros campos do rascunho.' },
        ],
      },
      {
        id: 'rendimento',
        titulo: 'Rendimento',
        blocos: [
          { texto: 'Prato: quantas porções a receita dá. Pré-preparo: quanto sai pronto, já pesado depois do preparo; o que o cozimento tira ou acrescenta já está aqui.' },
        ],
      },
      {
        id: 'etapas',
        titulo: 'Etapas do preparo',
        blocos: [{ texto: 'Uma ação por etapa. A ordem aqui é a ordem na ficha e na impressão, e etapa em branco não é gravada.' }],
        secao: 'preparo',
      },
      {
        id: 'embalagens',
        titulo: 'Embalagens por canal',
        blocos: [
          { texto: 'Escolha embalagens cadastradas e a quantidade por porção de cada canal; copiar Delivery para iFood é opcional, e as listas podem ser ajustadas separadamente.', para: ['precos.ver'] },
          { texto: 'Os canais são alternativas para o pedido; embalagem também presente na receita pede conferência para evitar contar o mesmo uso duas vezes.', para: ['precos.ver'] },
          { texto: 'Cadastrar um insumo exige acesso próprio e não salva a ficha; a prévia usa referências da abertura e fica pendente com custo ausente ou entrada inválida.', para: ['precos.ver'] },
        ],
      },
      {
        id: 'rascunho',
        titulo: 'Rascunho e confirmação',
        blocos: [
          { texto: 'O rascunho fica nesta aba por 20 minutos, separado por pessoa, parceiro e ficha; fechar a aba não guarda uma cópia para outra sessão.' },
          { texto: 'Se alguém salvou antes, o rascunho continua disponível, mas a versão antiga não sobrescreve a nova; confira a ficha salva antes de refazer as alterações.' },
          { texto: 'Sem resposta, confira a ficha antes de repetir: a edição pode indicar conflito mesmo quando a primeira tentativa foi gravada.' },
        ],
      },
    ],
  },
  {
    chave: 'ficha-importar',
    area: 'cadastros',
    rotas: ['fichas/importar'],
    titulo: 'Importar planilha',
    versao: 1,
    aula: [
      { texto: 'Baixe o modelo, preencha uma linha por insumo e envie.' },
      { texto: 'Antes de gravar, você vê o que é novo, o que muda e o que tem erro. Enviar a mesma planilha de novo não duplica nada.' },
    ],
  },
  {
    chave: 'producao',
    area: 'producao',
    rotas: ['producao'],
    titulo: 'Produção',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver os lotes: planejados, em produção e os concluídos de hoje.' },
      { texto: 'Lote atrasado ganha uma faixa vermelha.' },
    ],
  },
  {
    chave: 'producao-lista',
    area: 'producao',
    rotas: ['producao/lista'],
    titulo: 'Lista do dia',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver a lista do dia: o que ela vai produzir e o que isso pede do estoque.' },
      { texto: 'Ao lado de cada loja, quantos pré-preparos a lista de hoje tem e quantos ainda não viraram lote.' },
    ],
  },
  {
    chave: 'producao-lista-loja',
    area: 'producao',
    rotas: ['producao/lista/[lojaId]'],
    titulo: 'Lista do dia da loja',
    versao: 4,
    aula: [
      { texto: 'O que a loja vai produzir no dia, e o que isso pede do estoque: quanto vai usar de cada insumo, quanto tem e quanto falta.' },
      { texto: 'Falta escrito em vermelho quer dizer que o estoque não dá. Abaixo de zero quer dizer que o estoque está errado ou que falta lançar nota.' },
      { texto: 'Monte a lista, salve e confira o que falta. Depois, gere os lotes: cada pré-preparo vira um lote, com a requisição dos insumos.', para: ['producao.planejar'] },
      { texto: 'Quem define a lista é a gerência. Para fazer, pegue o pré-preparo em Tarefas: ele vira lote com o seu nome e a hora.', para: ['producao.registrar'] },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'O vai usar sai da receita de cada ficha, já com o fator de correção, igual ao que a requisição do lote vai pedir.' },
          { texto: 'Se a receita usa outro pré-preparo, como a base do molho, conta primeiro o que tem dele no estoque e o que a lista produz. O que ainda falta entra pela receita dele.' },
          { texto: 'Depois que vira lote, conta só o que ainda falta sair pela requisição. O que já saiu está no estoque, então nada é contado duas vezes.' },
          { texto: 'Loja sem a contagem de abertura não tem saldo: a lista mostra só o que vai usar.' },
        ],
      },
      {
        id: 'compra',
        titulo: 'Para quem compra',
        blocos: [
          { texto: 'A lista não faz pedido. Quem compra vê o que falta e lança a nota em Compras.', para: ['compras.ver', 'compras.lancar'] },
          { texto: 'A compra estimada usa o último preço pago. Insumo sem preço fica de fora, e a tela diz qual. A cozinha vê só as quantidades.', para: ['compras.ver'] },
          { texto: 'O quanto ainda cabe é o mesmo do Orçamento de compra, com a compra estimada somada.', para: ['compras.ver', 'compras.lancar'] },
        ],
      },
    ],
  },
  {
    chave: 'producao-quadro',
    area: 'producao',
    rotas: ['producao/[lojaId]'],
    titulo: 'Produção da loja',
    versao: 2,
    aula: [
      { texto: 'Cada cartão é um lote: o pré-preparo, o código, quanto, para quando e se os insumos já saíram do estoque.' },
      { texto: 'Lote atrasado ganha uma faixa vermelha e os dias de atraso.' },
      { texto: 'Planeje em “Nova produção”. Quando o lote ficar pronto, abra o cartão e conclua.', para: ['producao.registrar'] },
    ],
    secoes: [
      {
        id: 'andamento',
        titulo: 'Como o lote anda',
        blocos: [
          { texto: 'Planejada: o lote existe e a requisição dos insumos já foi para o estoque. Em produção: alguém pegou, e o cartão diz quem. Concluída: o lote entrou no estoque.' },
          { texto: 'Concluídas e canceladas aparecem só no dia. Os lotes antigos ficam no Histórico.' },
        ],
      },
    ],
    pontos: [
      {
        id: 'fluxo',
        titulo: 'Como o lote anda',
        blocos: [{ texto: 'Planeje o lote pela ficha: os insumos saem do estoque pela requisição, que o estoque entrega. Quem vai fazer pega o lote em Tarefas e, quando fica pronto, conclui dizendo quanto saiu de verdade; aí ele entra no estoque da loja.' }],
        secao: 'andamento',
      },
    ],
  },
  {
    chave: 'producao-nova',
    area: 'producao',
    rotas: ['producao/nova', 'producao/[lojaId]/nova'],
    titulo: 'Nova produção',
    versao: 1,
    aula: [
      { texto: 'Escolha o pré-preparo e quanto vai produzir. A lista de insumos sai da receita, já com o fator de correção.' },
      { texto: 'Confira a lista e mude o que precisar. Ao planejar, a requisição dos insumos vai sozinha para o estoque; nada sai até o estoque entregar.' },
    ],
    secoes: [
      {
        id: 'codigo',
        titulo: 'O código do lote',
        blocos: [{ texto: 'O lote ganha um código com a data e o número do dia, como 261017-01. O código não se repete, mesmo se o lote for cancelado, e é ele que vai na etiqueta.' }],
      },
    ],
  },
  {
    chave: 'producao-lote',
    area: 'producao',
    rotas: ['producao/[lojaId]/[ordemId]'],
    titulo: 'Lote',
    versao: 4,
    aula: [
      { texto: 'O que foi planejado, os insumos que saíram pela requisição, quem está fazendo e, depois de concluído, quanto saiu de verdade.' },
      { texto: 'O lote que outra pessoa pegou só ela ou a gerência conclui, solta ou cancela.', para: ['producao.registrar'] },
      { texto: 'Para concluir, os insumos precisam estar entregues; se sobrou insumo, devolva pela requisição antes.', para: ['producao.registrar'] },
      { texto: 'Cancelar só vale se nada saiu do estoque, ou se tudo voltou. Estornar um lote concluído é de quem ajusta o saldo.', para: ['producao.registrar'] },
      { texto: 'O custo do lote é o que saiu do estoque, dividido pelo que saiu de verdade, ao lado do que a ficha prevê.', para: ['compras.ver'] },
    ],
    secoes: [
      {
        id: 'custo',
        titulo: 'A conta do custo',
        blocos: [
          { texto: 'São 117,81 reais de insumos para 4,6 kg de molho: 25,61 reais por quilo. Se algum insumo saiu sem preço, o lote fica com custo incompleto e a tela diz qual, nunca com zero.', para: ['compras.ver'] },
          { texto: 'O custo de referência do pré-preparo continua o da ficha. O lote mostra o que custou de verdade e não mexe nele.', para: ['compras.ver'] },
        ],
      },
      {
        id: 'etiqueta',
        titulo: 'A etiqueta do lote',
        blocos: [{ texto: 'Depois de concluído, Imprimir etiqueta leva à etiqueta do lote. A validade é a da conclusão, e reimprimir não muda.', para: ['etiquetas.imprimir'] }],
      },
    ],
  },
  {
    chave: 'producao-concluir',
    area: 'producao',
    rotas: ['producao/[lojaId]/[ordemId]/concluir', 'producao/tarefas/[lojaId]/[ordemId]/concluir'],
    titulo: 'Concluir o lote',
    versao: 3,
    aula: [
      { texto: 'Diga quanto saiu de verdade; zero se o lote se perdeu, e então nada entra no estoque.' },
      { texto: 'Passou de 10% para mais ou para menos, ou perdeu tudo: escreva o motivo.' },
      { texto: 'Escolha onde o lote vai ficar: a validade nasce daí e não muda se a ficha mudar depois.' },
      { texto: 'O custo por quilo aparece ao vivo, enquanto você digita.', para: ['compras.ver'] },
      { texto: 'Quem pegou o lote fica como quem fez, mesmo se a gerência concluir por ele.', para: ['producao.planejar'] },
    ],
  },
  // ================================================================ 3.4: Etiquetas (e o lote do fornecedor na nota)
  {
    chave: 'etiquetas',
    area: 'etiquetas',
    rotas: ['etiquetas'],
    titulo: 'Etiquetas',
    versao: 1,
    aula: [{ texto: 'Escolha a loja para imprimir a etiqueta dos lotes produzidos e das embalagens abertas.' }],
  },
  {
    chave: 'etiquetas-loja',
    area: 'etiquetas',
    rotas: ['etiquetas/[lojaId]'],
    titulo: 'Etiquetas da loja',
    versao: 2,
    aula: [
      { texto: 'Os lotes concluídos e as embalagens abertas dos últimos 7 dias, cada um com a validade. Toque num deles para emitir a etiqueta.' },
      { texto: 'Esperando a impressora são as etiquetas emitidas que a Zebra ainda não aceitou e que ninguém marcou com “Já imprimi”.' },
      { texto: 'Lote ou embalagem vencida aparece como “venceu: não use” e sai da fila.' },
    ],
    secoes: [
      {
        id: 'validade',
        titulo: 'De onde vem a validade',
        blocos: [
          { texto: 'Do lote produzido, é a da conclusão: a ficha dizia quanto dura na conservação escolhida. Da embalagem aberta, é o prazo depois de aberto ou o vencimento do lote, o que vier antes.' },
          { texto: 'Sem prazo cadastrado, a etiqueta diz que não foi informado. Nenhum prazo é inventado.' },
        ],
      },
    ],
  },
  {
    chave: 'etiquetas-lote',
    area: 'etiquetas',
    rotas: ['etiquetas/[lojaId]/lote/[ordemId]'],
    titulo: 'Etiqueta do lote',
    versao: 2,
    aula: [
      { texto: 'Escolha o tamanho, quantas etiquetas e, se quiser, quanto vai em cada pote. A prévia mostra como vai sair.' },
      { texto: 'A validade, a conservação e quem fez vêm da conclusão do lote: mudar a ficha depois não muda a etiqueta.' },
      { texto: 'Lote sem validade sai com validade não informada; lote vencido não emite nem reimprime: separe para descarte e avise a gerência.' },
    ],
  },
  {
    chave: 'etiquetas-abrir',
    area: 'etiquetas',
    rotas: ['etiquetas/abrir'],
    titulo: 'Abrir embalagem',
    versao: 1,
    aula: [{ texto: 'Escolha a loja onde a embalagem foi aberta.' }],
  },
  {
    chave: 'etiquetas-abrir-loja',
    area: 'etiquetas',
    rotas: ['etiquetas/[lojaId]/abrir'],
    titulo: 'Abrir uma embalagem',
    versao: 1,
    aula: [
      { texto: 'Escolha o insumo, o lote dele e onde a embalagem aberta vai ficar. A data e a hora entram sozinhas.' },
      { texto: 'A validade é o prazo depois de aberto ou o vencimento do lote, o que vier antes. Lote vencido não se abre.' },
    ],
    secoes: [
      {
        id: 'lote',
        titulo: 'O lote da embalagem',
        blocos: [
          { texto: 'Os lotes vêm do recebimento da compra ou de uma abertura anterior. Se o lote não está na lista, leia na embalagem; se ela não diz, marque lote não informado.' },
          { texto: 'Abrir não mexe no estoque: só registra quando e por quem a embalagem foi aberta, e quem abriu assina a etiqueta.' },
        ],
      },
    ],
  },
  {
    chave: 'etiquetas-aberta',
    area: 'etiquetas',
    rotas: ['etiquetas/[lojaId]/aberta/[aberturaId]'],
    titulo: 'Embalagem aberta',
    versao: 2,
    aula: [
      { texto: 'Quando foi aberta, por quem, o lote e até quando usar, com a regra que deu a data.' },
      { texto: 'Emita a etiqueta e cole na embalagem. A abertura não se edita: se errou, registre outra.' },
      { texto: 'Embalagem vencida não emite etiqueta: separe para descarte e avise a gerência.' },
    ],
  },
  {
    chave: 'etiquetas-emissao',
    area: 'etiquetas',
    rotas: ['etiquetas/[lojaId]/[etiquetaId]'],
    titulo: 'Imprimir a etiqueta',
    versao: 2,
    aula: [
      { texto: 'Imprima na Zebra. Sem a Zebra neste aparelho, baixe o arquivo .zpl ou imprima no papel e, depois que sair, toque em “Já imprimi”.' },
      { texto: 'Reimprimir sai igual: a validade é a da emissão. Cada pedido fica no histórico.' },
    ],
    secoes: [
      {
        id: 'zebra',
        titulo: 'Enviada não é impressa',
        blocos: [
          { texto: 'Enviada à impressora quer dizer que o Browser Print da Zebra recebeu. Confira o papel; se não saiu, veja a tampa, o rolo e a fita antes de mandar de novo, porque pode sair repetida.' },
          { texto: 'Sem resposta em 15 segundos não é falha: confira o papel. Se saiu, toque em “Já imprimi”; se não, mande de novo.' },
          { texto: 'Sem o Browser Print neste aparelho, a etiqueta fica esperando a impressora: imprima pelo computador da Zebra.' },
        ],
      },
    ],
  },
  {
    chave: 'etiquetas-papel',
    area: 'etiquetas',
    rotas: ['etiquetas/[lojaId]/[etiquetaId]/papel'],
    titulo: 'Etiqueta no papel',
    versao: 2,
    aula: [
      { texto: 'As etiquetas em tamanho real numa folha A4. Imprima em 100%, sem ajustar à página, e recorte nas linhas.' },
      { texto: 'Depois que a folha sair, toque em “Já imprimi”: a etiqueta sai da fila.' },
    ],
  },
  {
    chave: 'etiquetas-historico',
    area: 'etiquetas',
    rotas: ['etiquetas/historico'],
    titulo: 'Histórico de impressões',
    versao: 1,
    aula: [{ texto: 'Escolha a loja para ver o que foi impresso, quantas, como e por quem.' }],
    pontos: [
      {
        id: 'situacao',
        titulo: 'O que cada situação quer dizer',
        blocos: [{ texto: '“Enviada à Zebra” é que o Browser Print recebeu, não que saiu no papel. “Sem resultado” é o pedido que a tela não chegou a confirmar, porque fechou ou caiu a conexão: pode ou não ter saído.' }],
      },
    ],
  },
  {
    chave: 'etiquetas-historico-loja',
    area: 'etiquetas',
    rotas: ['etiquetas/historico/[lojaId]'],
    titulo: 'Histórico de impressões da loja',
    versao: 3,
    aula: [
      { texto: 'Cada pedido de impressão do período: Zebra, arquivo ou papel, as cópias e o que aconteceu.' },
      { texto: 'Pedidos e etiquetas são contas diferentes: um pedido de 10 cópias são 10 etiquetas.' },
      { texto: 'Sem resultado é a Zebra que não respondeu: pode ter saído. Esperando o Já imprimi é arquivo ou papel que ninguém confirmou.' },
    ],
    pontos: [
      {
        id: 'situacao',
        titulo: 'O que cada situação quer dizer',
        blocos: [{ texto: '“Enviada à Zebra” é que o Browser Print recebeu, não que saiu no papel. “Sem resultado” é o pedido que a tela não chegou a confirmar, porque fechou ou caiu a conexão: pode ou não ter saído.' }],
      },
    ],
  },
  {
    chave: 'etiquetas-impressora',
    area: 'etiquetas',
    rotas: ['etiquetas/impressora'],
    titulo: 'Impressora',
    versao: 2,
    aula: [
      { texto: 'A Zebra deste computador: o Browser Print da Zebra precisa estar aberto nele. Escolha a impressora e imprima a etiqueta de teste.' },
      { texto: 'A escolha fica neste navegador; outro computador escolhe de novo.' },
      { texto: 'Na primeira vez, o Chrome pede licença para a rede local e o certificado de https://localhost:9101 precisa ser aceito: os passos estão na tela.' },
    ],
  },
  {
    chave: 'compra-lotes',
    area: 'compras',
    rotas: ['compras/[id]/lotes'],
    titulo: 'Lote e vencimento',
    versao: 1,
    aula: [
      { texto: 'O lote e o vencimento de cada insumo da nota, como vieram na embalagem. Nada é obrigatório nem inventado.' },
      { texto: 'Quando a nota veio do XML, o lote que o fornecedor declarou aparece como sugestão: só entra se você confirmar.' },
      { texto: 'Registrar não muda a nota, o estoque nem o custo.', para: ['compras.lancar'] },
    ],
    pontos: [
      {
        id: 'lote',
        titulo: 'Lote e vencimento',
        blocos: [{ texto: 'O lote e o vencimento de cada insumo, como vieram na embalagem; o que a embalagem não diz fica em branco. Na hora de abrir a embalagem, a cozinha escolhe o lote daqui e a etiqueta usa o vencimento dele.' }],
      },
    ],
  },
  {
    chave: 'producao-tarefas',
    area: 'producao',
    rotas: ['producao/tarefas'],
    titulo: 'Tarefas da cozinha',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver as tarefas de hoje da cozinha.' },
      { texto: 'Ao lado de cada loja, quantas tarefas estão para pegar e quantas já estão em produção.' },
    ],
  },
  {
    chave: 'producao-tarefas-loja',
    area: 'producao',
    rotas: ['producao/tarefas/[lojaId]'],
    titulo: 'Tarefas da cozinha da loja',
    versao: 2,
    aula: [
      { texto: 'As tarefas de hoje da loja: pegue a que você vai fazer e o lote fica com você, com o seu nome e a hora.' },
      { texto: 'Com os insumos entregues e o lote pronto, toque em Concluir e diga quanto saiu de verdade.' },
      { texto: 'Se não for terminar, solte o lote com o motivo: ele volta para alguém pegar.' },
      { texto: 'No tablet da cozinha, cada um entra com o próprio acesso: confira o seu nome no alto antes de pegar.' },
      { texto: 'A gerência solta o lote de qualquer pessoa ou passa para outra, sempre com o motivo.', para: ['producao.planejar'] },
      { texto: 'A tela se atualiza sozinha a cada minuto e quando você volta a ela: o que o estoque entregou aparece sem recarregar.', para: ['producao.registrar'] },
    ],
    secoes: [
      {
        id: 'pegar',
        titulo: 'Como funciona o pegar',
        blocos: [
          { texto: 'Pegar é começar: o lote passa para Em produção. Duas pessoas não pegam o mesmo lote: quem chega depois vê quem pegou.' },
          { texto: 'O pré-preparo da lista que ainda não virou lote vira lote na hora em que alguém pega, com a requisição dos insumos. Nada sai do estoque até o estoque entregar.' },
          { texto: 'Pegar e soltar não mexem no estoque. Quem conclui é quem pegou, ou a gerência.' },
        ],
      },
    ],
  },
  {
    chave: 'producao-historico',
    area: 'producao',
    rotas: ['producao/historico'],
    titulo: 'Histórico da produção',
    versao: 1,
    aula: [{ texto: 'Escolha a loja para ver o que a cozinha produziu, quanto, quem fez e quando.' }],
    pontos: [
      {
        id: 'tempo',
        titulo: 'Como o tempo é contado',
        blocos: [{ texto: 'O tempo conta de quando a pessoa pegou o lote, ou de quando os insumos saíram do estoque se foi depois, até a conclusão. Lote concluído sem pegar pela tela da cozinha não tem tempo.' }],
      },
    ],
  },
  {
    chave: 'producao-historico-loja',
    area: 'producao',
    rotas: ['producao/historico/[lojaId]'],
    titulo: 'Histórico da produção da loja',
    versao: 2,
    aula: [
      { texto: 'Os lotes encerrados no período: o que foi feito, quanto saiu contra o planejado, quem fez e quanto tempo levou.' },
      { texto: 'Filtre por pessoa, pré-preparo e dia. Quem fez é quem pegou o lote; sem pegar, quem concluiu.' },
      { texto: 'O custo do lote é o que saiu do estoque pelos insumos. Insumo sem preço deixa o custo incompleto, nunca zero.', para: ['compras.ver'] },
    ],
    secoes: [
      {
        id: 'tempo',
        titulo: 'O tempo de cada lote',
        blocos: [{ texto: 'Conta de quando a pessoa pegou o lote, ou de quando os insumos saíram do estoque se foi depois, até a conclusão. Lote concluído sem pegar pela tela da cozinha fica sem tempo.' }],
      },
    ],
    pontos: [
      {
        id: 'tempo',
        titulo: 'Como o tempo é contado',
        blocos: [{ texto: 'O tempo conta de quando a pessoa pegou o lote, ou de quando os insumos saíram do estoque se foi depois, até a conclusão. Lote concluído sem pegar pela tela da cozinha não tem tempo.' }],
        secao: 'tempo',
      },
    ],
  },
  {
    chave: 'producao-indicadores',
    area: 'producao',
    rotas: ['producao/indicadores'],
    titulo: 'Indicadores da produção',
    versao: 1,
    aula: [{ texto: 'Escolha a loja para ver os indicadores da produção de cada pessoa.' }],
    pontos: [
      {
        id: 'leitura',
        titulo: 'Rendimento e tempo',
        blocos: [{ texto: 'Rendimento é o que saiu contra o planejado pela ficha; a média dá o mesmo peso a cada lote e não conta os perdidos, que aparecem à parte. Tempo vai de quando a pessoa pegou o lote, ou de quando os insumos saíram se foi depois, até a conclusão.' }],
      },
    ],
  },
  {
    chave: 'producao-indicadores-loja',
    area: 'producao',
    rotas: ['producao/indicadores/[lojaId]'],
    titulo: 'Indicadores da produção da loja',
    versao: 2,
    aula: [
      { texto: 'De cada pessoa, no período: lotes concluídos, quanto produziu de cada pré-preparo, rendimento contra o planejado, tempo, perdidos e cancelados.' },
      { texto: 'É um retrato para conversar com a equipe, não uma nota. Com menos de 5 lotes, a amostra é pequena e ainda não diz muito.' },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'Rendimento médio: cada lote pesa igual, e os perdidos ficam à parte. Por pré-preparo: o que saiu somado, dividido pelo planejado somado.' },
          { texto: 'Fora de 10%: lote que saiu mais de 10% acima ou abaixo do planejado. Tempo: de pegar, ou da entrega dos insumos, até concluir.' },
          { texto: 'Cancelou: os que a própria pessoa cancelou. Os que a gerência cancelou enquanto estavam com ela ficam à parte e não contam para ela.' },
          { texto: 'Lote concluído pela FlowFoods, sem pessoa da equipe, fica fora das pessoas.' },
        ],
      },
    ],
    pontos: [
      {
        id: 'leitura',
        titulo: 'Rendimento e tempo',
        blocos: [{ texto: 'Rendimento é o que saiu contra o planejado pela ficha; a média dá o mesmo peso a cada lote e não conta os perdidos, que aparecem à parte. Tempo vai de quando a pessoa pegou o lote, ou de quando os insumos saíram se foi depois, até a conclusão.' }],
        secao: 'conta',
      },
    ],
  },
  {
    chave: 'ficha',
    area: 'cadastros',
    rotas: ['fichas/[id]', 'fichas/[id]/imprimir'],
    titulo: 'Detalhe da ficha',
    versao: 8,
    aula: [
      { texto: 'Foto, descrição comercial, seção e subseção (com aviso quando arquivadas), o que a receita leva e o modo de preparo em etapas.' },
      { texto: 'O custo por porção e de cada item, com a conta à mostra.', para: ['precos.ver'] },
      { texto: 'Pré-preparo: “Produzir” planeja um lote dele, com os insumos tirados da receita.', para: ['producao.registrar'] },
      { texto: 'Em “Preço e CMV por canal”: custo físico, meta, sugestão pela meta, seu preço, CMV com sua faixa e comparação com a meta, e resultado após os custos informados.', para: ['precos.ver'] },
      { texto: 'Preço em branco é preço não definido: o canal fica sem dados até você pôr o seu. A sugestão nunca muda o seu preço.', para: ['precos.ver'] },
      { texto: 'A impressão usa a ficha salva, com ingredientes por rendimento e embalagens por porção; o botão confere alterações e pergunta o que sai no papel.' },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'Custo físico = insumos da receita + embalagens do canal, pelo custo de referência (o último preço pago). A taxa do iFood fica fora do CMV: aparece à parte.', para: ['precos.ver'] },
          { texto: 'Preço sugerido = custo físico ÷ meta de CMV do canal, arredondado para cima no centavo. CMV = custo físico ÷ o seu preço.', para: ['precos.ver'] },
          { texto: 'Comparação com a meta: dentro quando o CMV é igual ou abaixo dela, acima quando ultrapassa, ou sem dados quando falta custo, meta ou preço. Canal em que o prato não é vendido fica “não ofertado”.', para: ['precos.ver'] },
          { texto: 'Resultado após os custos informados = preço − custo físico − taxa do canal. Aluguel, equipe e impostos não entram: não é lucro líquido.', para: ['precos.ver'] },
        ],
      },
      {
        id: 'faixas',
        titulo: 'A faixa do CMV',
        blocos: [
          { texto: 'Muito favorável, Favorável, Confortável, Atenção e Crítico usam os limites configurados para cada canal. São independentes da meta que orienta o preço sugerido.', para: ['precos.ver'] },
          { texto: 'Sem custo completo, com custo zero ou sem preço definido, a faixa fica sem dados, com o motivo escrito. Não ofertado e Faixas não configuradas são estados separados.', para: ['precos.ver'] },
          { texto: 'O percentual aparece com uma casa decimal; a faixa considera o CMV sem arredondar e mostra seu intervalo. A impressão com preços e custos inclui essa informação; a impressão sem valores não a recebe.', para: ['precos.ver'] },
        ],
      },
      {
        id: 'impressao',
        titulo: 'Conferir o que sai no papel',
        blocos: [
          { texto: 'Delivery e iFood aparecem separados, com nome, unidade e quantidade por porção de cada embalagem; são alternativas, não uma soma para o mesmo pedido.' },
          { texto: 'Rascunho não salvo não entra na impressão; se a ficha ou as embalagens mudaram, o botão pede recarga, e cancelar não imprime.' },
          { texto: 'Ctrl+P sai sem valores e usa a versão já carregada, sem buscar alterações mais recentes.' },
        ],
      },
    ],
  },
  {
    chave: 'ficha-embalagens',
    area: 'cadastros',
    rotas: ['fichas/[id]/canais'],
    titulo: 'Embalagens por canal',
    versao: 4,
    aula: [
      { texto: 'O que vai no saco em cada canal: caixa, sacola, guardanapo.' },
      { texto: 'Delivery e iFood têm listas próprias. A loja não leva embalagem.' },
      { texto: 'As embalagens também ficam na edição da ficha, em bloco separado; esta página continua disponível para ajustar somente as embalagens.' },
      { texto: 'Em cada canal, a sugestão pela meta, o CMV e sua faixa acompanham as embalagens digitadas na tela. É uma prévia; o preço muda só no passo de preços.', para: ['precos.ver'] },
    ],
  },
  {
    chave: 'precificacao',
    area: 'cadastros',
    rotas: ['fichas/canais'],
    titulo: 'Precificação',
    versao: 3,
    aula: [
      { texto: 'Quanto o iFood leva e a meta de CMV de cada canal: quanto do preço o custo físico do prato pode ser.' },
      { texto: 'A meta comanda a sugestão de preço das fichas (custo físico ÷ meta), sem mudar preço já definido.' },
      { texto: 'As cinco faixas do farol usam quatro limites próprios de cada canal, separados da meta. Mudar esses limites não altera preços, custos ou registros anteriores.', para: ['precos.ver'] },
      { texto: 'Sem a taxa do iFood, o resultado do iFood fica pendente; o CMV não depende dela.' },
      { texto: 'Confira os números no seu contrato com o iFood.', para: ['precos.editar'] },
    ],
    pontos: [
      {
        id: 'porcentagens',
        titulo: 'O que entra na taxa',
        blocos: [{ texto: 'As duas porcentagens são sobre o preço do prato. Mensalidade do plano e taxa de entrega não entram aqui: são do mês e do pedido, não do prato.', para: ['precos.ver'] }],
      },
      {
        id: 'meta-cmv',
        titulo: 'Meta de CMV e preço sugerido',
        blocos: [{ texto: 'Meta de CMV é quanto do preço o custo físico pode ser, e o preço sugerido é o custo físico dividido pela meta. Pode ser igual ou diferente em cada canal. Mudar a meta não muda nenhum preço já definido.', para: ['precos.ver'] }],
      },
      {
        id: 'faixas-cmv',
        titulo: 'Limites das cinco faixas',
        blocos: [
          { texto: 'Preencha os quatro limites em ordem crescente, com até duas casas decimais e valores inclusive acima de 100%, conferindo os intervalos na prévia.', para: ['precos.ver'] },
          { texto: 'Deixar os quatro campos de um canal vazios retira só as faixas desse canal; preenchimento parcial não é salvo.', para: ['precos.editar'] },
          { texto: 'A faixa usa o CMV sem arredondar e independe da meta; sem limites, aparece Faixas não configuradas.', para: ['precos.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'compras',
    area: 'compras',
    rotas: ['compras'],
    titulo: 'Compras',
    versao: 3,
    aula: [
      { texto: 'As notas de compra de cada loja.' },
      { texto: 'Nota lançada muda o custo do insumo e entra no estoque, se a loja já abriu o estoque.' },
      { texto: 'A mesma nota não entra duas vezes.', para: ['compras.lancar'] },
      { texto: 'Tem o XML da nota fiscal? Em Notas recebidas o sistema lê os itens para você.', para: ['compras.lancar'] },
      { texto: 'Em Relatórios você vê o histórico de um insumo e tudo o que foi comprado num dia ou período, e leva para a planilha ou para o PDF.' },
    ],
  },
  {
    chave: 'compras-orcamento',
    area: 'compras',
    rotas: ['compras/orcamento'],
    titulo: 'Orçamento de compra',
    versao: 4,
    // A loja que passou precisa ficar à vista: a aula abre numa linha (com a pergunta da 1ª vez, abre sozinha).
    recolhida: true,
    aula: [
      { texto: 'Quanto ainda dá para comprar neste período sem furar a meta do CMV, loja por loja.' },
      { texto: 'É um aviso, não um bloqueio: a nota que passa do orçamento é lançada igual, e a prévia da nota mostra quanto ela passa.' },
      { texto: 'Sem número, o motivo vem escrito: falta a meta do CMV ou faturamento lançado nas últimas 4 semanas.' },
      { texto: 'Cada nota é de uma loja e a sobra de uma não cobre a que passou; quem não vê o DRE vê o limite seguro, um valor aproximado e sempre para menos.' },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'A meta é a da loja: a própria, quando ela definiu a dela nas metas por categoria; senão, a da rede. Na rede com metas diferentes, o teto é a soma dos tetos das lojas.', para: ['dre.ver'] },
          { texto: 'O teto é a meta do CMV vezes a receita prevista do período. O que cabe é o teto menos o que a loja já comprou no período, pela data da nota, com o frete.', para: ['dre.ver'] },
          { texto: 'A receita prevista é o que a loja já vendeu nos dias com faturamento completo, mais cada dia que falta pela média do mesmo dia da semana nas últimas 4 semanas. Sábado entra como sábado, segunda como segunda.', para: ['dre.ver'] },
          { texto: 'Dia sem todos os canais lançados não conta como zero: entra pela média. Dia antes do primeiro lançamento da loja fica fora. Dia da semana sem nenhum dia completo nas 4 semanas conta só o que já foi lançado. Com menos de 14 dias completos, a loja fica sem número.', para: ['dre.ver'] },
          { texto: 'É a única tela que projeta: o DRE vai até ontem, sem projeção.', para: ['dre.ver'] },
          { texto: 'A rede só tem número quando cada loja ativa tem. Uma loja sem número deixa a rede sem número, com o nome dela, para o buraco de uma não ficar escondido atrás da outra.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'ritmo',
        titulo: 'O ritmo das compras',
        blocos: [
          { texto: 'O ritmo é o CMV pelas compras até ontem contra a meta, com o farol do DRE: as mesmas 5 faixas da linha do CMV. Comprar muito no começo do mês acende o farol mesmo cabendo no orçamento: o farol fala do ritmo, o orçamento fala do período.', para: ['dre.ver'] },
          { texto: 'Sem cor quando falta faturamento em algum dia do período, ou quando uma loja que vendeu ainda não tem nota.', para: ['dre.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'compras-relatorio-insumo',
    area: 'compras',
    rotas: ['compras/relatorios/insumo'],
    titulo: 'Histórico de um insumo',
    versao: 1,
    // A lista e os números precisam ficar à vista no celular: a aula abre numa linha.
    recolhida: true,
    aula: [
      { texto: 'Escolha um insumo e o período para ver o que você comprou dele, de quem, em que embalagem e a que preço.' },
      { texto: 'O preço médio é ponderado: o valor total dividido pelo total comprado. Não é a média dos preços das notas.' },
      { texto: 'Cada número abre as linhas que o formam, e cada linha abre a nota (e a nota fiscal, quando ela veio de XML).' },
    ],
    secoes: [
      {
        id: 'datas',
        titulo: 'A data e as lojas',
        blocos: [
          { texto: 'Em “Data usada” você escolhe: a entrada da nota, a emissão da nota fiscal (só as notas que vieram de XML têm) ou o dia em que a nota foi lançada no ERP, pelo relógio do Rio.' },
          { texto: 'Só aparecem as lojas do seu acesso. Para o mês inteiro, use “Este mês” ou “Mês passado”, ou digite do dia 1 ao último dia.' },
        ],
      },
      {
        id: 'sem-base',
        titulo: 'Quando o sistema não calcula',
        blocos: [
          { texto: 'Se a nota não guardou a unidade, ou o valor da linha é zero, a linha fica “sem base”: entra no dinheiro, mas fica fora do preço médio. Preço que não dá para calcular nunca vira R$ 0,00.' },
          { texto: 'kg, L e un nunca são somados num número só: cada unidade tem a sua linha.' },
          { texto: 'Nota cancelada não conta como compra. Nota fiscal que só chegou por XML e ainda não foi conferida também não.' },
        ],
      },
      {
        id: 'historico',
        titulo: 'O que mudou no cadastro',
        blocos: [{ texto: 'Quantidade, embalagem, valor e frete são os que foram gravados quando a nota foi lançada. Mudar o cadastro do insumo depois não muda compra antiga.' }],
      },
    ],
  },
  {
    chave: 'compras-relatorio-periodo',
    area: 'compras',
    rotas: ['compras/relatorios/periodo'],
    titulo: 'Compras do período',
    versao: 1,
    recolhida: true,
    aula: [
      { texto: 'Tudo o que foi comprado num dia ou período, nas lojas do seu acesso, com filtro por fornecedor, insumo e categoria.' },
      { texto: 'Agrupe por insumo, fornecedor ou dia. Cada grupo abre as compras dele, e cada compra abre a nota de origem.' },
      { texto: 'A planilha e a impressão saem com o mesmo período, a mesma data usada, as mesmas unidades e os mesmos totais da tela.' },
    ],
    secoes: [
      {
        id: 'saida',
        titulo: 'Planilha e PDF',
        blocos: [
          { texto: 'A planilha traz cada linha de compra, ou o resumo do agrupamento. Abre no Excel; texto que começaria com = + - ou @ ganha um apóstrofo na frente, para a planilha não tratar como fórmula.' },
          { texto: 'Imprimir abre uma versão sem menu. Na janela de impressão, escolha “Salvar como PDF”. Se as linhas não couberem numa folha, a página avisa e a planilha leva todas.' },
        ],
      },
      {
        id: 'datas',
        titulo: 'A data e as lojas',
        blocos: [
          { texto: 'A data usada vale para o filtro, os totais, a planilha e a impressão: entrada da nota, emissão da nota fiscal (só as de XML) ou o dia do lançamento no ERP, pelo relógio do Rio.' },
          { texto: 'Notas canceladas ficam fora dos totais e aparecem à parte. Nota fiscal que só aguarda conferência não é compra.' },
        ],
      },
      {
        id: 'preco',
        titulo: 'Preço médio',
        blocos: [
          { texto: 'O preço médio só aparece para um insumo por vez (agrupando por insumo, ou escolhendo um): kg de coisas diferentes não têm um preço só. Linha sem unidade ou sem valor fica “sem base” e fora da média.' },
          { texto: 'kg, L e un nunca se somam: cada unidade tem a sua linha.' },
        ],
      },
    ],
  },
  {
    chave: 'compras-comparar-fornecedores',
    area: 'compras',
    rotas: ['compras/relatorios/comparar-fornecedores'],
    titulo: 'Comparar fornecedores',
    versao: 1,
    recolhida: true,
    aula: [
      { texto: 'Escolha um insumo e o período para ver quem vende o mesmo insumo por menos, na mesma unidade (kg, litro ou unidade).' },
      { texto: 'Custo entregue é o preço do item mais a parte do frete que coube a ele, dividido pela quantidade: o que cada kg custou até chegar.' },
      { texto: 'O frete pode inverter a ordem. Por isso a tela diz quem é o mais barato no preço do item e quem é o mais barato entregue.' },
    ],
    secoes: [
      {
        id: 'embalagens',
        titulo: 'Embalagens e marca',
        blocos: [
          { texto: 'Peça de 2 kg, caixa e quilo solto entram na mesma conta pela unidade base do insumo. A conta usa o valor e o frete gravados em cada nota.' },
          { texto: 'A marca de referência é só uma informação do cadastro. A nota guarda a embalagem e o fornecedor, não a marca que veio, e nenhuma marca é barrada da comparação.' },
        ],
      },
      {
        id: 'sem-base',
        titulo: 'Quando o sistema não compara',
        blocos: [
          { texto: 'Linha sem unidade gravada ou com valor zero fica “sem base”: sai do preço, mas aparece contada. Preço que não dá para calcular nunca vira R$ 0,00.' },
          { texto: 'Com um fornecedor só não há com quem comparar. Fornecedor com uma compra só é avisado: pode não ser o preço de sempre dele.' },
          { texto: 'Nota cancelada não conta como compra. Nota fiscal que só chegou por XML e ainda não foi conferida também não.' },
        ],
      },
      {
        id: 'diferenca',
        titulo: 'A diferença não é economia',
        blocos: [{ texto: 'A diferença para o mais barato é por unidade. Ela só vale para o que você de fato compra de cada um: quantidade e data de cada compra mudam o preço, e a última compra de cada fornecedor está na tabela.' }],
      },
    ],
  },
  {
    chave: 'compras-comparar-periodos',
    area: 'compras',
    rotas: ['compras/relatorios/comparar-periodos'],
    titulo: 'Comparar períodos',
    versao: 1,
    recolhida: true,
    aula: [
      { texto: 'Escolha dois períodos: o A é a base e o B é o que você compara com ele. As lojas, o fornecedor, o insumo e a data usada valem para os dois.' },
      { texto: 'Efeito volume é quanto o gasto mudou por você ter comprado mais ou menos; efeito preço é quanto mudou porque cada unidade ficou mais cara ou mais barata. Os dois somados dão a variação.' },
    ],
    secoes: [
      {
        id: 'medida',
        titulo: 'Custo entregue ou preço do item',
        blocos: [{ texto: 'Custo entregue é o preço do item mais a parte do frete que coube a ele, dividido pela quantidade. Em “Medir o gasto por” você escolhe entre o custo entregue e o preço do item, e a tela usa a mesma escolha nos dois períodos.' }],
      },
      {
        id: 'fornecedor',
        titulo: 'Troca de fornecedor',
        blocos: [
          { texto: 'Dentro do efeito preço, a tela separa o que vem de um fornecedor mudar o próprio preço do que vem de trocar de fornecedor (ou comprar mais de um e menos de outro). Nada disso é chamado de inflação nem de economia.' },
          { texto: 'Escolha um insumo para ver os fornecedores lado a lado nos dois períodos.' },
        ],
      },
      {
        id: 'so-um-lado',
        titulo: 'Insumo que só aparece num período',
        blocos: [
          { texto: 'Sem compra do outro lado não há como separar preço de volume. O gasto do insumo aparece inteiro como “entrou” (só em B) ou “saiu” (só em A).' },
          { texto: 'Se nada foi comprado em A, o percentual de variação fica “sem base”: dividir por zero não é crescimento.' },
        ],
      },
      {
        id: 'cobertura',
        titulo: 'Quando falta dado',
        blocos: [
          { texto: 'Linha sem unidade, sem insumo ou com valor zero fica fora da conta e é contada à parte, com o dinheiro dela. A tela diz quanto do dinheiro de cada período a comparação cobre.' },
          { texto: 'Períodos de tamanhos diferentes, que se sobrepõem ou que ainda não terminaram também são avisados antes dos números.' },
          { texto: 'Cada gasto abre as compras que o formam, e cada compra abre a nota. Nota cancelada e nota fiscal ainda não conferida não entram.' },
        ],
      },
    ],
  },
  {
    // L.4: o consumo e a conciliação do estoque (a leitura do livro; nada aqui dá baixa).
    chave: 'estoque-consumo',
    area: 'estoque',
    rotas: ['estoque/relatorios/consumo', 'estoque/relatorios/consumo/movimentos'],
    titulo: 'Consumo e conciliação',
    versao: 1,
    recolhida: true,
    aula: [
      { texto: 'Mostra, para cada insumo e loja, o saldo inicial, o que entrou e saiu e o saldo final, lidos do livro do estoque, sem dar baixa nem lançar nada.' },
      { texto: '“Uso” é a requisição registrada, não o consumo medido na prateleira.' },
      { texto: 'A diferença da contagem entra como ajuste, nunca como consumo nem perda presumidos.' },
    ],
    secoes: [
      {
        id: 'ponte',
        titulo: 'Como a conta fecha',
        blocos: [
          { texto: 'Saldo final = saldo inicial + o que entrou − o que saiu, com cada movimento numa coluna só. A tela confere isso e avisa “A conta não fecha” se algo escapar.' },
          { texto: 'Cada número abre os movimentos que o formam, com a origem de cada um: nota, requisição, lote ou contagem.' },
          { texto: 'O consumo medido na prateleira é a conta da contagem: veja as Divergências, que cruzam a requisição com a contagem.' },
        ],
      },
      {
        id: 'bruto',
        titulo: 'Bruto, líquido e o que se desfaz',
        blocos: [{ texto: 'Compras e Uso são o bruto: o que foi lançado. Nota cancelada ou corrigida e lote desfeito ficam em Estornos; o que voltou de uma requisição fica em Devoluções. Líquido é o bruto mais o que foi desfeito.' }],
      },
      {
        id: 'lacunas',
        titulo: 'Quando falta conferir',
        blocos: [
          { texto: 'Sem contagem no período quer dizer que o saldo final é o do livro e ninguém o conferiu na prateleira. Saldo negativo, movimento sem origem e saldo que não bate com o livro pedem olhar.' },
          { texto: 'Nota fiscal que só chegou por XML e ainda não foi conferida fica fora: só entra no estoque quando vira nota lançada.' },
        ],
      },
      {
        id: 'ainda-nao',
        titulo: 'O que ainda não existe',
        blocos: [{ texto: 'Transferência entre lojas e lançamento de perda ainda não existem no sistema. O lugar delas já está aqui e fica vazio até existirem; nada é inventado.' }],
      },
      {
        id: 'datas',
        titulo: 'A data e o dinheiro',
        blocos: [
          { texto: 'A data de cada movimento é o dia em que ele entrou no livro, pelo relógio do Rio. Uma nota de dia 10 lançada no dia 12 entra no estoque no dia 12.' },
          { texto: 'Os valores em R$ são os que o livro gravou na hora de cada movimento: mudar o preço de um insumo depois não reescreve o passado. Insumo sem preço na época entra com valor zero e é avisado.', para: ['compras.ver'] },
        ],
      },
      {
        id: 'saida',
        titulo: 'Planilha e PDF',
        blocos: [
          { texto: 'A planilha traz as mesmas colunas da tela, uma linha por insumo e loja, e os totais por unidade. Texto que começaria com = + - ou @ ganha um apóstrofo na frente.' },
          { texto: 'Imprimir abre uma versão sem menu. Na janela de impressão, escolha “Salvar como PDF”.' },
        ],
      },
    ],
  },
  {
    chave: 'compra-nova',
    area: 'compras',
    rotas: ['compras/nova', 'compras/[id]/editar'],
    titulo: 'Lançar nota',
    // Decisões 523 e 275: prévia protegida; limpeza e descartáveis também entram no CMV gerencial.
    versao: 7,
    aula: [
      { texto: 'Digite o valor total de cada linha, como está na nota.' },
      { texto: 'O frete é dividido entre os itens, e a soma tem que bater com o total da nota.' },
      { texto: '“Conferir o impacto” mostra o que a nota faz antes de lançar, sem gravar nada: passar do orçamento de compra da loja é aviso, a nota entra igual.' },
      { texto: 'A data da nota decide o período dela: se o DRE já fechou esse período, a nota não entra nem se edita. É também essa data que põe a nota no CMV de compra do período.', para: ['compras.lancar'] },
      { texto: 'Lance também materiais de limpeza e descartáveis da operação como itens de compra: eles entram no CMV gerencial, na categoria do insumo. Não lance o pagamento da mesma nota como despesa, para não contar o custo duas vezes.', para: ['compras.lancar'] },
    ],
    secoes: [{
      id: 'depois-de-lancar',
      titulo: 'Depois de lançar',
      blocos: [
        { texto: 'Quem só lança não consulta, edita ou cancela notas já salvas, nem as próprias; depois de salvar, recebe a confirmação e pode lançar outra compra na mesma loja.' },
        { texto: 'Editar ou cancelar exige ver e lançar compras na loja; com esses dois acessos, salvar continua abrindo o detalhe da nota.' },
      ],
    }],
    // Decisão 522: o que cada campo muda no custo, no estoque e no DRE, junto do campo. Saíram do corpo e moram aqui: o "o custo
    // dos insumos passa a ser o desta compra" do cabeçalho e o "É ela que diz qual compra é a mais nova." da data (no `data`), o
    // "O preço por kg, L ou un sai da conta, com o frete rateado." dos itens (no `itens`) e o apoio do frete (no `frete`). Na ordem
    // da página. O exemplo em R$ é só de quem vê custo; o resto não diz valor nenhum.
    pontos: [
      {
        id: 'loja',
        titulo: 'Loja que recebeu',
        blocos: [
          { texto: 'Aparecem as lojas em que você pode lançar nota; loja desativada não recebe nota nova.' },
          // `efeitoDaNota`: a hora do lançamento conta, e editar não a muda (a nota antiga editada para esta loja não entra).
          { texto: 'A compra conta no CMV de compra e no orçamento de compra desta loja, e entra no estoque dela se ele já estava aberto quando a nota foi lançada e a data não é anterior à abertura.' },
          // `ultimasCompras` não filtra loja: a última nota de qualquer loja dá o custo de referência (fichas e preços).
          { texto: 'O custo do insumo que as fichas usam é um só na rede: vale a compra mais recente dele, de qualquer loja.' },
        ],
      },
      {
        id: 'data',
        titulo: 'O que a data da nota decide',
        blocos: [
          { texto: 'A data impressa na nota diz qual compra é a mais nova: o custo do insumo segue a de data mais recente e, na mesma data, a lançada por último.' },
          // `editarNota` confere a data de antes e a de depois: nem sair nem entrar num período fechado.
          { texto: 'Ela põe a nota num período do DRE e no CMV de compra dele; período já fechado não recebe nota nova nem nota com a data mudada para dentro dele, e as que caem nele não mudam.' },
          { texto: 'No estoque, a nota só entra se o estoque da loja já estava aberto quando ela foi lançada e a data não é anterior à abertura; editar não muda a hora do lançamento.' },
        ],
      },
      {
        id: 'itens',
        titulo: 'Embalagem, quantidade e valor',
        blocos: [
          { texto: 'Escolha a embalagem em que o insumo veio e diga quantas: 3 caixas de 5 kg viram 15 kg no estoque e na conta do custo; a granel, digite direto em kg, L ou un.' },
          { texto: 'O valor é o total da linha na nota; o preço por kg, L ou un sai da conta: o valor mais a parte do frete, dividido pela quantidade.' },
          { texto: 'Ex.: 3 caixas de 5 kg por R$ 269,70, sem frete, dão R$ 17,98 por kg.', para: ['compras.ver'] },
        ],
      },
      {
        id: 'frete',
        titulo: 'Frete e total',
        blocos: [
          { texto: 'O frete é dividido entre os itens pelo valor de cada um e entra no custo deles e no CMV de compra.' },
          { texto: 'O total da nota tem que ser igual aos itens mais o frete, ao centavo: se não bater, a nota não entra.' },
        ],
      },
    ],
  },
  {
    chave: 'compra',
    area: 'compras',
    rotas: ['compras/[id]'],
    titulo: 'Detalhe da nota',
    // Decisão 523 (versão 6): editar ou cancelar só muda o custo onde a nota é (ou era) a compra mais recente do insumo.
    versao: 7,
    aula: [
      { texto: 'A nota, o frete de cada item e o que ela fez no estoque.' },
      { texto: 'Nota que veio do XML da nota fiscal não se edita: cancele e concilie a nota fiscal de novo.', para: ['compras.lancar'] },
      { texto: 'Nota do período em curso mostra como ficou o orçamento de compra da loja: quanto ainda cabe, ou quanto passou. É só aviso.' },
      { texto: 'Com acesso para ver e lançar compras na loja, você pode editar ou cancelar com o motivo: o que a nota pôs no estoque é corrigido por estorno, e o custo só muda nos insumos em que ela é ou era a compra mais recente.', para: ['compras.lancar'] },
      { texto: 'Nota com data em período que o DRE já fechou não se edita nem se cancela.', para: ['compras.lancar'] },
    ],
    secoes: [
      {
        id: 'lotes',
        titulo: 'Lote e vencimento',
        blocos: [{ texto: 'O lote e o vencimento de cada insumo, como vieram na embalagem, ficam em Lote e vencimento. A cozinha escolhe o lote daqui ao abrir a embalagem, e a etiqueta usa o vencimento dele.' }],
      },
    ],
    // Decisão 522: o que a nota fez no custo, no DRE e no estoque. Saíram do corpo e moram aqui: "O frete foi dividido entre os
    // itens pelo valor de cada um e entra no custo." do Total (no `total`) e o subtítulo "Entrada e estorno, nunca apagados" de No
    // estoque (no `estoque`, que só aparece com movimento). Na ordem da página. Quem só vê recebe tudo, menos o que editar e
    // cancelar fazem no custo, que é de quem lança.
    pontos: [
      {
        id: 'total',
        titulo: 'Frete, período e CMV de compra',
        blocos: [
          { texto: 'Quando há frete, ele é dividido entre os itens pelo valor de cada um e entra no custo deles.' },
          { texto: 'Pela data da nota, a compra conta no CMV de compra e no orçamento de compra da loja, no período em que ela cai.' },
          { texto: 'Nota cancelada sai do custo, do CMV de compra e do orçamento.' },
        ],
      },
      {
        id: 'custo',
        titulo: 'Custo por unidade e o que vale',
        blocos: [
          { texto: 'Custo por unidade é o valor do item mais a parte do frete, dividido pela quantidade na unidade do insumo.' },
          // `valeNoCusto`/`valeOutra` em `obterNota`: a última compra da rede (`ultimasCompras`), de qualquer loja.
          { texto: 'Vale no custo a compra mais recente do insumo pela data da nota, de qualquer loja da rede, e é esse custo que as fichas usam; se há uma mais nova, a linha diz a data dela só quando seu acesso inclui essa compra.' },
          { texto: 'Editar ou cancelar a nota que vale refaz o custo: cancelada, volta a valer a compra anterior ou, sem ela, o preço do cadastro.', para: ['compras.lancar'] },
        ],
      },
      {
        // Só com movimento no estoque (o painel "No estoque" só aparece com ele).
        id: 'estoque',
        titulo: 'Entrada e estorno no estoque',
        blocos: [
          { texto: 'A nota entra no estoque da loja se o estoque dela já estava aberto quando a nota foi lançada e a data não é anterior à abertura.' },
          // `aplicarNotaNoEstoque`: estorna o que valia e só lança o novo se `efeitoDaNota` ainda deixa (data antes da abertura = só o estorno).
          { texto: 'Nada é apagado: quando a edição muda o que entrou, a entrada antiga é estornada e a nova só entra se a nota ainda cumprir essa regra; cancelar estorna o que a nota tinha posto.' },
          { texto: 'Cada linha mostra o saldo do insumo na loja antes e depois do movimento.' },
        ],
      },
    ],
  },
  {
    chave: 'fornecedores',
    area: 'compras',
    rotas: ['compras/fornecedores'],
    titulo: 'Fornecedores',
    versao: 3,
    aula: [
      { texto: 'Quem vende para a casa e o último preço de cada insumo.' },
      { texto: 'Selo A completar mostra o que falta no cadastro (e-mail, WhatsApp, razão social, CNPJ): abra e complete, e as notas dele continuam valendo.' },
      { texto: 'Documento a conferir é CNPJ ou CPF gravado com número errado.' },
      { texto: 'Os contatos são só para consulta: o sistema não manda mensagem a eles sozinho.' },
    ],
  },
  {
    chave: 'fornecedor-novo',
    area: 'compras',
    rotas: ['compras/fornecedores/novo', 'compras/fornecedores/[id]/editar'],
    titulo: 'Cadastrar fornecedor',
    versao: 2,
    aula: [
      { texto: 'Obrigatório: nome fantasia, razão social, CNPJ ou CPF, e-mail e WhatsApp com DDD. O CNPJ não repete; filial tem outro CNPJ e é outro cadastro.' },
      { texto: 'Feira ou atacarejo sem nota: marque Compras sem nota fiscal e informe só o nome e o WhatsApp.' },
    ],
  },
  {
    chave: 'fornecedor',
    area: 'compras',
    rotas: ['compras/fornecedores/[id]'],
    titulo: 'Detalhe do fornecedor',
    versao: 3,
    aula: [
      { texto: 'O cadastro, o que esse fornecedor já vendeu, com o último preço de cada insumo, e as últimas notas das lojas que você vê.' },
      { texto: 'Fornecedor que chega por uma nota fiscal nasce com os dados da nota e fica a completar.' },
      { texto: 'Cadastro a completar mostra o que falta. Outro cadastro com a mesma raiz de CNPJ aparece como outro estabelecimento da mesma empresa: nada é unido.' },
    ],
  },
  {
    chave: 'compras-documentos',
    area: 'compras',
    rotas: ['compras/recebidas'],
    titulo: 'Notas recebidas',
    versao: 2,
    aula: [
      { texto: 'As notas fiscais que chegaram por XML (o arquivo da nota que o fornecedor manda) e esperam a sua conferência.' },
      { texto: 'Receber a nota não lança nada: o custo e o estoque só mudam depois que você confere os itens e concilia.' },
      { texto: 'A mesma nota fiscal não entra duas vezes: a chave de acesso, o número de 44 dígitos dela, é a prova.' },
    ],
    pontos: [
      {
        id: 'xml',
        titulo: 'De onde vêm estas notas',
        blocos: [{ texto: 'Cada nota veio de um arquivo XML, o arquivo da nota fiscal que o fornecedor manda por e-mail (não é o PDF). A chave de acesso é o número de 44 dígitos da nota; por ele, a mesma nota não entra duas vezes.' }],
      },
    ],
  },
  {
    chave: 'compras-documento-importar',
    area: 'compras',
    rotas: ['compras/recebidas/importar'],
    titulo: 'Importar XML',
    versao: 2,
    aula: [
      { texto: 'Envie o arquivo .xml que o fornecedor mandou com a nota, não o PDF.' },
      { texto: 'O sistema só lê o arquivo: não pede senha, certificado nem acesso ao site do governo que autoriza as notas.' },
      { texto: 'Nota de outra empresa, cupom fiscal, nota sem autorização e arquivo grande demais são recusados, com o motivo.' },
    ],
    pontos: [
      {
        id: 'sefaz',
        titulo: 'O que é conferido',
        blocos: [{ texto: 'Só o arquivo é pedido: nada de senha, certificado ou acesso ao site do governo que autoriza as notas (a SEFAZ). A assinatura digital da nota não é conferida aqui.' }],
      },
    ],
  },
  {
    chave: 'compras-documento',
    area: 'compras',
    rotas: ['compras/recebidas/[id]'],
    titulo: 'Conferir a nota',
    versao: 1,
    aula: [
      { texto: 'Para cada item, escolha o insumo, a embalagem e quantas embalagens vêm em uma unidade da nota: 1 caixa de 10 pacotes é fator 10.' },
      { texto: 'O que você escolhe fica lembrado para este fornecedor: na próxima nota o item já vem pronto.' },
      { texto: 'Conciliar lança a nota de compra: cada item entra pelo valor que você paga, o frete é dividido e o total tem que fechar ao centavo.' },
      { texto: 'Já lançou esta nota à mão? Use Ligar a esta nota: nada é lançado de novo.', para: ['compras.lancar'] },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'O que vale e o que não vale',
        blocos: [
          { texto: 'O valor de cada item é o da nota menos o desconto, mais seguro, outras despesas, IPI e imposto retido, porque custo é o que se paga.' },
          { texto: 'A assinatura digital da nota não é conferida: confira os itens e os valores antes de conciliar.' },
          { texto: 'Mudar o que o sistema lembra de um item pede acesso a editar fornecedores e não altera notas já conciliadas.', para: ['fornecedores.editar'] },
        ],
      },
    ],
  },
  {
    chave: 'estoque',
    area: 'estoque',
    rotas: ['estoque'],
    titulo: 'Estoque: visão geral',
    versao: 1,
    aula: [
      { texto: 'Cada loja e a situação do estoque dela: não aberto, em contagem ou aberto.' },
      { texto: 'Depois de aberto, nota lançada e requisição mexem no saldo sozinhas.' },
    ],
    secoes: [
      {
        id: 'abertura',
        titulo: 'Como abre o estoque de uma loja',
        blocos: [
          { texto: '1. Contar. Quem conta abre a lista no celular e digita o que tem: caixas fechadas e o solto. Salva sozinho, e dá para contar em várias vezes e com várias pessoas.' },
          { texto: '2. Conferir. O gerente vê o que falta, o que deu zero e o valor do estoque pelo custo de referência.' },
          { texto: '3. Concluir. A contagem vira o saldo inicial. Daí em diante, nota lançada na loja entra no estoque na hora.' },
        ],
      },
    ],
  },
  {
    chave: 'estoque-contagens',
    area: 'estoque',
    rotas: ['estoque/contagens'],
    titulo: 'Contagens',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver a contagem dela: cobertura do período, contagens abertas e fechamento.' },
      { texto: 'Com uma loja só no seu acesso, você já cai no período dela.' },
    ],
  },
  {
    chave: 'estoque-loja',
    area: 'estoque',
    rotas: ['estoque/[lojaId]'],
    titulo: 'Estoque da loja',
    versao: 2,
    aula: [
      { texto: 'O saldo de cada insumo na loja e o livro de tudo o que entrou e saiu.' },
      { texto: 'O valor sai do custo de referência de hoje.', para: ['compras.ver'] },
      { texto: 'Planeje a contagem do dia a dia e acompanhe se o período chega ao piso. “Recontar” corrige um número que ficou errado.', para: ['estoque.ajustar'] },
    ],
  },
  {
    chave: 'estoque-abertura',
    recolhida: true,
    area: 'estoque',
    rotas: ['estoque/[lojaId]/abertura'],
    titulo: 'Contagem de abertura',
    versao: 1,
    aula: [
      { texto: 'Conte o que tem na loja agora. Caixa fechada vai em embalagens; o aberto, no solto.' },
      { texto: 'Deixe vazio o que ainda não contou; o que não tem, marque “Não tem”.' },
      { texto: 'A tela salva sozinha, até sem sinal.' },
    ],
  },
  {
    chave: 'estoque-abertura-conferir',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/abertura/conferir'],
    titulo: 'Conferir a abertura',
    versao: 2,
    aula: [
      { texto: 'O que falta contar e o que deu zero.' },
      { texto: 'O valor do estoque inicial fica fotografado na abertura.', para: ['compras.ver'] },
      { texto: 'Concluir transforma a contagem no saldo inicial e não se desfaz. Correção depois é uma contagem nova.' },
    ],
  },
  {
    chave: 'contagem-nova',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/nova'],
    titulo: 'Planejar a contagem',
    versao: 2,
    aula: [
      { texto: 'Escolha o lugar e marque os insumos para contar, um a um ou o lugar todo.' },
      { texto: 'Com acesso a compras na loja, os filtros por valor e frequência também ficam disponíveis.', para: ['compras.ver'] },
      { texto: 'Um pedaço por vez. Um insumo só entra em uma contagem aberta.' },
    ],
  },
  {
    chave: 'contagem',
    recolhida: true,
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/[contagemId]'],
    titulo: 'Contagem',
    versao: 1,
    aula: [
      { texto: 'Conte o que tem agora. O número é comparado com o que o livro dizia na hora em que você contou; nota que chegar depois continua no estoque.' },
      { texto: 'Se tudo bater, a contagem fecha sozinha.' },
      { texto: 'No fechamento do período, conte o que falta: os marcados “para o piso” são os mais caros e levam a cobertura ao mínimo.' },
    ],
  },
  {
    chave: 'contagem-conferir',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/[contagemId]/conferir'],
    titulo: 'Conferir a contagem',
    versao: 1,
    aula: [
      { texto: 'O contado contra o que o livro dizia, em quilo e em reais. Perda aparece em vermelho e sobra em verde.' },
      { texto: 'Aplicar acerta o saldo. O fechamento do período só aplica com a cobertura no piso.' },
    ],
  },
  {
    chave: 'periodo',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/periodo'],
    titulo: 'Período e contagens',
    versao: 5,
    aula: [
      { texto: 'Quanto do estoque foi contado no período, por valor e por itens. O período é o mesmo do DRE: mensal, quinzenal ou semanal, definido em Períodos, na área Faturamento e DRE.' },
      { texto: 'O fechamento só vale com a cobertura acima do piso da loja.' },
      { texto: 'Depois que o DRE fecha o período, o fechamento do estoque dele não começa nem se aplica mais, mas descartar um em andamento continua valendo.' },
      { texto: 'As regras da contagem (piso, frequência, tolerância) ficam aqui; só quem cadastra lojas muda.', para: ['lojas.gerir'] },
    ],
    secoes: [
      {
        id: 'cmv-real',
        titulo: 'O fechamento e o CMV real',
        blocos: [
          { texto: 'O valor do fechamento é o estoque final do período e vira o estoque inicial do seguinte: é a base do CMV real no DRE.' },
          { texto: 'Ao aplicar, o sistema também guarda o estoque insumo por insumo, com a categoria de cada um naquele dia. É o que vai abrir o CMV real por categoria; fechamento de antes não tem e não é reconstruído.' },
          { texto: 'Contar depois do fim do período não estraga a conta: o que entrou ou saiu entre o fim e a contagem é separado pela data. Insumo sem preço entra com zero, e o DRE avisa quantos são.' },
        ],
      },
    ],
  },
  {
    chave: 'requisicoes',
    area: 'estoque',
    rotas: ['estoque/requisicoes', 'estoque/[lojaId]/requisicoes'],
    titulo: 'Requisições',
    versao: 2,
    aula: [
      { texto: 'O setor pede, o estoque entrega e o saldo baixa na entrega.' },
      { texto: 'Pedido atrasado ganha uma faixa vermelha.' },
    ],
    pontos: [
      {
        id: 'fluxo',
        titulo: 'Como a requisição anda',
        blocos: [{ texto: 'O setor pede; o estoque entrega e dá baixa no livro, item a item. O que sai em parte fica em “atendidas em parte” até sair o resto ou alguém encerrar.' }],
      },
    ],
  },
  {
    chave: 'requisicao-nova',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/nova'],
    titulo: 'Nova requisição',
    versao: 1,
    aula: [
      { texto: 'Diga o setor, para quando e o que precisa.' },
      { texto: 'Vai produzir uma receita? “Puxar de uma ficha técnica” já traz os insumos.' },
    ],
  },
  {
    chave: 'requisicao',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/[requisicaoId]'],
    titulo: 'Detalhe da requisição',
    versao: 2,
    aula: [
      { texto: 'O pedido, o que saiu, o que voltou e o que falta.' },
      { texto: 'Sobrou? “Receber de volta” devolve ao estoque.', para: ['requisicao.atender'] },
      { texto: 'Requisição de produção diz de qual lote é. Ela só se cancela pelo lote, e quando o lote é concluído o custo fecha: não há mais entrega nem devolução.' },
    ],
  },
  {
    chave: 'requisicao-atender',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/[requisicaoId]/atender'],
    titulo: 'Entregar a requisição',
    versao: 1,
    aula: [
      { texto: 'Entregue o que está saindo; pode ser em partes.' },
      { texto: 'Se o livro diz que não tem mas o produto está aí, confirme: o saldo negativo vira alerta nas divergências.' },
    ],
  },
  {
    chave: 'divergencias',
    area: 'estoque',
    rotas: ['estoque/divergencias', 'estoque/[lojaId]/divergencias'],
    titulo: 'Divergências',
    versao: 2,
    aula: [
      { texto: 'O que a contagem acusa sem requisição, em quantidades.' },
      { texto: 'Com acesso a compras na loja, você também vê valores, prioridade por custo e diferenças pequenas que se repetem.', para: ['compras.ver'] },
      { texto: 'Por setor mostra os insumos que cada equipe pediu; confira a diferença antes de tirar conclusões.' },
    ],
    pontos: [
      {
        id: 'conta',
        titulo: 'Como a divergência é calculada',
        blocos: [{ texto: 'Entre duas contagens, o que havia mais o que entrou menos o que sobrou é o que foi consumido. O consumido sem requisição nem perda lançada aparece como sumiço. Pode ser consumo sem pedido, entrega sem baixa, perda ou contagem errada: confira antes de concluir.' }],
      },
    ],
  },
  {
    chave: 'faturamento',
    area: 'dre',
    rotas: ['faturamento'],
    titulo: 'Faturamento',
    versao: 2,
    aula: [
      { texto: 'Quanto cada loja vendeu em cada canal, dia a dia: faturamento, pedidos e clientes atendidos.' },
      { texto: 'O ticket médio é o faturamento dividido pelos pedidos, refeito na hora. Canal que a loja vende e ficou sem lançamento aparece como falta.' },
      { texto: 'Conta a venda dos produtos dos pedidos concluídos, sem a taxa de entrega e já sem o desconto que a casa pagou.' },
      { texto: 'Lance o dia em Lançar o dia, ou várias datas de uma vez em Importar planilha. Dia em que a loja não vendeu leva 0, não fica em branco.', para: ['faturamento.lancar'] },
    ],
    secoes: [
      {
        id: 'o-numero',
        titulo: 'O que entra no número',
        blocos: [
          { texto: 'Entra a venda dos produtos dos pedidos concluídos no dia, depois de tirar o desconto ou cupom que a casa pagou.' },
          { texto: 'Não entra taxa de entrega cobrada do cliente, gorjeta, 10 % de serviço nem pedido cancelado.' },
          { texto: 'No iFood, use o total dos itens menos o incentivo que a loja bancou. A comissão do iFood entra depois, no resultado.' },
          { texto: 'Clientes são atendimentos do dia, não pessoas diferentes. Na digitação e na planilha, em branco vale o número de pedidos. Ausência na integração fica Sem dado, a menos que a casa tenha informado clientes no mesmo dia e canal.' },
        ],
      },
      {
        id: 'falta',
        titulo: 'Falta não é zero',
        blocos: [
          { texto: 'Falta é canal que a loja vende, sem lançamento, desde que ela começou a lançar até ontem. Hoje ainda está em aberto.' },
          { texto: 'Dia em que a loja não vendeu conta como lançado: marque Não vendeu e o canal fecha com zero.' },
          { texto: 'Unidade que só faz delivery: tire a Loja dos canais dela em Lojas e marcas, e a falta de salão para de aparecer.', para: ['lojas.gerir'] },
        ],
      },
    ],
    // Decisão 519: o texto educativo dos subtítulos e do rodapé do mês saiu do corpo e mora nestes cards (na ordem da página).
    pontos: [
      {
        // Só com a volta da Home conferida (decisão 518): sem ela, o botão nem aparece.
        id: 'volta',
        titulo: 'Voltar para o início',
        blocos: [
          { texto: 'Voltar para o início lê o resumo de novo, na loja ou na rede escolhida no alto.' },
          { texto: 'O aviso de lançamentos faltando só sai de lá quando a nova consulta ao faturamento não encontrar mais falta: abrir, voltar ou só olhar não resolve.' },
        ],
      },
      {
        id: 'numeros',
        titulo: 'Faturamento, pedidos e clientes',
        blocos: [
          { texto: 'Não entram taxa de entrega, gorjeta, 10 % de serviço nem pedido cancelado.' },
          { texto: 'Clientes são atendimentos, não pessoas diferentes.' },
          { texto: 'O ticket médio é o faturamento dividido pelos pedidos, refeito na hora: é a conta, não um número lançado.' },
        ],
        secao: 'o-numero',
      },
      {
        id: 'falta',
        titulo: 'O que conta como falta',
        blocos: [
          { texto: 'Falta é cada canal que a loja vende e ficou sem lançamento num dia, de quando ela começou a lançar até ontem: dois canais no mesmo dia são duas faltas.' },
          { texto: 'Hoje ainda está em aberto, e Não vendeu é lançamento com zero, não falta.' },
          { texto: 'Para tirar a falta, abra o dia com falta e lance o canal; se ele não vendeu, marque Não vendeu.', para: ['faturamento.lancar'] },
        ],
        secao: 'falta',
      },
      {
        // Só no mês que tem número de integração.
        id: 'integracao',
        titulo: 'Integração e o que a casa digitou',
        blocos: [{ texto: 'Faturamento e pedidos usam a integração; os valores digitados ficam como conferência na tela do dia. Se a integração não informa clientes atendidos, vale o lançamento da casa, quando existir; sem ele, fica Sem dado.' }],
      },
    ],
  },
  {
    chave: 'faturamento-lancar',
    area: 'dre',
    rotas: ['faturamento/lancar'],
    titulo: 'Lançar o dia',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja e a data, que começa em hoje. Com uma loja só no seu acesso, você já cai no dia dela.' },
      { texto: 'Só dá para lançar até hoje e até três anos para trás.' },
    ],
    // Decisão 519: o que a aula não diz, junto de cada campo.
    pontos: [
      {
        id: 'loja',
        titulo: 'Quais lojas aparecem',
        blocos: [{ texto: 'Aparecem as lojas ativas em que você pode lançar faturamento. Loja desativada não recebe lançamento novo, mas os dias antigos dela continuam no mês.' }],
      },
      {
        id: 'data',
        titulo: 'Qual dia lançar',
        blocos: [
          { texto: 'A data começa em hoje, que ainda está em aberto: o dia só conta como falta depois que passa.' },
          { texto: 'Dia de período fechado do DRE abre só para consulta, sem lançar nem corrigir.' },
        ],
      },
      {
        id: 'atalhos',
        titulo: 'Ontem e hoje',
        blocos: [{ texto: 'Cada atalho abre o dia da loja direto, com um bloco para cada canal que ela vende. Depois que a loja começou a lançar, ontem já conta como falta se algum canal ficou sem lançamento; hoje ainda está em aberto.' }],
      },
    ],
  },
  {
    chave: 'faturamento-dia',
    area: 'dre',
    rotas: ['faturamento/[lojaId]/[data]'],
    titulo: 'Faturamento do dia',
    versao: 7,
    // Tela de lançar no celular: os campos ficam à vista, a aula abre numa linha (como nas telas de contar).
    recolhida: true,
    aula: [
      { texto: 'Um bloco por canal da loja, com faturamento, pedidos e clientes; o que ficar em branco continua sem lançamento.' },
      { texto: 'Canal que não vendeu leva Não vendeu e grava zero.' },
      { texto: 'Clientes em branco vale o número de pedidos. O ticket médio sai da conta, não é digitado.' },
      { texto: 'Errou? Salve de novo com o número certo: o antes e o depois ficam guardados. Lançamento do dia ou da loja errada sai com Remover, e o motivo é obrigatório.', para: ['faturamento.lancar'] },
    ],
    secoes: [
      {
        id: 'periodo-fechado',
        titulo: 'Dia de período fechado',
        blocos: [
          { texto: 'Quando o período do resultado é fechado, os dias dele não aceitam mais lançar, corrigir nem remover. Onde o período começa e termina fica em Períodos, na área Faturamento e DRE. Para mexer num dia fechado, peça à FlowFoods para reabrir o período: a tela já diz isso.' },
        ],
      },
      {
        id: 'origem-ifood',
        titulo: 'Origem dos valores do iFood',
        blocos: [{ texto: 'Quando há aplicação do iFood Analytics, o selo informa quando ela entrou no faturamento. Uma atualização pendente preserva a aplicação anterior.' }],
      },
    ],
    // Decisão 519: os cards ficam fora do bloco que trava no dia só de consulta, para abrirem também para quem só vê.
    pontos: [
      {
        // Só no dia de período fechado, logo abaixo do aviso.
        id: 'periodo-fechado',
        titulo: 'Por que este dia não aceita lançamento',
        blocos: [{ texto: 'Fechar o período guarda uma fotografia do DRE daqueles dias. Enquanto o período estiver fechado, o faturamento dessas datas não muda: lançar, corrigir ou remover aqui mudaria um resultado já fechado.' }],
        secao: 'periodo-fechado',
      },
      {
        id: 'numeros',
        titulo: 'Faturamento, pedidos e clientes do canal',
        blocos: [
          { texto: 'Faturamento é a venda dos produtos dos pedidos concluídos no dia, já sem o desconto que a casa pagou; não entram taxa de entrega, gorjeta, 10 % de serviço nem pedido cancelado.' },
          { texto: 'No iFood, entra o total dos itens menos o incentivo que a loja bancou; a comissão do iFood entra depois, no resultado.' },
          { texto: 'Clientes são atendimentos, não pessoas diferentes; se a integração não os informa, vale o lançamento da casa; sem ele ou após removê-lo, fica Sem dado.' },
        ],
      },
      {
        id: 'nao-vendeu',
        titulo: 'Não vendeu ou em branco',
        blocos: [
          { texto: 'Não vendeu conta como lançado: o canal fecha o dia com zero e sai da falta.' },
          { texto: 'Em branco, o canal continua sem lançamento e, depois que a loja começou a lançar, aparece como falta no mês; hoje ainda está em aberto.' },
        ],
      },
      {
        // O subtítulo do painel "Lançou no dia ou na loja errada?" (só aparece para quem lança).
        id: 'remover',
        titulo: 'Corrigir ou remover',
        blocos: [
          { texto: 'Para corrigir um número, é só salvar o dia de novo: o antes e o depois ficam em Alterações deste dia.', para: ['faturamento.lancar'] },
          { texto: 'Remover serve para o que não deveria existir, como o lançamento no dia ou na loja errada, e pede o motivo.', para: ['faturamento.lancar'] },
        ],
      },
    ],
  },
  {
    chave: 'faturamento-importar',
    area: 'dre',
    rotas: ['faturamento/importar'],
    titulo: 'Importar planilha de faturamento',
    versao: 1,
    aula: [
      { texto: 'Baixe o modelo, preencha uma linha por loja, canal e dia e envie o arquivo. Antes de gravar você vê a prévia, linha a linha.' },
      { texto: 'Mandar a mesma planilha de novo não duplica nada: o dia é o mesmo, e só é corrigido se o número mudou.' },
    ],
    secoes: [
      {
        id: 'colunas',
        titulo: 'As colunas do modelo',
        blocos: [
          { texto: 'data (dd/mm/aaaa), loja (o nome do cadastro), canal (loja, delivery ou ifood), faturamento (4.350,00), pedidos e clientes.' },
          { texto: 'Dia sem venda: faturamento 0 e pedidos 0. Clientes pode ficar em branco.' },
          { texto: 'Use ponto e vírgula entre as colunas. Linha com erro fica de fora e diz o motivo; as outras entram.' },
          { texto: 'Célula que começa com = + - ou @ é recusada: cole só o valor, sem fórmula.' },
        ],
      },
    ],
    pontos: [
      {
        id: 'arquivo',
        titulo: 'Como montar o arquivo',
        blocos: [{ texto: 'Separe as colunas com ponto e vírgula, porque a vírgula é o decimal do Brasil. Abre no Excel ou no Google Planilhas; salve como CSV. Célula que começa com =, +, - ou @ é recusada.' }],
        secao: 'colunas',
      },
    ],
  },
  {
    chave: 'lojas',
    area: 'rede',
    rotas: ['lojas'],
    titulo: 'Lojas e marcas',
    versao: 3,
    aula: [
      { texto: 'As lojas e as marcas do grupo. Estoque, compras, contagem e faturamento são sempre de uma loja.' },
      { texto: 'Cadastrar loja ou marca é com quem tem a rede inteira.', para: ['lojas.gerir'] },
      { texto: 'O CNPJ da loja é quem recebe as notas fiscais de compra. Informe em CNPJ da loja, na linha dela; duas lojas da mesma empresa podem ter o mesmo.', para: ['lojas.gerir'] },
      { texto: 'Cada loja mostra em quais canais vende. Para mudar, abra Canais de venda na linha dela.', para: ['lojas.gerir'] },
    ],
  },
  {
    chave: 'integracoes',
    area: 'rede',
    rotas: ['integracoes'],
    titulo: 'Integrações',
    versao: 5,
    aula: [
      { texto: 'Escolha a loja e um dia até ontem para conferir o acesso, a tentativa de leitura, a versão disponível e a aplicação no faturamento.' },
      { texto: 'Aqui só se consulta: ligar e ativar é com a FlowFoods.' },
      { texto: 'Acesso ativo não confirma leitura nem aplicação.' },
      { texto: 'A faixa Ambiente de teste identifica dados de teste, que não entram no faturamento.' },
      { texto: 'Com acesso também ao Faturamento, abra o Painel iFood por período para consultar os indicadores da loja.', para: ['faturamento.ver'] },
    ],
    secoes: [
      {
        id: 'acesso-e-leitura',
        titulo: 'Acesso, datas e atualizações',
        blocos: [
          { texto: 'Esperando a loja aprovar quer dizer que quem administra a loja no Portal do Parceiro do iFood precisa aprovar o app da FlowFoods, na parte de integrações e aplicativos do portal.' },
          { texto: 'As datas são mostradas separadamente, no horário de Brasília; uma espera informa o limite mínimo, sem garantir a hora da próxima tentativa.' },
          { texto: 'Se uma atualização fica pendente, a aplicação anterior permanece identificada. Sem leitura disponível não significa que a loja não vendeu.' },
          { texto: 'Os detalhes de aplicação não substituem os números da tela Faturamento.' },
        ],
      },
    ],
  },
  {
    chave: 'integracoes-analytics',
    area: 'rede',
    rotas: ['integracoes/analytics'],
    titulo: 'Painel iFood',
    versao: 1,
    aula: [
      { texto: 'Escolha uma loja, as fontes e um período até ontem; sem datas, são consultados os últimos 30 dias.' },
      { texto: 'Os valores mostram vendas informadas pelo iFood, não repasse nem lucro.' },
      { texto: 'Totais do período exigem leitura de todas as fontes selecionadas em cada dia; os dias completos continuam disponíveis na série.' },
      { texto: 'Falta de leitura não equivale a zero.' },
    ],
    secoes: [
      {
        id: 'indicadores',
        titulo: 'Como ler os indicadores',
        blocos: [
          { texto: 'O GMV de todos os status inclui cancelados. O ticket usa somente o GMV e os pedidos concluídos.' },
          { texto: 'A taxa divide os cancelados pelo total observado; status não classificados deixam essa taxa sem dado.' },
          { texto: 'Canal, status e logística descrevem os mesmos pedidos em distribuições separadas. A distribuição por pagamento ainda está indisponível.' },
        ],
      },
    ],
  },
  {
    chave: 'equipe',
    area: 'rede',
    rotas: ['equipe'],
    titulo: 'Equipe',
    versao: 1,
    aula: [
      { texto: 'Quem entra, com que perfil e em quais lojas.' },
      { texto: 'O setor só organiza, não dá acesso. O link de primeiro acesso aparece uma vez: copie ou mande no WhatsApp.' },
    ],
  },
  {
    chave: 'historico',
    area: 'rede',
    rotas: ['historico'],
    titulo: 'Histórico',
    versao: 1,
    aula: [
      { texto: 'Toda mudança, com quem fez, quando e o antes e o depois.' },
      { texto: 'Nada aqui se apaga.' },
    ],
  },
  {
    chave: 'cadastro-do-parceiro',
    area: 'rede',
    rotas: ['cadastro'],
    titulo: 'Cadastro do parceiro',
    versao: 1,
    soNivel1: true,
    aula: [
      { texto: 'Nome e situação do parceiro.' },
      { texto: 'Suspender pede o motivo. Parceiro suspenso entra no ERP e só consulta.' },
    ],
  },
  {
    chave: 'custo-medio',
    area: 'rede',
    rotas: ['custo-medio'],
    titulo: 'Custo médio por loja',
    versao: 2,
    soNivel1: true,
    aula: [
      { texto: 'Cada loja usa a referência da rede até o custo médio ser ligado aqui. Depois, o estoque e o CMV real seguem o valor acumulado na própria loja; as fichas e os preços sugeridos continuam pela referência da rede.' },
      { texto: 'Leia o impacto antes: o valor do livro, o valor pela regra antiga e a diferença de base, que fica guardada na troca.' },
      { texto: 'Vale daqui para a frente, sem volta, e nada já gravado muda.' },
    ],
  },
  {
    chave: 'dre',
    area: 'dre',
    rotas: ['dre'],
    titulo: 'DRE',
    versao: 10,
    // A tela da reunião: a tabela fica à vista e a aula abre numa linha.
    recolhida: true,
    aula: [
      { texto: 'O resultado da casa no período: o que entrou, o que saiu e o que sobrou, com o peso de cada linha na receita bruta, até ontem no período em curso.' },
      { texto: 'Com meta definida, a linha mostra o desvio e o farol, uma de 5 faixas de bem melhor a muito pior que a meta, igual na rede e em cada loja.', para: ['dre.ver'] },
      { texto: 'Período fechado mostra a fotografia do fechamento, que nunca muda.' },
      { texto: 'A loja que definiu a própria meta do CMV a vê na linha do CMV dela; a rede segue a meta da rede.', para: ['dre.ver'] },
      { texto: 'O CMV gerencial inclui ingredientes, embalagens, limpeza e descartáveis: no período em curso mostra as compras até ontem; com o período terminado e os estoques de abertura e fechamento apurados, mostra o consumo real.' },
    ],
    secoes: [
      {
        id: 'rede-e-loja',
        titulo: 'Rede e loja',
        blocos: [
          { texto: 'A rede soma as lojas e as despesas da rede; a loja mostra só o que é dela, antes das despesas da rede.' },
          { texto: 'No período em curso o número vai até ontem, sem projeção, e a despesa entra dia a dia.' },
        ],
      },
      {
        id: 'de-onde-vem',
        titulo: 'De onde vem cada número',
        blocos: [
          { texto: 'O número sublinhado abre o que o forma, no mesmo período e na mesma loja: a despesa mostra cada lançamento e a parte dele que cai no período, e o CMV abre por categoria.', para: ['dre.ver'] },
          // Nesta tela todos têm `dre.ver`: o `para` de cada frase abaixo é a permissão que dá o link.
          { texto: 'O CMV pelas compras abre as compras do mesmo período, por insumo; de lá, cada compra abre a nota dela.', para: ['compras.ver'] },
          { texto: 'A receita leva aos lançamentos do mês, porque o faturamento é por mês.', para: ['faturamento.ver'] },
        ],
      },
      {
        id: 'meta',
        titulo: 'Como ler a meta',
        blocos: [
          { texto: 'O desvio é o realizado menos a meta, em pontos percentuais.' },
          { texto: 'O lado bom segue a linha: custo e despesa menores são melhores, receita, receita líquida e margem maiores são melhores.' },
          { texto: 'Sem faturamento, sem lançamento na linha ou sem valor (como o CMV de uma loja sem nota e sem estoque), a linha não compara e mostra traço, nunca zero. A meta do CMV compara com o que vale: o real ou o das compras.' },
          { texto: 'Na visão de uma loja, o resultado operacional e o resultado do período não mostram meta: a loja não carrega as despesas da rede.' },
          { texto: 'Quem define as metas as escreve em Plano e metas.', para: ['metas.editar'] },
        ],
      },
      {
        id: 'farol',
        titulo: 'O farol: 5 faixas',
        blocos: [
          { texto: 'O farol põe o desvio de cada linha com meta numa de 5 faixas: azul (bem melhor que a meta), verde (na meta), amarelo (um pouco pior), laranja (pior que a meta) e vermelho (muito pior). A régua de 5 casas mostra a faixa pela posição, e a palavra e o desvio vêm junto: a cor nunca fala sozinha.', para: ['dre.ver'] },
          { texto: 'Em custo, margem e resultado a conta é em pontos da receita bruta contra a meta: azul com 3 pontos ou mais melhor, verde até 0,5 ponto pior, amarelo até 1,5, laranja até 3 e vermelho além. Na receita é o crescimento: azul com 5 pontos acima da meta, verde até 1 abaixo, amarelo até 3, laranja até 6 e vermelho além.', para: ['dre.ver'] },
          { texto: 'As faixas são as mesmas para todas as casas e não se configuram: uma régua só, para comparar uma casa com a outra e com ela mesma ao longo do tempo. Azul numa despesa ou no CMV pede um olhar, porque pode ser lançamento esquecido: vem com confira se está tudo lançado.', para: ['dre.ver'] },
          { texto: 'A linha fica sem cor, com o desvio em texto e o motivo escrito, quando o dado não fecha: falta faturamento, despesa que repete ainda sem lançar, resultado sem o CMV de alguma loja, ano passado incompleto ou sem lançamento. Sem número é hipótese. O CMV pelas compras, parcial ou misto, tem cor, com o selo da fonte.', para: ['dre.ver'] },
          { texto: 'O farol por canal é só o da receita: a meta de crescimento do canal contra o mesmo período do ano passado. CMV e despesa são da loja, não do canal, e não são divididos entre eles.', para: ['dre.ver'] },
          { texto: 'O painel Faróis do período, no topo, conta as linhas em cada faixa e leva às laranja e vermelhas. Período fechado antes do farol mostra o farol de custo das linhas gravadas e diz que a receita não foi apurada neste fechamento.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'ano-passado',
        titulo: 'Receita contra o ano passado',
        blocos: [
          { texto: 'Compara a receita com as mesmas datas um ano antes, no mesmo recorte (29 de fevereiro compara com 28). Só a receita tem comparação.' },
          { texto: 'A variação só aparece quando o ano passado tem lançamento em todos os dias e este período não tem lançamento faltando. Senão ficam os dois números e o motivo.' },
          { texto: 'Sem lançamento no ano passado a tela diz sem lançamento, nunca R$ 0,00.' },
        ],
      },
      {
        id: 'cmv',
        titulo: 'Os dois CMVs: compra e real',
        blocos: [
          { texto: 'CMV de compra é a soma das notas lançadas pela data da nota. Vale no dia a dia e mede o que a casa gastou comprando, não o que consumiu.' },
          { texto: 'CMV real é o estoque inicial mais as compras menos o estoque final. Só existe com o período terminado e o fechamento do estoque aplicado nas duas pontas: o do período e o do anterior (ou a abertura, no primeiro).' },
          { texto: 'Em cada loja entra o real, quando existe; senão a compra, com o motivo escrito ao lado. A rede soma o que vale em cada loja, e fica misto quando as fontes se misturam. Loja sem nota e sem estoque fica sem CMV, nunca com zero, e os resultados avisam que saem sem contar o CMV.' },
          { texto: 'O CMV que vale é descontado da receita líquida na margem de contribuição. No painel compra × real a diferença é o real menos a compra: estoque que sobe é dinheiro parado na prateleira; estoque que desce pede olho na próxima compra.' },
          { texto: 'Sem custo médio ligado, o estoque usa a última compra da rede ou o preço cadastrado; ligado, usa o valor acumulado na loja. Fichas e preços sugeridos seguem a referência da rede. Item sem preço fica fora da soma conhecida, com aviso; ausência de custo não é custo zero.' },
          { texto: 'Limpeza e descartáveis entram no CMV gerencial pela compra e pelo estoque, cada insumo na sua categoria. O pagamento de uma nota já lançada não é outra despesa. Lojas que dividem estoque sem transferência podem distorcer o real por loja.' },
        ],
      },
      {
        id: 'cmv-categorias',
        titulo: 'O CMV por categoria',
        blocos: [
          { texto: 'O CMV do DRE também abre em categorias, em CMV por categoria. É o mesmo CMV: a soma das categorias é a linha do DRE, ao centavo.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'competencia',
        titulo: 'Competência, não caixa',
        blocos: [
          { texto: 'A despesa conta no mês a que pertence, não no dia em que foi paga. A luz de outubro é de outubro, mesmo paga em novembro.' },
          { texto: 'Por isso o aluguel de 31 dias, no dia 16, entra com 15 trinta e um avos: o que já passou até ontem.' },
        ],
      },
      {
        id: 'taxa-ifood',
        titulo: 'A taxa do iFood é estimada',
        blocos: [
          { texto: 'Vale o faturamento do iFood vezes a comissão e o pagamento online configurados hoje. É uma estimativa, não o extrato do iFood. No período fechado vale a taxa de quando ele fechou.' },
          { texto: 'Sem a taxa configurada, a linha diz que falta configurar e a receita líquida sai avisando.', para: ['precos.ver'] },
        ],
      },
      {
        id: 'incompleto',
        titulo: 'Incompleto e falta lançar',
        blocos: [
          { texto: 'Dia de canal sem lançamento de faturamento deixa a receita incompleta. O aviso conta quantos faltam, do mesmo jeito que o calendário do mês.' },
          { texto: 'Despesa marcada para repetir, com último lançamento nos 12 meses anteriores, aparece em Falta lançar se o mês escolhido ainda não foi lançado. Nada entra sozinho; confira o valor ou use Não repete mais na última despesa lançada.', para: ['despesas.lancar'] },
        ],
      },
      {
        id: 'fechado',
        titulo: 'Período fechado e ressalvas',
        blocos: [
          { texto: 'Fechado com ressalvas quer dizer que o período foi fechado com algo conhecido em aberto, como uma despesa que repete e não foi lançada. As ressalvas e a justificativa ficam ali para sempre.' },
          { texto: 'Quem define o plano e as metas fecha o período em Períodos. Só a FlowFoods reabre.', para: ['metas.editar'] },
        ],
      },
    ],
    pontos: [
      {
        id: 'leitura',
        titulo: 'Como ler os números do DRE',
        blocos: [{ texto: 'Despesa conta pela competência, o mês a que pertence, não pelo dia em que foi paga. O CMV é o real quando a contagem de fechamento foi aplicada; senão, o das compras pela data da nota. Loja sem nota e sem estoque fica sem CMV.', para: ['dre.ver'] }],
        secao: 'competencia',
      },
      {
        id: 'farol-canal',
        titulo: 'Farol por canal',
        blocos: [{ texto: 'O farol por canal é só o da receita, porque só ela nasce no canal. Compra e despesa são da loja, não do canal: o CMV e as despesas têm o farol no total, na tabela abaixo.', para: ['dre.ver'] }],
        secao: 'farol',
      },
    ],
  },
  {
    chave: 'dre-despesas',
    area: 'dre',
    rotas: ['dre/despesas'],
    titulo: 'Despesas',
    versao: 3,
    aula: [
      { texto: 'Aluguel, salário, luz e as outras despesas da casa, pela competência: o mês a que a despesa pertence, não o dia em que foi paga.' },
      // Decisão 520 (revisão): o filtro é toda despesa com vencimento e sem pagamento, de qualquer mês; vencidas e 7 dias são as métricas do alto.
      { texto: 'A pagar mostra todas as que têm vencimento e ainda não foram pagas, de qualquer mês, pela ordem de vencimento; no alto, quantas já venceram e quantas vencem em até 7 dias. Pagar não muda o DRE.' },
      { texto: 'Despesa da rede, que não é de uma loja, só aparece para quem tem a rede inteira.' },
      { texto: 'Lance cada despesa uma vez. As que repetem todo mês voltam em Lançar as do mês passado, com o valor para você conferir.', para: ['despesas.lancar'] },
    ],
    pontos: [
      {
        // Decisão 464: a mesma tela, vinda de um número do DRE, mostra o que forma esse número.
        id: 'composicao',
        titulo: 'De onde vem este número',
        blocos: [
          { texto: 'Vindo de um número do DRE, a tela mostra as despesas que formam esse número, no mesmo período e na mesma loja, e a soma no rodapé é o número.' },
          { texto: 'Cada despesa conta só pelos dias dela que caem no período: um aluguel de R$ 3.100,00 de outubro, de 31 dias, entra numa semana de 7 dias com R$ 700,00.' },
          { texto: 'Na visão de uma loja não entram as despesas da rede, como o contador do grupo.' },
        ],
      },
    ],
  },
  {
    chave: 'dre-despesa',
    area: 'dre',
    rotas: ['dre/despesas/[id]'],
    titulo: 'Despesa',
    versao: 2,
    aula: [
      { texto: 'Os dados da despesa, como o DRE a conta dia a dia e tudo o que mudou nela, com antes e depois.' },
      { texto: 'Em período fechado, ainda dá para mudar descrição, vencimento e repetição, pagar ou desfazer pagamento, pois isso não muda o DRE.', para: ['despesas.lancar'] },
      { texto: 'Lançou errado? Antes do fechamento, edite; se a despesa não devia existir, remova com motivo. Depois, valor, competência, linha e loja ficam travados e a despesa não pode ser removida.', para: ['despesas.lancar'] },
    ],
    // Decisão 520: em que linha e em que período a despesa conta (o que o início soma e o Conferir este valor abre), e o
    // "Não muda o DRE" da conta a pagar, que saiu do corpo. Na ordem da página.
    pontos: [
      {
        id: 'como-conta',
        titulo: 'Em que linha e em que período ela conta',
        blocos: [
          { texto: 'A linha decide o grupo do DRE em que a despesa entra, e a competência decide o período: cada período do DRE recebe só os dias dela que caem nele e, no período em curso, só até ontem.' },
          { texto: 'Despesa de uma loja entra no DRE da loja e no da rede; a da rede entra só no DRE da rede, sem dividir entre as lojas.' },
          { texto: 'No início, o card de Despesas de uma loja soma as despesas dela do mesmo jeito, sem as deduções da venda, como impostos e taxas de cartão.', para: ['dre.ver'] },
        ],
      },
      {
        // O subtítulo "Não muda o DRE." do painel Conta a pagar.
        id: 'pagamento',
        titulo: 'Pagamento e o DRE',
        blocos: [
          { texto: 'Vencimento e pagamento não mudam o DRE: a despesa conta pela competência, não pelo dia em que foi paga.' },
          { texto: 'Com vencimento e sem pagamento, ela fica no filtro A pagar da lista de despesas.' },
          { texto: 'Marque como paga com a data em que o dinheiro saiu, que não pode ser futura; desfazer o pagamento serve para o que foi marcado por engano.', para: ['despesas.lancar'] },
        ],
      },
    ],
  },
  {
    chave: 'dre-despesa-nova',
    area: 'dre',
    rotas: ['dre/despesas/nova', 'dre/despesas/[id]/editar'],
    titulo: 'Lançar despesa',
    versao: 1,
    aula: [
      { texto: 'Escolha a linha do DRE, a loja (ou a rede) e a competência: um dia, um mês ou um período de até 366 dias.' },
      { texto: 'O DRE espalha o valor pelos dias da competência, ao centavo; repete todo mês vale só para o mês inteiro.' },
      { texto: 'O vencimento é opcional e só põe a despesa em A pagar; mandou duas vezes sem querer, fica uma só.' },
    ],
    // Decisão 520: os subtítulos educativos de "A que período pertence" e de "Conta a pagar" saíram do corpo e moram aqui, com o
    // que a aula não diz (o grupo da linha, o que o início soma, a cobrança da que repete). Na ordem da página; quem só lança
    // despesa, sem ver o DRE, não recebe o bloco do card do início (que ele não vê).
    pontos: [
      {
        id: 'linha',
        titulo: 'Em que linha do DRE a despesa entra',
        blocos: [
          { texto: 'A linha decide o grupo do DRE em que a despesa entra: a lista mostra cada linha dentro do grupo dela, como Pessoal, Ocupação e Utilidades.' },
          { texto: 'Os impostos sobre a venda e as taxas de cartão ficam em Deduções da venda, que descontam a receita.' },
          { texto: 'No início, o card de Despesas de uma loja soma as despesas dela de todos estes grupos, menos as deduções da venda.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'competencia',
        titulo: 'Em que período a despesa conta',
        blocos: [
          { texto: 'O DRE conta pela competência, o período a que a despesa pertence: a luz de outubro é de outubro, mesmo paga em novembro.' },
          { texto: 'Cada período do DRE recebe só os dias da despesa que caem nele e, no período em curso, só até ontem: o aluguel do mês entra aos poucos, dia a dia.' },
          { texto: 'Período fechado não recebe despesa nova nem muda valor, competência, linha ou loja das que caem nele: a fotografia do DRE fica guardada, e descrição, vencimento e repetição continuam editáveis.' },
        ],
      },
      {
        // Só com "Um mês" escolhido: é o único tipo que repete.
        id: 'repete',
        titulo: 'Repete todo mês',
        blocos: [
          { texto: 'No mês seguinte, ela aparece em Lançar as do mês passado com o mesmo valor, para você conferir e lançar: nada entra sozinho.' },
          // A lista também avisa (quem só lança não abre o DRE); a cobrança olha os 12 meses anteriores (`recorrentesEmFalta`).
          { texto: 'Enquanto o mês seguinte não for lançado, a lista de despesas e o DRE avisam Falta lançar, por até 12 meses. Para parar antes, use Não repete mais na despesa do último mês lançado.' },
        ],
      },
      {
        // O subtítulo de "Conta a pagar", menos o "Opcional.", que fica.
        id: 'vencimento',
        titulo: 'Vencimento e o DRE',
        blocos: [
          { texto: 'O vencimento não muda o DRE: a despesa conta pela competência, não pelo dia em que vence ou é paga.' },
          { texto: 'Com vencimento, ela fica no filtro A pagar da lista de despesas até ser marcada como paga, na tela dela.' },
        ],
      },
    ],
  },
  {
    chave: 'dre-periodos',
    area: 'dre',
    rotas: ['dre/periodos'],
    titulo: 'Períodos',
    versao: 2,
    aula: [
      { texto: 'O período em que o resultado fecha, mensal, quinzenal ou semanal, com o dia em que começa, é o mesmo da contagem de estoque.' },
      { texto: 'Mudar a regra nunca mexe no passado: ela vale a partir do dia seguinte ao fim do período de agora, e o primeiro período novo nasce cortado no começo.' },
      { texto: 'Quem define o plano de contas e o período, com a rede inteira, muda a regra; os outros só consultam.' },
      { texto: 'Cada período que já terminou tem a sua página: ali estão as condições para fechar, a fotografia do fechamento e as versões.', para: ['metas.editar'] },
    ],
  },
  {
    chave: 'dre-plano',
    area: 'dre',
    rotas: ['dre/plano'],
    titulo: 'Plano e metas',
    versao: 5,
    aula: [
      { texto: 'Em Metas, escreva quanto cada linha deveria pesar na receita bruta, em %; vazio é sem meta e zero é uma meta de zero.' },
      { texto: 'A meta vale a partir do começo do período de agora, igual na rede e em cada loja; o passado não muda.' },
      { texto: 'No plano de contas, renomear uma linha não perde nada; ocultar tira do formulário de despesa, e linha nunca se apaga.' },
      { texto: 'As linhas calculadas vêm do sistema: não se renomeiam, mas aceitam meta; a do CMV compara com o real ou, sem ele, com as compras.' },
      { texto: 'A meta do CMV também é o total das metas por categoria: quem a muda aqui muda lá, e a divisão por categoria fica em Metas por categoria.', para: ['metas.editar'] },
    ],
    secoes: [
      {
        id: 'metas',
        titulo: 'Como as metas funcionam',
        blocos: [
          { texto: 'Na receita (a total e a de cada canal), a meta é de crescimento sobre o mesmo período do ano passado, de 0 a 100 %: zero é igualar o ano passado. Não há meta negativa nem em reais.', para: ['metas.editar'] },
          { texto: 'Nas outras linhas a meta é o percentual da receita bruta. O farol compara o realizado com ela em 5 faixas fixas.', para: ['metas.editar'] },
          { texto: 'Cada período usa a meta que valia no começo dele: período antigo ainda aberto não pega meta escrita depois. Salvar de novo no mesmo período troca a meta, e apagar grava sem meta.' },
          { texto: 'A tabela inteira é salva de uma vez. Se outra pessoa mudou as metas no meio tempo, a tela avisa e nada é gravado.' },
        ],
      },
      {
        id: 'plano',
        titulo: 'Ocultar e as despesas já lançadas',
        blocos: [
          { texto: 'Linha oculta continua no DRE dos períodos em que tem valor. Renomear mantém a linha: as despesas já lançadas mostram o nome novo.' },
        ],
      },
    ],
  },
  {
    chave: 'dre-cmv-categorias',
    area: 'dre',
    rotas: ['dre/cmv-categorias'],
    titulo: 'CMV por categoria',
    versao: 4,
    aula: [
      { texto: 'Esta tela mostra para onde foi o custo, categoria por categoria, para quem acompanha o resultado.' },
      { texto: 'É o CMV do DRE aberto em categorias: quanto foi para Proteína, Hortifruti, Bebidas e as outras, e quanto isso pesa na receita bruta.', para: ['dre.ver'] },
      { texto: 'A soma das categorias é a linha do CMV do DRE, ao centavo. Onde o estoque foi contado por insumo no começo e no fim do período, a categoria mostra o que foi consumido de verdade (o real); onde não foi, as compras, e a diferença aparece numa linha à parte.', para: ['dre.ver'] },
      { texto: 'Cada categoria com meta tem o desvio e o farol, as mesmas 5 faixas do DRE. Os maiores desvios mostram as categorias que saíram da meta, a que mais passou primeiro.', para: ['dre.ver'] },
    ],
    secoes: [
      {
        id: 'real-por-categoria',
        titulo: 'O real por categoria',
        blocos: [
          { texto: 'Real da categoria = estoque inicial + entradas de compra − estoque final, com o mesmo corte do real do DRE. O estoque de cada categoria sai do retrato por insumo que o fechamento do estoque guarda; só abre por categoria a loja que tem esse retrato no início e no fim do período.', para: ['dre.ver'] },
          { texto: 'Fechamento feito antes do retrato por insumo não abre por categoria, e não é reconstruído: o preço da época não existe. A loja fica pelas compras e a linha “Variação do estoque, ainda não aberta por categoria” explica a diferença, dizendo qual loja.', para: ['dre.ver'] },
          { texto: 'O estoque de pré-preparo fica na linha dele, sem meta e sem farol: negativo quer dizer que o estoque dele subiu no período. Os ingredientes ficam na categoria do ingrediente.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'compra-x-real',
        titulo: 'Compra × real',
        blocos: [
          { texto: 'A diferença é o real menos a compra, em R$ e em pontos da receita, com o mesmo sinal. Negativa: a casa comprou mais do que consumiu, e o estoque daquela categoria subiu, dinheiro parado na prateleira. Positiva: consumiu do que já tinha.', para: ['dre.ver'] },
          { texto: 'Só entram as lojas com o real aberto por categoria; as outras aparecem como “ficaram de fora”, com o motivo.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'evolucao-e-por-loja',
        titulo: 'Evolução e por loja',
        blocos: [
          { texto: 'A evolução mostra os últimos 6 períodos, do mais antigo ao mais novo, com a meta que valia em cada um. Período fechado vem da fotografia como ela está; o que não tem dado fica vazio, nunca zero.', para: ['dre.ver'] },
          { texto: 'Por loja (só na rede) põe cada categoria ao lado de cada loja, contra a receita da própria loja. A coluna de cada loja fecha no CMV do DRE dela.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'categoria-de-hoje',
        titulo: 'A categoria de hoje',
        blocos: [
          { texto: 'A conta usa a categoria que o insumo tem hoje, em todas as parcelas do período (compras, estoque inicial e final). Passar o bacon de Laticínios para Proteína muda o período em curso inteiro de uma vez, e o total não muda.', para: ['dre.ver'] },
          { texto: 'Período fechado mostra a fotografia: a categoria e a meta daquele dia. Reclassificar depois não o altera.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'sem-cor',
        titulo: 'Quando a categoria fica sem cor',
        blocos: [
          { texto: 'Falta faturamento, falta o CMV de alguma loja, ou Outros mais Sem categoria passam de 2% do CMV: a meta ainda não é confiável, então o desvio fica em texto e o motivo vem escrito. O 2% é uma hipótese a validar com a casa.', para: ['dre.ver'] },
          { texto: 'Outros / a classificar e Sem categoria são fila de classificação: não têm farol. Classificar os insumos devolve as cores.', para: ['dre.ver'] },
          { texto: 'Se o painel não fecha com o CMV do DRE e nenhuma loja explica a diferença, aparece a linha “Diferença que o painel não explica” e as categorias ficam sem cor: o dado não fecha.', para: ['dre.ver'] },
          { texto: 'A cor usa pontos da receita, a régua do DRE. Embaixo do desvio, o percentual da própria meta ajuda a ler a categoria pequena (0,20 pp em Limpeza pode ser 40% da meta), mas nunca muda a cor nem a ordem.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'limites',
        titulo: 'O que ainda não está aqui',
        blocos: [
          { texto: 'Não existe transferência de estoque entre lojas no sistema: o real de uma loja não desconta o que ela mandou para outra. O da rede continua certo; o de cada loja pode distorcer enquanto isso não existir.', para: ['dre.ver'] },
          { texto: 'Na rede, o percentual de cada categoria é sobre a receita das lojas que a usam.', para: ['dre.ver'] },
        ],
      },
    ],
    pontos: [
      {
        id: 'percentuais',
        titulo: 'Como ler compra × real',
        blocos: [{ texto: 'Os percentuais são pontos da receita bruta das lojas comparadas. A comparação é a mesma da página do DRE, aberta pela categoria de hoje do insumo. O estoque de pré-preparo fica à parte e não tem compra para comparar.', para: ['dre.ver'] }],
        secao: 'compra-x-real',
      },
      {
        id: 'origem',
        titulo: 'De onde vêm os números',
        blocos: [{ texto: 'Período fechado vem da fotografia como ela está, com a categoria e a meta da época; período aberto, do que se sabe hoje. Onde o estoque foi contado por insumo nos dois fechamentos, o número é o CMV real; nos outros, as compras.', para: ['dre.ver'] }],
        secao: 'categoria-de-hoje',
      },
    ],
  },
  {
    chave: 'dre-metas-categorias',
    area: 'dre',
    rotas: ['dre/metas-categorias'],
    titulo: 'Metas por categoria',
    versao: 3,
    aula: [
      { texto: 'Aqui quem define as metas diz quanto cada categoria pode pesar, em % da receita bruta.' },
      { texto: 'Vazio é sem meta e zero é uma meta de zero. A meta total é a do CMV do DRE; a divisão pode não fechar nela, e a tela só avisa a diferença.', para: ['metas.editar'] },
      { texto: 'Usar o modelo de 32% só preenche o formulário, como referência ilustrativa: confira, mude e salve. Nada é gravado antes disso.', para: ['metas.editar'] },
    ],
    secoes: [
      {
        id: 'rede-e-loja',
        titulo: 'Rede e loja',
        blocos: [
          { texto: 'A rede define as metas de todas as lojas. Cada loja segue a rede ou personaliza o conjunto inteiro, sem misturar meta herdada com meta própria.', para: ['metas.editar'] },
          { texto: 'Mudar a rede só afeta as lojas que a seguem, e a tela diz quais. Mudar uma loja não toca nenhuma outra.', para: ['metas.editar'] },
          { texto: 'A categoria que a loja não usa sai das metas e do painel dela, a não ser que tenha valor: custo nunca some.', para: ['metas.editar'] },
          { texto: 'A loja que personaliza pode ter a meta total do CMV dela. Ela vale na linha CMV do DRE da loja e no orçamento de compra dela; deixar vazio usa a meta total da rede. A rede continua com a meta da rede.', para: ['metas.editar'] },
          { texto: 'Na rede, o percentual de cada categoria é sobre a receita das lojas que a usam.', para: ['metas.editar'] },
        ],
      },
      {
        id: 'vigencia',
        titulo: 'Desde quando vale',
        blocos: [
          { texto: 'A meta vale a partir do começo do período de agora. Os períodos anteriores seguem com as metas que valiam neles e o passado nunca é reescrito.', para: ['metas.editar'] },
          { texto: 'Duas pessoas salvando ao mesmo tempo: a segunda recebe o aviso e nada é gravado.', para: ['metas.editar'] },
        ],
      },
    ],
    pontos: [
      {
        id: 'base',
        titulo: 'Base da meta',
        blocos: [{ texto: 'A meta é o percentual da receita bruta, a mesma base do DRE e do farol. Na rede, o percentual de cada categoria é sobre a receita das lojas que a usam.', para: ['dre.ver'] }],
        secao: 'rede-e-loja',
      },
    ],
  },
  {
    chave: 'dre-periodo',
    area: 'dre',
    rotas: ['dre/periodos/[inicio]'],
    titulo: 'Fechar o período',
    versao: 5,
    aula: [
      { texto: 'Fechar guarda uma fotografia do DRE e bloqueia o que muda o resultado dessas datas; pagamento, descrição, vencimento e repetição de despesa continuam editáveis.' },
      { texto: 'Faturamento faltando, taxa do iFood sem configurar, estoque em contagem de fechamento e rede sem lançamento travam, e não aceitam justificativa.' },
      { texto: 'Despesa que repete e não foi lançada, loja sem o estoque fechado e loja sem faturamento são ressalvas: marque cada uma e escreva uma justificativa.' },
      { texto: 'Só a FlowFoods reabre um período fechado, com o motivo; fechar de novo gera a versão seguinte.' },
    ],
    secoes: [
      {
        id: 'ressalvas',
        titulo: 'O que é uma ressalva',
        blocos: [
          { texto: 'É algo que a casa sabe que está faltando e decide fechar assim mesmo. A justificativa tem de 10 a 300 letras, vai para a fotografia e para o Histórico, e o DRE fechado mostra Fechado com ressalvas para sempre.' },
          { texto: 'A despesa que repete e falta lançar pode ser lançada antes, com o valor do último mês lançado como ponto de partida, dentro da busca dos 12 meses anteriores.', para: ['despesas.lancar'] },
        ],
      },
      {
        id: 'versoes',
        titulo: 'Reabrir e as versões',
        blocos: [
          { texto: 'Reabrir deixa o período aberto de novo para lançar e corrigir. A fotografia anterior fica guardada em Versões, com quem reabriu e por quê.' },
          { texto: 'Ao fechar de novo sai a versão seguinte. A dona da casa não reabre: o período fechado é o ponto de controle do consultor.' },
          { texto: 'A fotografia guarda o CMV de compra e o real de cada loja. Período fechado antes de o CMV existir diz que não apurou: para guardá-lo, reabre e fecha de novo.' },
          { texto: 'Também guarda a receita do ano passado e a versão das faixas do farol. O período fechado lê o farol e a variação só da fotografia: mudar a meta ou o faturamento do ano passado depois não o altera. Fechado antes do farol, a receita diz que não foi apurada neste fechamento.', para: ['dre.ver'] },
          { texto: 'E guarda o CMV por categoria de cada loja: as compras de cada categoria, a meta que valia e o nome da categoria daquele dia. Reclassificar um insumo ou renomear uma categoria depois não mexe nele. Fechado antes, diz que não foi apurado por categoria.', para: ['dre.ver'] },
        ],
      },
    ],
  },
];
