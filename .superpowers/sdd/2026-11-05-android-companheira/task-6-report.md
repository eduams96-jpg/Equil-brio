# Task 6 report
Implemented in equilibrio/mobile-sync/shared/house.cjs: house.shopping now accepts toggle|remove|set-done|add|queue|update. add/queue create with id=p.id (creating=true), fail "O artigo já existe." if id exists (queue never updates). set-done idempotent (toggles only if different; true also clears notFound). update delegates to CasaComplete.updateShopping. Per-operation field whitelist -> "Campo Casa não suportado."; value validation (name 1-160, qty<=80, requestedQty>0, override packages int>=1, price>0). Finance guard unchanged.
TDD: RED = 3 new tests failed with "Artigo indisponível." before implementation; GREEN = house.test 12/12 (4 new tests in android/shared/house.test.cjs).
Suites: Android 263 pass/0 fail (259+4); Windows npm test 683 pass/0 fail.
Concerns: android/shared/house.cjs re-exports, untouched. CRLF preserved (diff stat small).
