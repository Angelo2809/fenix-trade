# Importação de desempenho — CSV

Este nome de arquivo foi mantido por compatibilidade com a especificação inicial. O formato final é **CSV**. Excel e macros não são aceitos.

## Estrutura real inspecionada

As amostras de `Example/` usam Windows-1252 e ponto e vírgula. Há um modelo diário, cujo cabeçalho começa na linha 5, e um modelo por período, cujo cabeçalho começa na linha 6. UTF-8 com ou sem BOM também é aceito.

Linhas iniciais: `Conta: …`, `Titular: …`, uma linha `Data: …` ou o par `Data Inicial: …` e `Data Final: …`, linha vazia, cabeçalho e operações. O parser procura rótulos, não presume linhas nem posições fixas. Colunas adicionais, como `Subconta`, são ignoradas; as colunas usadas podem ser reordenadas. Acentos e caixa são normalizados. Suporta vários blocos de conta/titular/cabeçalho no arquivo ou arquivos separados por conta.

| Coluna original | Uso |
| --- | --- |
| Ativo | Instrumento da operação |
| Abertura / Fechamento | Data local `dd/mm/aaaa HH:MM:SS` |
| Tempo Operação | Informativo |
| Qtd Compra / Qtd Venda | Decimal persistido |
| Lado | C ou V |
| Preço Compra / Preço Venda | Decimal persistido |
| Preço de Mercado / Médio | Não usados no resultado realizado |
| Res. Intervalo Bruto | Não somado ao resultado de operação |
| Res. Intervalo (%) | Não usado como retorno da mesa |
| Res. Operação | Resultado monetário individual utilizado |
| Res. Operação (%) | Não usado como retorno da mesa |
| TET | Informativo |
| Total | Acumulado; nunca somado |

A análise confirmou que `Total` acumula `Res. Operação`. Somá-lo duplicaria resultados. As colunas `(%)` não comprovam retorno sobre capital e são ignoradas para rentabilidade. Como o relatório não traz os custos, o sistema calcula as taxas configuradas para WIN e WDO sobre `Qtd Compra + Qtd Venda`. O resultado líquido é o resultado bruto menos essas taxas.

## Conversão e identidade

`1.234,56` vira Decimal diretamente, sem float. Dinheiro tem centavos; preços e quantidades, até quatro casas. Banco: NUMERIC(18,2) para dinheiro. API: strings decimais. Operações abertas, datas futuras, fechamento anterior à abertura e valores inválidos são rejeitados.

Conta é string, preservando zeros, hífens e caracteres. A chave normalizada remove espaços e padroniza caixa. Nome não é chave. Apelidos e primeira aparição são preservados; contas ausentes não são apagadas.

A identidade da operação combina conta, ativo, abertura, fechamento e lado. Reenvio idêntico é contado como duplicado e ignorado. Mesma identidade com valores diferentes rejeita o lote. Identidades repetidas dentro do mesmo arquivo são ambíguas e rejeitadas. O CSV não fornece ID único de execução; operações realmente distintas com os mesmos identificadores exigem revisão, em vez de duplicação silenciosa.

## Configuração e transação

O upload começa por uma prévia que não grava contas nem operações. Para cada número encontrado, o administrador confirma um destino existente ou preenche um novo cadastro com capital, data, quatro taxas e a escolha obrigatória Sim/Não para mesa proprietária, inicialmente sem seleção. Ao escolher Sim, seleciona uma mesa da lista ou marca Nova mesa proprietária e informa um nome único. A confirmação grava todo o lote em uma transação.

O mesmo número de conta pode existir em várias mesas. A identidade do cadastro é o número normalizado mais a mesa (ou conta própria); duplicidade, conflitos, limites, taxas e fechamentos são apurados nesse cadastro. Relatórios de mesas distintas podem ter os mesmos períodos e operações. O número ou as datas nunca selecionam uma mesa automaticamente. Um CSV que contenha vários números exige a escolha de destino para todos eles.

Operações anteriores ao início escolhido permanecem armazenadas, mas ficam fora dos indicadores. A mesa de um histórico já classificado não é alterada por edição do cadastro; outros relatórios devem ser enviados ao destino correspondente. Contas próprias usam as taxas de conta real desde a primeira operação. O dashboard permite consolidar por número de conta e por mesa.

Extensão, MIME, bytes, tamanho (10 MB configuráveis), codificação e estrutura são validados. Máximo de 100 mil linhas. Conteúdos ZIP/Excel, bytes nulos e estrutura inesperada são rejeitados. Não se executam fórmulas ou código.

Uploads recebem nome aleatório e SHA-256 dos bytes originais, em diretório privado fora de `public`. Nome original é só metadado, sem compor caminhos. Lote é registrado antes do processamento; contas/operações são gravadas em uma transação. Falha faz rollback, remove o arquivo do lote incompleto e preserva status FAILED e auditoria. Erros não imprimem conteúdo financeiro ou nomes pessoais.

Importação e fechamento bloqueiam as contas durante a transação. Meses fechados aceitam reenvios idênticos, mas rejeitam operações novas. Importe o relatório completo antes da baixa. O original em `Example/` nunca é modificado ou publicado.
