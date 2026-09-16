# Metodologia contábil

Cada conta representa uma mesa/contrato independente. Capital inicial é limite de perda nominal, não patrimônio próprio. Usam-se operações encerradas após a data de início e ajustes confirmados. Não são inferidos custos, tributos, CDI, posições abertas, estratégias ou status de robôs.

| Indicador | Fórmula |
| --- | --- |
| Calculado do mês | Soma de Res. Operação por data de fechamento |
| Ajuste | Confirmado − calculado preservado |
| Resultado acumulado | Operações + ajustes |
| Saldo operacional | Resultado acumulado − lucro integral baixado |
| Disponível | Saldo anterior + confirmado do mês |
| Lucro baixado | max(0, disponível), se a mesa não foi perdida |
| Repasse | Lucro baixado × 0,90 |
| Parte da mesa | Lucro baixado − repasse |
| Saldo seguinte | Disponível − lucro baixado |
| Margem até a perda | max(0, limite + saldo); zero se perdida |
| Resultado / limite | Resultado acumulado ÷ limite × 100 |
| Drawdown absoluto | Maior recuo do resultado acumulado desde um pico |
| Drawdown percentual | −drawdown absoluto ÷ limite × 100 |

Dinheiro usa Decimal e arredondamento `ROUND_HALF_EVEN` em centavos. O preview do navegador é indicativo; a gravação sempre recalcula no backend. “Resultado / limite” é uma razão operacional, não TWR, IRR, retorno anualizado ou rentabilidade de dinheiro desembolsado.

A perda é verificada a cada operação e ajuste. Saldo menor ou igual ao negativo do limite marca perda, sem reversão automática por lucro posterior. Importações posteriores são preservadas como evidência, sem restaurar o direito a repasse. O CSV não permite medir perdas não realizadas de posições abertas. O drawdown usa a sequência intradiária de operações, não apenas os pontos diários; retiradas de lucro não contam como perda.

No consolidado, percentuais nunca são somados. A razão é a soma dos resultados das mesas configuradas dividida pela soma dos limites. Contas não configuradas mostram resultado importado, mas saldo/margem/percentual ficam indisponíveis. Drawdown percentual consolidado fica indisponível enquanto houver conta sem limite. Inativas continuam no histórico consolidado.

O gráfico carrega o último saldo de cada conta nas datas de operação das demais. O filtro de período altera a janela do gráfico, não os indicadores históricos. Cartões comparativos permanecem disponíveis quando o dashboard está filtrado.

Fechamentos são mensais, cronológicos e liberados após a virada do mês em `America/Sao_Paulo`. Meses sem operação podem ser fechados com zero ou ajustados com justificativa. Cada contrato apura o próprio repasse; não se compensam prejuízos entre contas.

Os valores calculado e confirmado são persistidos separadamente. Confirmar exige reconhecer o bloqueio para novas operações. Não há reabertura nesta versão. Limite e início não podem mudar após o primeiro fechamento; apelidos e status administrativo continuam editáveis. Registros de sistema/auditoria são UTC; operações usam o horário local informado no CSV.
