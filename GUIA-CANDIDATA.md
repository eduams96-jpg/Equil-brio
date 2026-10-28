# Candidata de fecho — Windows 1.0.15 e Android RC4

Uma entrega consolidada para o piloto. A instalação habitual e os dados pessoais foram preservados.

## Instalar

Windows 1.0.11 a 1.0.14: guardar uma cópia de segurança e escolher o .fpupdate em **Definições → Backup e Atualização**. Não exige versões intermédias. Este pacote não atualiza versões iguais ou superiores a 1.0.15. Numa instalação inicial, usar Equilibrio-Setup-1.0.15.exe; o destino mantém Program Files (x86)/Equilibrio. Dados pessoais fora da pasta do programa.

Android: instalar Equilibrio-Android-0.9.0-rc.4.apk por cima da RC3. Não desinstalar. O protótipo antigo tem outra identidade e exige passagem explícita por exportação/recuperação.

Conferir SHA256.txt na entrega. Instalador e atualização correspondem à mesma fonte.

## Partilha privada

1. No PC central, abrir o espaço correto e **Definições → Partilha entre dispositivos → Este PC é central**. Preparar o certificado para o endereço desse PC, guardar o certificado público e iniciar a ligação. O programa precisa de permanecer aberto.
2. Autorizar cada aparelho separadamente, com nome e código temporário. Usar o endereço HTTPS apresentado e apenas o certificado público desse PC. Não transferir a chave privada nem abrir portas públicas no router.
3. Noutro Windows, escolher **Ligar a outro PC**, o espaço local e o certificado público. Confirmar a substituição inicial depois de guardar a cópia pretendida: recebe a base central e conserva uma cópia de recuperação; não junta bases diferentes.
4. No Android, instalar o certificado público pelo gestor de certificados do Android, abrir **Ligação** e indicar endereço e código. Se existirem dados locais, confirmar a substituição; o estado anterior fica num ponto de recuperação.
5. Trabalhar normalmente, mesmo offline, e usar **Sincronizar agora/Sincronizar**. Um conflito entre PCs pode exigir escolher a versão local ou central do espaço inteiro. Rever e guardar cópias antes de decidir.

O endereço deve ser alcançável na rede privada. Fora dela é necessária uma ligação privada previamente configurada. Esta entrega não instala servidor público nem serviço autónomo. Se o endereço do central mudar, rever configuração e certificado. Atualizar primeiro o central e depois os clientes.

Revogar um aparelho impede novos acessos, mas não apaga a cópia já existente nele. Após restauro do central, operações da geração anterior são recusadas: guardar trabalho local e seguir a recuperação/reassociação indicada. Parar a partilha e desligar associações antes de substituir/restaurar espaços.

## Piloto único

- Atualizar os dois PCs, confirmar versão e reabrir. Conferir contas, saldos, movimentos, anexos, ícones e preferências. Confirmar o destino do instalador numa instalação apropriada.
- Atualizar Android sem desinstalar. Conferir dados, ocultação de valores, reabertura, Resumo, contas, movimento/transferência, Agenda e Casa → Compras e Stock.
- Começar num espaço de teste. Associar os três aparelhos; criar um movimento em cada um e confirmar que aparece uma vez e os totais coincidem.
- Sem rede, registar e reabrir; voltar a ligar e sincronizar. Criar um conflito deliberado entre PCs e verificar a escolha e as cópias de recuperação.
- Exportar e recuperar uma cópia num perfil/espaço de teste, conferindo anexos. Não experimentar rollback destrutivo no espaço habitual.

Os ensaios locais cobrem interrupção, repetição, conflito, revogação, geração restaurada, perda de resposta e documentos. Rede real, fabricantes, permissões, bateria e suspensão exigem o piloto físico.

## Encerramento definitivo

Guardar fora deste PC a chave Android PKCS#12 e uma palavra-passe recuperável, por meios protegidos e separados. DPAPI depende deste Windows/utilizador. A Direção prepara a exportação quando existir destino externo; não foi inventada uma localização nem exportado um segredo para o projeto.

Continuam identificados: 16 embalagens por indicar no Excel e testes futuros com faturas/PDFs reais. Ler Fatura mantém revisão humana. Preços automáticos, novas funcionalidades de IA e publicação em loja ficam fora deste fecho.
