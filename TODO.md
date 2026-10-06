# Plano de evolução — AXL Gestão & Prospecção

Este documento mantém **todo o escopo solicitado**. Itens fora do MVP não foram excluídos. `[x]` indica função local implementada; `[ ]` indica pendência. Recursos preparados em schema ou adaptador não são tratados como integração concluída.

## Fase 1 — Estrutura (itens 2–4, 46–49, 53, 57–59)

- [x] Next.js/TypeScript, layout AXL branco/preto/verde, português, BRL, datas brasileiras e São Paulo.
- [x] Login local, logout, sessões, validação, rotas/API protegidas, criação de usuários e troca de senha.
- [x] Banco SQLite funcionando com seed repetível e schema PostgreSQL de 33 entidades preparado.
- [x] Menu completo, busca universal, componentes e tratamento de erro/carregamento/vazio.
- [x] Testes de regras, transações, PostgreSQL/RLS e navegador.
- [x] RLS inicial preparada e testada em PostgreSQL embarcado: ADMIN, demais perfis bloqueados.
- [x] Manifest e ícone para futura PWA.
- [ ] Conectar Supabase Auth, PostgreSQL e Storage ao fluxo real; migrador de dados local → remoto.
- [ ] Liberação e autorização por registro para VENDEDOR, PRODUÇÃO e FINANCEIRO; isolamento de regiões e clientes próprios.
- [ ] Convite, desativação de usuário, revogação administrativa de sessões e limite compartilhado de tentativas.
- [ ] Validar schema, RLS e Storage em Supabase real e deploy Vercel com disco remoto.
- [ ] PWA instalável completa, service worker e estratégia segura de offline.

## Fase 2 — Gestão (itens 6, 15–21, 39, 42–45, 50–52)

- [x] Clientes/leads, cadastro, edição, ficha, contatos básicos, observações preservadas e timeline.
- [x] Compras por cliente, faturamento, placas, ticket médio e LTV calculados sobre as vendas.
- [x] Produtos editáveis, composições, custo atual, simulador de lucro/margem e produtos iniciais.
- [x] Vendas com múltiplos itens; total, placas, custos, lucro e snapshot de margem/comissão.
- [x] Histórico de vendas, detalhes dos itens e pedido automático.
- [x] Kanban de pedidos, status, data prometida e observações.
- [x] Dashboard: filtros hoje/7/30/mês/anterior/ano/personalizado, indicadores, gráfico diário e segmentos.
- [x] Tabelas com busca, ordenação, paginação local e exportação CSV de cadastros/financeiro/relatórios.
- [ ] Validação específica e deduplicação de CNPJ/CPF, múltiplos contatos, redes sociais e cadastro completo de endereços.
- [ ] Indicadores e gráficos restantes: comparação anterior, vendas/placas por dia, produto/cidade/vendedor, novos vs. recorrentes, recorrência por período e valor médio por placa sem misturar serviços.
- [ ] Filtros combinados por cidade/segmento/origem/vendedor/produto/status e seleção de colunas; paginação no servidor.
- [ ] Exportação XLSX e CSV com cabeçalhos de negócio e valores monetários já convertidos.
- [ ] Importador CSV/XLSX: upload, mapeamento, preview, validação, duplicidades e confirmação antes de gravar.
- [ ] Cancelamento de venda/pedido com justificativa, histórico financeiro e reversão controlada de materiais, sem apagar snapshots.

## Fase 3 — CRM (itens 5, 13–16, 37)

- [x] Leads em tabela e pipeline, sete etapas comerciais e motivo de perda.
- [x] Atividades: observação, ligação, mensagem, visita, proposta e contato.
- [x] Retornos agendados, conclusão e vencidos na Central do Dia.
- [x] Score parcial com explicação e melhores oportunidades; pedidos/estoque/retornos na Central.
- [ ] Arrastar cartões no Kanban, edição de responsáveis e histórico visual detalhado de etapas.
- [ ] Central: propostas pendentes, novos leads por dia no timezone correto do banco, entregas do dia e sugestão automática de rota.
- [ ] Funil completo com empresas encontradas, selecionadas, contatadas e taxas de conversão entre etapas.
- [ ] Alertas e notificações persistentes de follow-up, calendário e lembretes.
- [ ] Propostas e orçamentos com arquivos e documentos comerciais.

## Fase 4 — Prospecção (itens 7–11)

- [x] Endpoint Google Places oficial, chave só no servidor, mensagens sem chave e limitação de consultas.
- [x] Consulta por segmento/cidade/UF/bairro/CEP; tabela com nota, avaliações, telefone, endereço, Maps e site.
- [x] Filtros de nota mínima/máxima, quantidade mínima/máxima de avaliações, telefone e site; criação de lead com dados próprios confirmados e place_id.
- [x] Respostas Google em memória, no-store, sem exportação ou cache permanente.
- [x] AXL Score 0–100, fatores explicados e pesos configuráveis.
- [ ] Validar chamada real com chave Google, restrições, faturamento, atribuição visual e política vigente.
- [ ] Múltiplas cidades, raio, categorias e demais filtros CRM do item 7.
- [ ] Detalhes/sincronização conforme permissões de dados Google e `google_last_synced_at` funcional.
- [ ] “Outros critérios” configuráveis: peso reservado existe, mas ainda não pontua. Faixas baixa/média/alta/muito alta na interface.
- [ ] Consultas de ranking específicas, histórico, fonte, observação e gráfico de posição. Nunca tratar como posição absoluta.
- [ ] Mapa embutido com marcadores por status e ficha ao clicar, com integração oficial e chave restrita.

## Fase 5 — Operação (itens 19–27)

- [x] Composições editáveis, custo médio de material e snapshots por venda.
- [x] Produção por pedido aprovado; transação de estoque, bloqueio de saldo negativo e baixa repetida.
- [x] Materiais, mínimo, custo, fornecedor, compras, entradas/saídas/ajustes/perdas/devoluções e histórico.
- [x] Compra atualiza custo médio ponderado, cria movimentação e despesa.
- [ ] Anexos de logo, QR, arte, comprovante, contrato e foto: adaptador/bucket preparados; falta UI e vínculo transacional.
- [ ] Aprovação de artes, tarefas de produção, visualização de itens/arte e histórico de responsável.
- [ ] Capacidade estimada de placas pelo estoque e alertas detalhados por composição.
- [ ] Cadastro completo de fornecedores, compras com múltiplos materiais e histórico de custos detalhado.
- [ ] Controle de produtos acabados, unidades alternativas e devoluções/reversões vinculadas a pedido.

## Fase 6 — Financeiro (itens 28–31, 35)

- [x] Separação faturamento/recebimento, pagamentos integrais/parciais, saldo e vencidos.
- [x] Despesas por categoria, pagos/pendentes e saldo de caixa acumulado.
- [x] Comissão sobre venda, lucro ou placa com snapshot da regra na venda.
- [ ] Parcelamento com calendário e status pendente/parcial/pago/vencido/cancelado por parcela.
- [ ] Fluxo diário/semanal/mensal por data efetiva de recebimento/pagamento, resultado estimado e relatórios financeiros completos.
- [ ] Edição/pagamento de despesa, vencimento, vendedor, cidade, observações e comprovação.
- [ ] Comissão por item/personalizada, contas de comissão a pagar, aprovação e pagamento.
- [ ] Estorno, cancelamento, conciliação e tratamento de compra parcelada sem duplicar custos.

## Fase 7 — Inteligência (itens 6, 32–33, 36–41)

- [x] Metas editáveis diária/semanal/mensal e progresso.
- [x] Vendedores com faturamento e comissão acumulados.
- [x] Rankings de cidades, segmentos e clientes por faturamento, lucro e vendas; LTV na ficha.
- [ ] Rankings de produtos e vendedores, filtros completos, maior conversão/ticket/recorrência.
- [ ] Comparação com período anterior, inteligência por território e detecção de recorrência por período.
- [ ] Metas por vendedor, visitas, leads, conversão, placas, ticket e atingimento.
- [ ] Relatórios completos do item 36, funil com conversões e sugestões comerciais automáticas.
- [ ] Mapas de calor de cidades/territórios.

## Fase 8 — Rotas e territórios (itens 11–12, 33–35)

- [x] Rota com data, vendedor, empresas, ordem manual e status de cada visita.
- [x] Visitas registradas na timeline e link externo de navegação Google Maps.
- [ ] Reordenação da rota, rota conjunta no Maps, otimização e mapa embutido.
- [ ] Territórios por estado/cidade/região, prevenção de conflito e atribuição automática de lead.
- [ ] Detalhes completos dos vendedores: telefone, status, regiões e relatórios.

## Arquitetura futura (item 54)

- [ ] WhatsApp oficial e automações, envio de propostas, QR automático, PDF, assinatura digital e calendário.
- [ ] IA comercial, app nativo e notificações.
- [ ] Múltiplas unidades, revendedores, franquias e SaaS para terceiros. Adicionar organização/tenant e isolamento antes de atender empresas diferentes; o schema atual opera uma única AXL.

## Ordem recomendada da próxima entrega

1. Conectar Supabase Auth e dados remotos, testar permissões por perfil e a migração.
2. Conectar arquivos/arte e importador com pré-visualização para trazer a planilha real.
3. Validar Google Places e implementar mapa, sincronização e filtros restantes.
4. Completar parcelamento/fluxo de caixa e dashboards, mantendo snapshots e auditoria.
5. Implantar territórios, inteligência avançada e integrações futuras.

## Acesso compartilhado — situação atual

- [x] Backend remoto Supabase Auth, cookies HttpOnly, renovação de sessão e RPCs transacionais com RLS ADMIN.
- [x] Testes PostgreSQL de vendas, pagamento, composição, estoque, produção e bloqueio de perfis não autorizados.
- [x] Paginação Google Places com filtros de cidade, nota e quantidade de avaliações na interface.
- [ ] Aplicar migrações e validar conexão no projeto Supabase real.
- [ ] Validar Google Places com chave real.
- [ ] Publicar na Vercel e testar acesso HTTPS no computador e celular.
- [ ] Migrador de dados locais e mecanismo compartilhado de limites de consultas/autenticação.

- [x] Página de recuperação de senha, envio via Supabase e atualização com sessão verificada; pendente validar envio/link no projeto real e configurar Redirect URLs.

## Histórico da planilha AXL

- [x] Conversão validada do layout Controle_Vendas_AXL para SQL transacional, reconciliação das abas e repetição sem duplicatas.
- [x] Datas exatas, intervalos e datas desconhecidas preservadas; Todo o histórico no dashboard/relatórios.
- [x] Custos/pagamentos não informados diferenciados de zero e sem pedidos/estoque/cobranças artificiais.
- [x] Arquivo Excel original preservado, com download protegido pelo ADMIN.
- [ ] Aplicar o arquivo preparado no Supabase real e conferir os dados no site publicado.
- [ ] Importação geral pela interface, formatos adicionais e conciliação de custos/pagamentos históricos.
