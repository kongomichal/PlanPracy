# Instrukcje dla Agenta (Zawsze aktywne)

## 1. Całkowity zakaz dostępu i zmian w Panelu Muraven (Bezwzględny priorytet)
Ten projekt oraz czat służą **wyłącznie** do aplikacji **Muraven – Plan pracy** (`MuravenPlanPracy`).
Obowiązuje **całkowity i bezwzględny zakaz**:
- sprawdzania, odczytywania, przeszukiwania lub analizowania plików projektu **Panel Muraven** (np. `/Users/michalkubala/PanelMuraven`, `Panel Muraven.app` lub powiązanych repozytoriów),
- wprowadzania jakichkolwiek zmian, budowania, commitowania lub wypychania zmian w **Panelu Muraven** z poziomu tej konwersacji / tego workspace'u.

## 2. Automatyczny zapis i wysyłka zmian na GitHub
Zawsze i bez wyjątku po wprowadzeniu jakichkolwiek zmian w projekcie:
1. Zbuduj/zweryfikuj poprawność kodu.
2. Dodaj zmiany (`git add -A`) i stwórz czytelny commit w języku polskim (`git commit -m "..."`).
3. Od razu automatycznie wyślij zmiany do GitHuba (`git push origin main`) bez pytania użytkownika o potwierdzenie.
