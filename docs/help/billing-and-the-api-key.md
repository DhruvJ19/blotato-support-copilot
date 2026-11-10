Status: draft for help.blotato.com
Source: support copilot, checked against the public API docs on 2026-11-10

# Billing and the API key

Plan questions and publish failures are different tickets. A charge is handled in Settings > Billing. A failed post is handled from its `errorMessage`. Do not reconnect a social account to fix an invoice.

## Where to look

Open **Settings > Billing** for the plan name and the latest charge. The API reports the plan as `starter`, `creator`, or `agency` on `GET /v2/users/me`.

A `403` that mentions the subscription is a billing block. Check the plan before retrying the same request. The error body can include `subscriptionStatus` and a `reqId`. Keep the `reqId` if you write to support. Leave the API key out of the email.

## The API key starts the paid plan

The key lives in **Settings > API**. Generating a key ends the free trial and starts the paid subscription. If a customer says they were charged right after "turning on the API", that click is the first thing to compare with the charge date.

Copy the whole key, including any `=` characters at the end, with no spaces. The header on every request is `blotato-api-key`. A `401` means that header was missing or wrong. Check it with `GET /v2/users/me/accounts` before any publish.

Do not paste the key into a chat, a ticket, or a workflow file. In n8n, store it as an environment variable or a credential.

## AI credits are a separate balance

"You ran out of AI credits" blocks visual generation. It does not mean the social login expired, and it does not mean a finished post failed to publish. Check the credit balance in Settings > Billing. The credits API is `GET /v2/credits`.

## Refunds

Support replies can explain a charge. They cannot approve a refund from the ticket. Ask for the charge date and the last four digits of the card when two charges look like the same period. A person on billing confirms the refund.

Connected-account limits and the monthly active-contact limit also show up as plan errors. `GET /v2/users/me/usage` returns the connected-account count, the contacts used this month, and the contact limit (`unlimited` on plans that have no cap).
