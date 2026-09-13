# Modifiche richieste da Lucia

## 1. Coach House
- Aggiunto nuovo alloggio `apt_ch` / **Coach House**.
- Capienza impostata a **3 persone** (1 letto matrimoniale + 1 letto singolo, in base alla planimetria ricevuta).
- Aggiunta la scheda **Coach House** nel Room Planner.
- Aggiunta la planimetria cliccabile.
- Incluse le 4 foto ricevute nel progetto come fallback locale.

## 2. Arrival date configurabile
- La tabella `events` usa il nuovo campo `arrival_start_date`.
- In creazione evento l'admin può scegliere la prima data da cui gli ospiti possono arrivare.
- Di default coincide con la data dell'evento.
- Nel dettaglio evento admin la data può essere modificata in seguito.
- Nel portale ospiti il menu Check-in viene generato automaticamente da `arrival_start_date` fino a `start_date`.

Esempio: evento 16/09/2026, Arrival date 13/09/2026:
- 13/09/2026 (3 days before)
- 14/09/2026 (two days before)
- 15/09/2026 (one day before)
- 16/09/2026 (event day)

## Prima del deploy
Eseguire una sola volta su Neon il file:

`RUN_THIS_IN_NEON.sql`

Poi effettuare il deploy della nuova versione.
