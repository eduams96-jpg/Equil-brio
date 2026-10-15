# Equilíbrio 1.0

Instalação Windows: executar `Equilibrio-Setup-1.0.0.exe`. O destino inicial é `C:\Program Files (x86)\Equilibrio`; o instalador permite escolher outro. A aplicação é de 64 bits e inclui o runtime, sem exigir Node.js ao utilizador. O Windows pede autorização de administrador para a instalação.

Os dados continuam no perfil habitual `%APPDATA%\Financas Pessoais`, fora da instalação. A reinstalação e a desinstalação conservam esse perfil. SQLite continua a ser a fonte de verdade. Instalar o programa no segundo PC não transfere dados: usar a cópia e o restauro nas Definições.

As próximas versões continuam a chegar como `.fpupdate`, em **Definições → Backup e Atualização**. Na instalação protegida, o Windows pede autorização para substituir os ficheiros. Cancelar esse pedido mantém o programa aberto e os ficheiros intactos. A atualização conserva staging, cópia de reversão e cópia dos dados. Uma recuperação interrompida pode voltar a pedir autorização de administrador ao iniciar.

O pacote `financas-pessoais-v1.0.0.fpupdate` atualiza apenas a versão 0.41.10. O instalador pode ser usado diretamente para instalar a 1.0.

Casa: cada produto pode guardar um link HTTP/HTTPS opcional, editável no formulário e acessível na ficha. O endereço é conservado nas cópias e no SQLite; não há consulta automática de preços.

O código de desenvolvimento permanece em `equilibrio/`; `INICIAR-DESKTOP.bat` mantém esse percurso. Android, servidor e as restantes alterações Casa ficam para rondas futuras.
