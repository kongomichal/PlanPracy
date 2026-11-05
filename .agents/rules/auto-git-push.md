---
trigger: always_on
---

# Automatyczny zapis i wysyłka zmian na GitHub (Zawsze aktywne)

Zawsze i na bieżąco po wprowadzeniu jakichkolwiek zmian w projekcie:
1. Zweryfikuj poprawność kodu.
2. Dodaj zmiany (`git add -A`) i utwórz commit w języku polskim (`git commit -m "..."`).
3. Natychmiast automatycznie wypchnij zmiany na GitHub (`git push origin main`), nie czekając na osobne polecenie od użytkownika.

