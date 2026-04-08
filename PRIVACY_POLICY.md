# Política de Privacidade

Última atualização: 8 de abril de 2026

## 1. Apresentação

Esta Política de Privacidade descreve como a extensão `SISREG Executante` trata dados acessados durante seu uso no Google Chrome.

A extensão foi desenvolvida para auxiliar operadores do perfil `EXECUTANTE INT` no SISREG III, adicionando funcionalidades de apoio às rotinas de internação, transferência e alta diretamente na interface do sistema.

Esta extensão não é oficial e não possui vínculo com o DATASUS, com o Ministério da Saúde ou com qualquer órgão público responsável pelo SISREG.

## 2. Quais dados a extensão acessa

Para funcionar, a extensão interage com a interface web do próprio SISREG III aberta pelo usuário autenticado.

Isso significa que ela atua sobre páginas do sistema que podem exibir dados sensíveis já disponibilizados pelo SISREG ao operador, na sessão regular de uso do sistema.

A extensão não cria base de dados própria de pacientes, não mantém cadastro paralelo e não realiza coleta independente fora do contexto da página acessada pelo usuário.

Ao executar suas funcionalidades, ela pode interagir com elementos da página que contenham, por exemplo:

- dados exibidos nas telas de internação, transferência e alta
- nome do paciente
- CNS e outros identificadores exibidos pelo sistema
- procedimento, clínica, datas e informações relacionadas à internação
- ficha do paciente exibida pelo próprio SISREG
- número de AIH quando disponível no fluxo operacional do sistema

Em outras palavras, a extensão não “busca” informações fora do SISREG nem amplia o escopo de acesso do operador; ela apenas reorganiza, apresenta e utiliza, dentro do navegador, informações já acessíveis ao usuário no próprio sistema para viabilizar as funcionalidades descritas.

## 3. Como esses dados são usados

Os dados acessados são utilizados exclusivamente para viabilizar as funcionalidades da extensão dentro do SISREG III, incluindo:

- adicionar marcadores visuais e melhorias de interface
- listar pacientes internados
- permitir visualização da ficha do paciente na própria tela
- apoiar rotinas de transferência entre clínicas
- apoiar rotinas de alta e obtenção do número da AIH

A extensão não utiliza esses dados para publicidade, perfilização, analytics, venda de informações ou qualquer finalidade não relacionada ao seu propósito operacional.

## 4. Compartilhamento de dados

A extensão não vende, não compartilha e não transfere dados para servidores de terceiros.

Os dados tratados pela extensão permanecem no navegador do usuário e no próprio ambiente do SISREG III, utilizando a sessão autenticada já existente do operador para acessar páginas internas do sistema quando necessário.

## 5. Armazenamento local

A extensão armazena localmente no navegador apenas a informação mínima necessária para a funcionalidade `Já Internado`, usada como apoio visual na interface.

Na prática, esse armazenamento local contém somente:

- o código de solicitação da AIH no SISREG
- um valor booleano indicando se aquela solicitação foi marcada pelo usuário como `Já Internado`

Esse armazenamento local não inclui, por si só:

- nome do paciente
- CNS
- ficha do paciente
- número de AIH
- procedimento
- dados clínicos, observações ou qualquer outro conteúdo textual da tela

Ou seja, a extensão não grava localmente uma cópia dos dados sensíveis exibidos pelo SISREG. Fora do próprio SISREG, ela persiste apenas o marcador visual associado ao identificador da solicitação.

Esse armazenamento:

- é mantido localmente no navegador do usuário
- não é enviado a servidores de terceiros
- não é usado para rastreamento, publicidade ou perfilização

## 6. Permissões e acesso ao site

A extensão solicita acesso ao domínio:

- `https://sisregiii.saude.gov.br/*`

Esse acesso é necessário para:

- ler e ajustar elementos da interface do SISREG III
- consultar páginas internas usadas pelas funcionalidades da extensão
- exibir conteúdos do próprio sistema de forma mais prática ao operador

## 7. Segurança

A extensão foi desenvolvida para minimizar o tratamento de dados ao estritamente necessário para suas funcionalidades.

Ela não cria conta de usuário própria, não coleta login ou senha do SISREG, não instala código remoto e não envia dados operacionais para serviços externos.

## 8. Limitações

O funcionamento da extensão depende da estrutura atual do SISREG III. Mudanças nas páginas, menus, formulários ou endpoints do sistema podem impactar seu funcionamento.

## 9. Alterações nesta política

Esta Política de Privacidade pode ser atualizada para refletir mudanças na extensão, em seus recursos ou em exigências aplicáveis da Chrome Web Store.

A versão mais recente será sempre a publicada neste repositório.

## 10. Contato

Para dúvidas, sugestões ou relato de problemas, utilize o repositório do projeto:

- https://github.com/SandroRoque/extensao-sisreg-executante
