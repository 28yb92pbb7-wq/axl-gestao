# Ativar a revisão consolidada na AXL existente

O código foi preparado no mesmo projeto. Não confunda código local, push no GitHub, deployment Vercel, migração Supabase e conexão autorizada do assistente. O site já existente é https://axl-gestao.vercel.app/login; recursos novos só estarão ativos depois da migração e de um deployment desta revisão.

## 1. Banco e publicação

1. Abra `database/update-2026-10-06-completo.sql` no GitHub, clique em Raw e copie o conteúdo integral.
2. Em https://supabase.com/dashboard/project/fajcyttfolvtemlpuajf/sql/new, cole e clique Run. Esperado: Success, no rows returned.
3. A atualização é aditiva/atômica, cria os módulos e pode ser repetida. Não reimporta as 35 vendas e não substitui dados posteriores, custos preservados ou datas originais.
4. Em https://vercel.com/axl19/axl-gestao, confira Deployments e aguarde Ready para o commit da revisão, ramo `AXL-gestao`. Se necessário, faça Redeploy do commit atualizado.
5. Mantenha `AXL_BACKEND=supabase`, URL e chave pública do Supabase já existentes. Não precisa de chave administrativa para a loja, importador manual ou MCP. `AXL_PUBLIC_URL=https://axl-gestao.vercel.app` é opcional para fixar a URL canônica do OAuth, caso use domínio próprio ou proxy.
6. Abra o site, atualize a página e teste com sua conta. Dados do Supabase são compartilhados entre computador e celular.

Não execute a migração inicial `supabase.sql` novamente e não repita a importação do Excel. Para desativar somente loja/assistente/importador, use `database/disable-shop-assistant.sql`, depois retorne a Vercel à versão anterior. Nenhuma tabela/histórico é apagado; tokens são revogados e guardas de produção permanecem. Reaplicar a atualização completa reativa os pontos de entrada, sem reativar tokens revogados. Guarde backup pelos recursos do Supabase antes de alterações operacionais reais.

## 2. Maps sem pagamento obrigatório no fluxo manual

Pesquise no aplicativo/site Google Maps externo, compartilhe a ficha e copie o link. Na AXL use **Adicionar pelo Google Maps**. **Preencher manualmente com este link** funciona sem API/faturamento: informe dados próprios e confirme o local. Não há preenchimento automático nesse modo.

A consulta automática usa Places API (New) com `GOOGLE_PLACES_API_KEY` privada do servidor, faturamento quando o Google exigir, restrição à API e quotas. Nenhum mapa/iframe ou busca ampla é exigido; não configure Maps JavaScript/Embed/Routes. Consulte os detalhes em `ATIVAR-CORRECOES.md`. Link curto não contém necessariamente Place ID; CID/hex/coordenadas não são convertidos artificialmente. Candidatos com nome/endereço exigem seleção. Falhas têm recuperação manual.

Nome/cidade/telefone informados pela empresa são campos próprios. Conteúdo Google permanece transitório na prévia/lista, com atribuição, por 15 minutos; só identidade/link/origem/data permanecem associados. Não há cópia automática de uma ficha Google para armazenamento permanente. Reimportação abre a ficha existente; associação a homônimos não é silenciosa.

## 3. Loja e clientes aprovados

Entradas após publicação: `/loja` catálogo, `/loja/cadastro` cadastro, `/loja/conta` conta/pedidos e `/loja/admin` administração, somente ADMIN. Alex e Laura continuam na gestão. COMPRADOR não acessa `/api/data`, CRM, custos, estoque, relatórios ou outros pedidos. Não promova clientes a VENDEDORES para fazê-los comprar.

O cliente informa nome, e-mail, telefone, estabelecimento opcional e senha. Fica pendente até Alex aprovar. Recusa/suspensão bloqueiam novas compras; decisões registram administrador, data e observação interna. O status fica na conta; não há convites/notificações externas implementados. Supabase Auth realiza a confirmação de e-mail quando habilitada; adicione `https://axl-gestao.vercel.app/auth/confirm` e `https://axl-gestao.vercel.app/loja/conta` às Redirect URLs permitidas e teste com conta de teste no navegador em que o cadastro foi iniciado. SMTP/limites e modelo de e-mail são configurações do Supabase, não enviados por esta implementação.

Carrinho de compradores é salvo no backend mesmo enquanto aguardam aprovação, podendo ser retomado em outro dispositivo. Carrinho de visitante é temporário na tela. A aprovação é revalidada no checkout, também por chamada direta. O checkout recalcula preço por quantidade/opção e frete no servidor e detecta divergência do total apresentado. Um identificador único impede repetir a compra; o mesmo identificador com outro conteúdo manda conferir Meus pedidos.

A fila administrativa permite associar uma conta externa a ficha histórica somente após verificação explícita do administrador, com registro do motivo. A primeira venda da conta cria uma ficha mínima nova, sem unir pelo nome/telefone; vendas seguintes usam essa ficha criada para a conta. Nada disso expõe o histórico comercial interno ao comprador.

## 4. Configurar condições reais antes de publicar produtos

Em Administrar loja:

- Preencha nome/dados empresariais, atendimento, compra, cancelamento/alterações e privacidade com informações reais da AXL.
- Configure chave/payload Pix para pagar a AXL, instruções e prazo para pagamento. Isso não cria conta em provedor nem faz cobrança automática.
- Configure modalidades de entrega com área/local, frete em centavos (null se exigir orçamento), endereço obrigatório quando necessário e prazo de transporte. Modalidade incompleta/orçamento impede finalizar compra.
- Escolha produto existente, descrição, foto real disponível, preço oficial, preços por quantidade, modelo e prazo de produção. Não são usados preços das vendas antigas como preços oficiais.
- Quantidade disponível é a capacidade total deste ciclo comercial, não um saldo presumido de matéria-prima. Pedidos pagos e pendentes dentro do prazo contam; pendentes expirados/cancelados deixam de reservar essa capacidade. Sob encomenda usa capacidade/prazo informados. Produto pronto exige vínculo e contagem real do estoque pronto.
- Configuração de preços por quantidade: `[{"minimum":3,"price":4500}]` significa R$45,00 por unidade a partir de três no item. Um combo usa IDs dos produtos existentes e quantidades; composição física continua nos produtos originais, sem inventar materiais.

Produtos incompletos permanecem rascunhos, inclusive se tentar publicar pela API. Não há fotos/preços/frete grátis/prazos fictícios. Os formulários administrativos de modalidades/preços/combos aceitam JSON validado; a área pública não expõe essa configuração técnica.

## 5. Pedido, personalização, arte e dinheiro

Pedido colocado é o registro comercial pendente da loja. Não cria faturamento nem recebido por si só. Só a conciliação integral explícita do Pix pelo ADMIN efetiva a venda e vincula o pedido de produção. Repetir a conciliação reutiliza os mesmos registros; o pedido da loja e sua execução na produção são vinculados, não duas vendas.

Personalização por item: WhatsApp de destino validado, Instagram, link Google confirmado (mesmo importador, restrito ao próprio pedido), payload Pix fornecido pelo comprador e observações. Não há inferência de titularidade Pix ou WhatsApp a partir de telefone público. Mesa/combos pedem descrição dos modelos e dados a aplicar. Logo pode ser enviado. Dados podem ficar pendentes, mas impedem aprovar a arte e produzir.

ADMIN envia versão da arte; comprador abre o arquivo e aprova a versão atual, com data/versão. Nova arte, personalização ou alteração da composição de produção invalida a aprovação. O backend impede produção/entrega sem pagamento conciliado e arte atual aprovada, inclusive pela gestão. Materiais e reservas usam as regras operacionais existentes, com baixa única e sem devolver consumo já ocorrido ao cancelar.

PNG/JPG/WebP/PDF até 4 MB, conferência do formato real, arquivos privados no bucket `axl-files`, acesso somente ao dono do pedido ou ADMIN. O download usa autenticação, no-store e attachment/nosniff; não é link público. Comprovante não confirma recebimento.

Comprador solicita alteração/cancelamento conforme condições comerciais. ADMIN cancela pedido não pago com motivo. Pedido pago exige estorno **integral realmente realizado**, registrado com data/motivo/confirmado; não há movimentação bancária feita pelo sistema. O registro cria uma única saída financeira e cancela a execução, sem restaurar materiais consumidos. A venda e recebimento originais são mantidos como histórico bruto; o estorno aparece como despesa/saída separada, reduzindo caixa, não como apagamento do dinheiro recebido. Estorno parcial e checkout/cartão automatizado dependem de integração adicional, que não foi ativada.

Pedido não pago expirado não pode ser conciliado automaticamente: revise disponibilidade e trate com o cliente antes de novo pedido. Não descreva um comprovante tardio como recebido sem conciliação. A área mostra número, itens, valores, pagamento, pendências, arte, produção/entrega, modalidade, rastreamento e atendimento, sem notas administrativas ou custos.

## 6. Conectar assistente (não ocorre ao fixar esta conversa)

Backend MCP após migração/publicação: `https://axl-gestao.vercel.app/api/mcp`. Usa Streamable HTTP com respostas JSON, ferramentas explícitas, OAuth por código e PKCE S256, registro dinâmico de cliente público HTTPS, consentimento no site e token opaco emitido especificamente para este recurso. Não repassa tokens Supabase ao MCP. Tokens ficam apenas com o cliente; no banco, hashes privados. Código dura cinco minutos, uso único; autorização de acesso dura uma hora, sem login permanente. `/conexoes` lista e revoga as autorizações imediatamente. Não há senha administrativa/token solicitado no chat.

Em um cliente que ofereça conexão MCP remota com OAuth:

1. Adicione o endpoint acima na área de conexões/aplicativos personalizados. A disponibilidade depende da conta/cliente.
2. Quando abrir o navegador, entre com sua própria conta interna AXL.
3. Leia as permissões e autorize somente leitura (`axl:read`) ou leitura/escrita (`axl:read axl:write`) para a conexão escolhida.
4. Volte ao cliente e teste uma consulta. Somente depois teste uma venda explicitamente solicitada e confira seu ID no site.
5. Se não precisar mais, revogue em Conexões do assistente. Ao expirar, será necessária nova autorização.

Ferramentas: buscar_empresa, consultar_resumo, preparar_importacao, confirmar_empresa, registrar_venda, registrar_recebimento, registrar_despesa, registrar_compra, atualizar_pedido, registrar_contato, consultar_operacao. Não há ferramenta de SQL, administração de usuários, exclusão em massa, banco ou envio de mensagens. Homônimos exigem escolha; pagamento não informado não vira recebido. Escritas usam UUID único por operação e registram autoria/origem Assistente. Depois de falha incerta, consultar_operacao determina o resultado antes de repetir. Duas vendas legítimas usam IDs distintos.

Esta instalação é uma única AXL por projeto/implantação. Outro recurso/domínio não aceita o token; argumentos de organização arbitrária são rejeitados. Não é uma implementação de múltiplas organizações no mesmo banco. Criar um usuário chamado ChatGPT não concede acesso e não instala uma conexão. O ChatGPT desta conversa ainda não possui ferramenta/conexão com este MCP; a implementação não prova compatibilidade real do cliente até instalar/autorizar/testar.

Autorização foi conferida na [especificação oficial MCP 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), obtida do repositório oficial modelcontextprotocol. O portal developers.openai.com não ficou acessível pela rede desta sessão; portanto compatibilidade/instalação no cliente OpenAI atual permanecem para validação externa. Referências do cliente: https://developers.openai.com/api/docs/guides/custom-mcp-server e https://developers.openai.com/plugins/build/auth.

## 7. Evidência e pendências externas

Testes de SQLite e PostgreSQL/PGlite com Auth/Storage simulados verificam migração repetível, histórico, papéis, checkout, idempotência, isolamento, preço, disponibilidade, arte, pagamento/estorno e OAuth/revogação. Navegador local verifica computador/celular, copiar/colar link manual, compradores e MCP com contas de teste. A suíte da gestão existente continua sendo executada. Uma simulação de Google não comprova consulta Google real; PGlite não comprova seu Supabase real.

Validação desta revisão: 47 testes de regras passaram sem pulos; os 8 testes de navegador passaram; lint, TypeScript e build de produção concluíram. Após reiniciar o servidor, o smoke autenticado confirmou login, proteção de acesso, dashboard, banco e logout.

Ainda dependem de participação externa: aplicar o SQL no Supabase, verificar deployment Ready, confirmar e-mail/Storage no projeto real, fornecer condições comerciais reais, opcionalmente configurar Places e instalar/autorizar MCP em cliente compatível. Não foi contratado serviço pago nem ativada cobrança real. Os arquivos SQL de rollback/desativação preservam o histórico.
