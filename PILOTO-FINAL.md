# Piloto final — uma única ficha

Windows 1.0.15 · Android 0.9.0-rc.4. Este documento é o guião de origem. A ficha editável fica em `coordenacao/relatorios/PILOTO-PROPRIETARIO/RESULTADOS.md`, fora da publicação Git. Todos os testes físicos começam como **Por testar**; a validação em laboratório não os preenche.

## Preparação

Usar os ficheiros de `entrega-v1.0.15/` e o respetivo `LEIA-ME.md`. Registar a versão anterior e posterior em cada aparelho. Guardar uma cópia antes de atualizar. Atualizar primeiro o PC central, depois o outro PC e o Android; atualizar a app sem a desinstalar.

Criar um espaço separado **Piloto final**, com contas fictícias **Banco: 1000 €** e **Carteira: 200 €**. A associação recebe os dados desse espaço central, não junta duas bases. No cliente Windows, escolher igualmente um espaço de teste; no telefone, rever a confirmação de substituição e o ponto de recuperação antes de associar. Não substituir o espaço habitual para ensaiar restauros ou conflitos.

## Percursos e valores esperados

| Caso | Ação | Resultado esperado |
|---|---|---|
| P01 | Atualizar/reabrir nos dois PCs e Android | Versões 1.0.15/RC4; dados, anexos, ícones e preferências conservados; no Windows confirmar destino Program Files (x86)/Equilibrio |
| P02 | Associar os dois clientes ao espaço central de teste, por HTTPS | Mesmo total de **1200 €** nos três; restantes espaços Windows preservados |
| P03 | No central, despesa de 10 € em Banco; sincronizar os clientes | Banco 990 €, Carteira 200 €, total **1190 €**; um movimento |
| P04 | No segundo PC, transferir 50 € de Banco para Carteira e sincronizar | Banco 940 €, Carteira 250 €, total **1190 €**; duas operações; despesas continuam em 10 € |
| P05 | Sem rede no Android, despesa de 5 € em Carteira; fechar/reabrir, repor rede e sincronizar | Proposta sobrevive offline; Banco 940 €, Carteira 245 €, total **1185 €**, três movimentos nos três clientes |
| P06 | Sincronizar novamente nos três | Mesmos três movimentos e **1185 €**, sem pagamentos repetidos |
| P07 | Alterar a descrição da mesma despesa nos dois PCs antes de sincronizar | Diferença explícita; escolher a versão central no cliente conserva recuperação local; montantes e total não mudam |
| P08 | No Android, guardar e recuperar uma cópia com anexo, na mesma associação de teste | Palavra-passe errada não substitui dados; cópia correta repõe os registos/anexo; reabrir e sincronizar não duplica |
| P09 | Android: teclado, Voltar, rascunho, ocultar valores, suspensão e reabertura | Cancelar não cria movimentos; preenchimento retomável; privacidade conservada; confirmar novamente o total |
| P10 | Agenda Windows: compromisso anual e bimestral de teste, sem os pagar | Aparecem no mês/frequência escolhidos; o simples agendamento não altera o saldo |
| P11 | Android: consultar Agenda; produto/oferta com link, compra e stock fictícios | Dados conservados após reabrir/sincronizar; sem criar uma despesa financeira automática |
| P12 | Verificar a cópia portátil da assinatura noutro PC | Chave/certificado corretos sem depender do Windows original; confirmar guarda externa e palavra-passe separada |
| P13 | No fim, guardar cópia do espaço Windows de teste; parar a partilha no central e desligar a associação no segundo PC antes de ensaiar o restauro Windows | Escolher explicitamente substituir o espaço de teste atual: regressam os valores/anexos, sem outro «recuperado» inesperado nem alterações aos restantes espaços; reassociar apenas após conferir |

Os 1185 € são a referência dos casos P05–P09. Fazer P11 depois dos testes financeiros; usar apenas dados fictícios. Um resultado diferente é anotado para investigação, não corrigido à força no espaço habitual.

## Documentos e dados adiados

Quando houver documentos disponíveis, escolher uma fatura real com total conhecido, um PDF com texto e um PDF digitalizado. Conferir fornecedor/data/linhas/total no Ler Fatura antes de guardar. Na pesquisa, procurar uma expressão que se sabe existir e registar os casos encontrados ou não encontrados. Uma digitalização sem texto depende da leitura/OCR disponível; anotar a limitação encontrada.

As 16 embalagens em falta no Excel são preenchidas a partir das embalagens reais ou informação confirmada pelo proprietário. Não inventar unidades/quantidades para remover avisos. Estes dois assuntos podem continuar adiados de forma explícita.

## Como devolver um problema

Na ficha local, indicar caso, aparelho/versão, página, passos, resultado esperado e ocorrido. Juntar imagem apenas se ajudar e sem palavras-passe, códigos de associação ou dados pessoais desnecessários. Não publicar backups pessoais ou a chave no GitHub.

A Direção analisa os resultados, corrige defeitos reproduzidos e repete apenas os percursos afetados. A promoção definitiva continua dependente deste piloto; não se inicia outro redesenho.
