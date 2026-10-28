# Equilíbrio Windows 1.0.7 — Piloto Compras e Movimentos

Atualizar pelo .fpupdate em Definições → Backup e Atualização. Compatível com Windows 1.0.0 a 1.0.6. Não altera a instalação automaticamente.

Em Casa → Compras, «Ativar piloto» abre o teste apenas no espaço atual. É opcional e começa desligado. Escolhe uma compra existente, um pagamento existente e a parcela que lhes corresponde. Podem ter datas diferentes; vários pagamentos podem repartir uma compra e várias compras repartir um pagamento.

Nenhum registo é associado automaticamente. As edições normais nas origens mostram diferenças; só a pré-visualização confirmada pode atualizar valores. Compra → Pagamento altera apenas o valor financeiro pela diferença da parcela, mantendo conta e data. Pagamento → Compra exige os preços de cada artigo e o desconto, mantendo os artigos, as quantidades e o stock. Conferir associação altera apenas a parcela e a conferência das origens.

Se as duas origens mudarem, é necessário conferi-las antes de propagar. Despesas com prestações, recorrências, divisões, devoluções ou outras operações, meses fechados e pagamentos conferidos ficam protegidos. As ligações históricas mantêm o seu funcionamento e não são convertidas para o piloto.

Retirar uma associação preserva as origens. Desligar preserva associações e histórico. Desfazer segue a ordem inversa das operações e exige que o estado afetado não tenha mudado; movimentos independentes mantêm-se. Limites: 100 associações, 100 operações e 8 MiB de histórico por espaço; atingir um limite recusa a alteração, não elimina evidência.

Backup e passagem entre espaços preservam as associações e o histórico. O destino não é ativado pelo ato de transferir. Ao mapear para outra conta, a associação pede nova conferência; o histórico anterior mantém-se, mas desfazer uma operação do espaço anterior é recusado se os registos já não corresponderem.

Este é um piloto para avaliação, não a adoção definitiva da sincronização. Pendentes: experiência do proprietário com compras e pagamentos reais e decisão de manter/ajustar o teste. OCR avançado, preços online e Android ficam noutras rondas.
