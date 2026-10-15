; Keep the x64 runtime, using the installation directory requested by the owner.
!macro customInit
  ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R1 == ""
    !insertmacro GetDParameter $R0
    ${If} $R0 == ""
      StrCpy $INSTDIR "$PROGRAMFILES32\Equilibrio"
    ${EndIf}
  ${EndIf}
!macroend
