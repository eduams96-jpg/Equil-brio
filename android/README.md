# Android — fonte canónica

Candidata **0.9.0-rc.4**, versão interna **4**, identificador **pt.equilibrio.mobile**. Mesma chave da RC3: atualizar por cima, sem desinstalar. Piloto físico ainda pendente.

`app/` contém interface Capacitor e projeto Android nativo. `shared/` e `server/` adaptam as regras únicas de `../equilibrio/mobile-sync/` e incluem testes. Não há dependência de fontes em work/, de baselines de ensaio ou de outro projeto. É necessário o diretório equilibrio/ do mesmo checkout.

## Testes

Node.js 24. A partir da raiz:

```
node --test android/shared/*.test.cjs android/server/*.test.cjs android/app/src/*.test.cjs
```

Em android/app/: `npm ci` e `npm run build`. A app instalada contém as regras no bundle e não precisa da pasta Windows. www/build-info.json regista versões e hash. EQUILIBRIO_CORE_SOURCE permite testar uma fonte isolada; a compilação normal usa equilibrio/.

## APK assinado

Requer JDK 21 e SDK Android com as plataformas indicadas pelo projeto. Configurar JAVA_HOME e ANDROID_HOME, ou passar -JavaHome e -AndroidSdk:

```
powershell -NoProfile -ExecutionPolicy Bypass -File android/scripts/build-release.ps1
```

O script prepara recursos e executa assembleRelease e lintRelease. Resultado: app/android/app/build/outputs/apk/release/app-release.apk. Acumular alterações antes de compilar.

A chave existente pode ser fornecida por EQUILIBRIO_MOBILE_KEYSTORE e EQUILIBRIO_MOBILE_KEY_PASSWORD, ou pelo cofre local protegido do Windows. Nunca gerar outra chave para atualizar esta identidade. Não colocar palavras-passe em argumentos, logs ou Git. Uma cópia externa recuperável precisa do PKCS#12 e de uma palavra-passe independente deste Windows; password.dpapi sozinho não é portátil.

## Resultados e limites

194 testes de lógica/compatibilidade; compilação release e lint com zero erros e 18 avisos; assinatura igual à RC3. Emulador não substitui telefone real. Backup móvel limitado a 8 MiB de estado em claro; a repetição do ledger no histórico foi eliminada. Bases com muitos anexos precisam de confirmação no piloto; não apagar dados para contornar limites.

[Guia da candidata](../GUIA-CANDIDATA.md)
