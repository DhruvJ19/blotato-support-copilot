# Eval report (2026-11-11T05:17:40.830Z)

Ticket routing: 30/30 correct (100%)
Held-out routing (never tuned on): 14/15 correct
Error to fix mapping: 30/30 correct (100%); wrong fix given: 0; sent to a person as unmapped when a rule existed: 0

## Routing confusion (rows expected, columns got)

| expected | billing | how-to | technical |
|---|---|---|---|
| billing | 7 | 0 | 0 |
| how-to | 0 | 7 | 0 |
| technical | 0 | 0 | 16 |

## Failures


## Held-out misses (known, left unfixed on purpose)

- h15 expected billing, got how-to: "Do you offer a discount for nonprofits?"
