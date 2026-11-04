# Módulo em breve: Dispositivos (MDMesh)

**Estado:** EM BREVE / NÃO ATIVADO. **Produto:** ERP FlowFoods (Barney). **Data:** 28/10/2026.

## Objetivo
Administrar os dispositivos Android das lojas (tablets de pedidos, totens, terminais e painéis) de forma centralizada, aproveitando o [MDMesh](https://github.com/MDMesh-app/MDMesh) como motor de MDM e mantendo o FlowFoods como experiência principal de gestão.

## Base técnica verificada
O MDMesh é um MDM Android open source sob Apache-2.0, com servidor Java/Jersey e PostgreSQL, console React/TypeScript, agente Android Kotlin Device Owner e implantação por Docker Compose. Seu README documenta provisionamento por QR após restauração de fábrica, agrupamento, telemetria, modo quiosque, distribuição de APKs, comandos remotos e localização. O **controle remoto de tela ao vivo** consta no roadmap upstream, não deve ser anunciado como recurso disponível. **Não** incorporar o código upstream sem revisar dependências, versão, licença, avisos e modelo de autenticação.

## Escopo funcional desejado
1. **Visão da rede:** número de aparelhos por loja, nome, modelo, Android, bateria, armazenamento, conectividade, última comunicação, estado e alertas.
2. **Cadastro/vínculo:** cada dispositivo pertence a um parceiro (tenant) e opcionalmente a uma loja e a um item do módulo **Patrimônio**. Vincular com QR de provisionamento controlado pelo administrador.
3. **Perfis e grupos:** perfis por uso (tablet delivery, quiosque, cozinha, salão e gestor), conjunto autorizado de aplicativos, Wi-Fi e modo quiosque.
4. **Aplicativos:** catálogo aprovado e distribuição/atualização gradual; Android Device Owner e compatibilidade validados antes de cada operação.
5. **Ações remotas:** mensagem, tocar alarme, bloquear, reiniciar quando suportado, localizar, solicitar check-in. Comandos destrutivos (apagamento, redefinição) **não entram no MVP**; exigem desenho específico de autorização e confirmação.
6. **Histórico:** trilha de ativação, troca de loja, responsável, versões, falhas e comandos; cruzamento com manutenção, garantia, custo, baixa e transferência do Patrimônio.
7. **Alertas:** equipamento offline, bateria criticamente baixa, app desatualizado e saída de política; notificação por permissões e unidade.

## Arquitetura prevista
- **FlowFoods:** interface, autorização, vínculos tenant/loja/patrimônio, auditoria, alertas e leitura normalizada.
- **MDMesh:** serviço **isolado** para MDM, preferencialmente em contêiner/host separado na VPS com TLS. Nada de compartilhar tabelas de banco ou credenciais internas diretamente com a aplicação.
- **Adaptador backend:** `src/lib/erp/dispositivos/` (futuro) consome **API validada** do MDMesh; mapear endpoints e mecanismo de autenticação da versão adotada antes de implementar. Nenhuma chamada direta do browser ao MDM.
- **Segurança:** segredos no ambiente, autenticação de serviço, escopo por tenant/loja, menor privilégio, rate limit, registro de ações, consentimento e retenção mínima de dados de localização. Verificar capacidade de isolamento multi-tenant do MDMesh; se não for garantida, separar instâncias por cliente ou introduzir gateway que impeça acesso cruzado.
- **Banco FlowFoods (proposta, sem migration):** `DispositivoErp` (id, parceiroId, lojaId?, patrimonioId?, mdmInstanceId, externalDeviceId, apelido, finalidade, status, lastSeenAt, createdAt, updatedAt); `DispositivoEventoErp` (id, parceiroId, dispositivoId, tipo, atorId?, momento, detalhesRedigidos); `PoliticaDispositivoErp` (id, parceiroId, nome, configuracaoValidada, versao). Identidade externa única **por instância** e sempre sob parceiro.
- **UX:** área **Em breve** `Dispositivos` no hub do ERP, com abas Visão geral, Equipamentos, Perfis, Aplicativos, Alertas e Histórico. Preservar o shell, tokens e padrões em `.interface-design/system.md`, `src/lib/erp/modulos.ts` e permissões atuais.

## Integração com Patrimônio
**Patrimônio** mantém tombamento, número de série, aquisição, custo, vida útil, garantia, manutenção e transferências. **Dispositivos** mantém telemetria e administração Android. A associação é opcional e auditável: um mesmo bem pode receber substituição de aparelho sem perder histórico patrimonial. Evitar criar cadastro duplicado e expor IMEI, serial ou localização a perfis sem autorização.

## Entrega em fases
- **Fase 0 (esta entrega):** especificação e referência upstream. Não alterar banco, menus, deploy, permissões ou produção.
- **Fase 1:** prova de conceito isolada, 1 tablet de teste, instalação do MDMesh em ambiente separado, documentar endpoints reais e autenticação, avaliar compatibilidade com Android, licença e isolamento entre clientes.
- **Fase 2 (MVP):** modelos, migrations, permissões novas e testes de isolamento; lista + detalhe + status e vínculo com loja/patrimônio; leitura apenas.
- **Fase 3:** provisionamento assistido, perfis/kiosk, atualizações de aplicativos, comandos não destrutivos, alertas e trilha de auditoria.
- **Fase 4:** automação e integração com chamados de manutenção; ações destrutivas somente mediante controles e revisão.

## Critérios de aceite futuros
- Usuário só visualiza/administra aparelhos de seu parceiro e lojas permitidas; testes impedem acesso cruzado.
- Sem credenciais ou endpoint administrativo MDMesh expostos ao navegador.
- Ações remotas exigem permissão específica, confirmação e auditoria; capacidades não suportadas ficam indisponíveis.
- Falha do MDM não afeta Compras, Estoque, Produção, Financeiro nem o login do ERP.
- Histórico patrimonial permanece preservado após troca, remoção ou desvinculação do dispositivo.
- Documentação e avisos Apache-2.0 preservados onde aplicável.

## Referências
- Fonte: https://github.com/MDMesh-app/MDMesh
- README: https://github.com/MDMesh-app/MDMesh/blob/main/README.md
- Licença: https://github.com/MDMesh-app/MDMesh/blob/main/LICENSE
- ERP existente: `docs/ERP.md`

**Importante:** esta proposta não afirma que o MDMesh já está instalado/integrado ao FlowFoods.
