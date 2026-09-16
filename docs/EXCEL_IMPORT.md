# Importação de desempenho — CSV

Este nome de arquivo foi mantido por compatibilidade com a especificação inicial. O formato final é **CSV**. Excel e macros não são aceitos.

## Estrutura real inspecionada

A amostra de `Example/` usa Windows-1252 e ponto e vírgula, com 24 operações encerradas, 17 colunas e cabeçalho na linha 5. UTF-8 com ou sem BOM também é aceito.

Linhas iniciais: `Conta: …`, `Titular: …`, `Data: …`, linha vazia, cabeçalho e operações. O parser procura rótulos, não presume linhas nem posições fixas. Colunas podem ser reordenadas; acentos e caixa são normalizados. Suporta vários blocos de conta/titular/cabeçalho no arquivo ou arquivos separados por conta.

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

A análise confirmou que `Total` acumula `Res. Operação`. Somá-lo duplicaria resultados. As colunas `(%)` não comprovam retorno sobre capital e são ignoradas para rentabilidade. Custos ausentes do relatório podem ser refletidos no ajuste justificado do fechamento.

## Conversão e identidade

`1.234,56` vira Decimal diretamente, sem float. Dinheiro tem centavos; preços e quantidades, até quatro casas. Banco: NUMERIC(18,2) para dinheiro. API: strings decimais. Operações abertas, datas futuras, fechamento anterior à abertura e valores inválidos são rejeitados.

Conta é string, preservando zeros, hífens e caracteres. A chave normalizada remove espaços e padroniza caixa. Nome não é chave. Apelidos e primeira aparição são preservados; contas ausentes não são apagadas.

A identidade da operação combina conta, ativo, abertura, fechamento e lado. Reenvio idêntico é contado como duplicado e ignorado. Mesma identidade com valores diferentes rejeita o lote. Identidades repetidas dentro do mesmo arquivo são ambíguas e rejeitadas. O CSV não fornece ID único de execução; operações realmente distintas com os mesmos identificadores exigem revisão, em vez de duplicação silenciosa.

## Configuração e transação

Conta nova nasce sem capital/data presumidos e pede configuração. Operações anteriores ao início escolhido permanecem armazenadas, mas ficam fora dos indicadores. O apelido não altera o identificador original.

Extensão, MIME, bytes, tamanho (10 MB configuráveis), codificação e estrutura são validados. Máximo de 100 mil linhas. Conteúdos ZIP/Excel, bytes nulos e estrutura inesperada são rejeitados. Não se executam fórmulas ou código.

Uploads recebem nome aleatório e SHA-256 dos bytes originais, em diretório privado fora de `public`. Nome original é só metadado, sem compor caminhos. Lote é registrado antes do processamento; contas/operações são gravadas em uma transação. Falha faz rollback, remove o arquivo do lote incompleto e preserva status FAILED e auditoria. Erros não imprimem conteúdo financeiro ou nomes pessoais.

Importação e fechamento bloqueiam as contas durante a transação. Meses fechados aceitam reenvios idênticos, mas rejeitam operações novas. Importe o relatório completo antes da baixa. O original em `Example/` nunca é modificado ou publicado.
