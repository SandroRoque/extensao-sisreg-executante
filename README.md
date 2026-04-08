# SISREG Executante

Extensão para Google Chrome, baseada em Manifest V3, criada para melhorar o fluxo de trabalho de usuários do perfil `EXECUTANTE INT` no SISREG III.

Ela atua diretamente sobre a interface do sistema, adicionando atalhos e ferramentas para rotinas comuns de internação, transferência e alta, sem depender de serviços externos.

## Objetivo

O objetivo da extensão é reduzir atrito operacional dentro do SISREG III, principalmente em tarefas repetitivas que exigem muitas telas, cliques ou consultas manuais.

Em vez de alterar o funcionamento central do SISREG, a extensão complementa a interface existente com recursos de apoio para o operador.

## Funcionalidades

### 1. Coluna `Já Internado`

Na tela de laudos autorizados do menu de internação, a extensão adiciona uma coluna com checkbox para marcar pacientes que já foram internados ou que dependem de outra alta antes de nova ação.

Essa marcação:

- fica salva localmente no navegador via `localStorage`
- não depende de servidor externo
- serve apenas como apoio visual ao operador

### 2. `TRANSFERENCIAS ++`

Adiciona uma ferramenta para apoio à transferência entre clínicas, permitindo:

- listar pacientes internados em uma clínica
- filtrar resultados por texto do procedimento
- visualizar a ficha do paciente sem sair da tela atual
- transferir um paciente individualmente
- transferir vários pacientes da lista para outra clínica

### 3. `ALTAS ++`

Adiciona uma ferramenta no contexto de `SAÍDA/PERMANÊNCIA`, permitindo:

- buscar pacientes internados por clínica
- filtrar por CNS
- navegar entre páginas de resultados
- abrir a ficha do paciente em modal
- processar alta com motivo selecionado
- tentar obter automaticamente o número da AIH após a alta
- copiar a AIH obtida para a área de transferência

### 4. Ajuste do menu `SAÍDA/PERMANÊNCIA`

A extensão reorganiza esse trecho do menu para manter a entrada original do sistema e incluir a opção adicional `ALTAS ++`.

## Escopo de funcionamento

A extensão foi feita para rodar somente no domínio:

- `https://sisregiii.saude.gov.br/*`

Ela também restringe boa parte das melhorias ao contexto do perfil:

- `EXECUTANTE INT`

## Estrutura do projeto

Os arquivos principais do projeto são:

- [manifest.json](/home/roque/Documents/Projects/extensao-sisreg-executante/manifest.json): manifesto da extensão Chrome
- [src/content.js](/home/roque/Documents/Projects/extensao-sisreg-executante/src/content.js): script principal injetado nas páginas do SISREG
- [icons/icon16.png](/home/roque/Documents/Projects/extensao-sisreg-executante/icons/icon16.png): ícone da extensão
- [icons/icon32.png](/home/roque/Documents/Projects/extensao-sisreg-executante/icons/icon32.png): ícone da extensão
- [icons/icon128.png](/home/roque/Documents/Projects/extensao-sisreg-executante/icons/icon128.png): ícone da extensão

## Como instalar localmente

1. Abra `chrome://extensions`
2. Ative o `Modo do desenvolvedor`
3. Clique em `Carregar sem compactação`
4. Selecione a pasta deste projeto

Depois disso, abra o SISREG III normalmente.

## Como atualizar durante o desenvolvimento

Sempre que houver mudança no código:

1. Acesse `chrome://extensions`
2. Clique em `Recarregar` no cartão da extensão
3. Atualize a página do SISREG no navegador

## Permissões e acesso a dados

A extensão precisa acessar páginas do próprio SISREG para:

- ler informações exibidas na interface
- consultar páginas internas necessárias para ficha, alta, AIH e transferências
- inserir componentes visuais adicionais na tela

Ela não depende de backend próprio e não foi criada para enviar dados a servidores de terceiros.

## Limitações

- A extensão depende da estrutura HTML atual do SISREG III
- Mudanças no layout, nomes de campos, menus ou endpoints do sistema podem quebrar funcionalidades
- Como o comportamento é acoplado ao DOM do sistema, qualquer alteração no site pode exigir ajuste no código

## Aviso importante

Esta extensão não é oficial.

Ela não foi desenvolvida, mantida ou homologada pelo DATASUS, pelo Ministério da Saúde ou por qualquer órgão oficial relacionado ao SISREG.

Trata-se de uma ferramenta independente de apoio operacional.

## Licença

Este repositório ainda não possui licença definida.
