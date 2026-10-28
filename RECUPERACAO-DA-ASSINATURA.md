# Recuperação da assinatura Android

A chave permite continuar a atualizar a mesma app. O procedimento está preparado e foi ensaiado com uma chave fictícia. **A chave real ainda não foi exportada nem confirmada fora do PC.**

## Criar a cópia quando escolheres o destino

Escolher uma pasta existente numa unidade externa ou localização de rede protegida que seja guardada independentemente deste computador. Uma pasta no outro disco interno não confirma essa proteção. Não usar a pasta do projeto ou o cofre original.

No PowerShell 7.2 ou superior, a partir da raiz do projeto, executar este comando substituindo os dois caminhos pelos escolhidos:

```powershell
pwsh -NoProfile -File android/scripts/backup-signing-key.ps1 -Destination 'CAMINHO_ABSOLUTO_DA_PASTA_EXTERNA' -JavaHome 'CAMINHO_DO_JDK_21'
```

O script pede duas vezes uma **nova palavra-passe**, com pelo menos 12 caracteres. Não a escrever nos argumentos, neste documento ou no chat. O cofre atual é lido no Windows original e a chave é copiada para um novo PKCS#12, com a nova proteção; o original permanece intacto. O alias `equilibrio` e o certificado da app são conferidos e a chave privada assina um desafio de verificação.

É criada uma pasta `Equilibrio-chave-…` com apenas:

- `equilibrio-mobile.p12`: chave privada com a nova palavra-passe;
- `MANIFESTO.json`: identificação pública e hashes;
- `LEIA-ME.txt`: indicações de recuperação.

Guardar **a pasta completa e a nova palavra-passe separadamente**. O ficheiro `password.dpapi` não é uma cópia portátil e não faz parte desta exportação.

## Verificar noutro PC

Levar também os dois ficheiros públicos `backup-signing-key.ps1` e `signing-key-backup.psm1`, disponíveis em `android/scripts/` ou em `entrega-v1.0.15/recuperacao/`. Não precisam da chave original, do JDK, do projeto completo ou do ficheiro DPAPI para verificar a cópia. Precisam do PowerShell 7.2 ou superior.

Na pasta dessas ferramentas:

```powershell
pwsh -NoProfile -File ./backup-signing-key.ps1 -BackupFolder 'CAMINHO_DA_PASTA_Equilibrio-chave'
```

Introduzir a nova palavra-passe quando for pedida. A verificação confere o ficheiro, o certificado esperado e uma assinatura feita com a chave privada. Não instala certificados no Windows.

O teste técnico já confirmou este percurso numa sessão independente, depois de remover o original fictício. **A confirmação no segundo PC e a guarda externa real continuam pendentes.** Registar apenas o resultado e a localização geral da cópia na ficha local do piloto; nunca a palavra-passe ou o conteúdo da chave.

## Retomar uma compilação futura

O ficheiro é PKCS#12 normal, com alias `equilibrio`. O script de compilação existente aceita o caminho em `EQUILIBRIO_MOBILE_KEYSTORE` e a palavra-passe em `EQUILIBRIO_MOBILE_KEY_PASSWORD`. Usar a cópia e a palavra-passe recuperadas; não gerar outra chave para a identidade `pt.equilibrio.mobile`. Manter as credenciais apenas na sessão de compilação, seguindo o procedimento de manutenção.

Os instaladores e o APK atuais não mudaram nesta preparação.
