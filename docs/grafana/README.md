# Grafana dashboards

This directory ships dashboard JSON files intended to be imported into the
Scaleway Grafana instance that monitors PostGuard.

Files:

- `postguard-usage.json` — covers everything issue
  [encryption4all/cryptify#101](https://github.com/encryption4all/cryptify/issues/101)
  asks for: messages sent per channel (website / staging / Outlook /
  Thunderbird / API) and Cryptify storage usage for staging vs. Procolix
  production.

## Metrics source

Dashboards query Prometheus metrics exposed by Cryptify at `GET /metrics`.
The scrape target must be configured in Prometheus with two labels that the
dashboards rely on:

- `instance` — the hostname of the Cryptify instance
- `environment` — `staging` or `production`

Example Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: cryptify
    metrics_path: /metrics
    static_configs:
      - targets: ['cryptify-staging.postguard.eu:8000']
        labels:
          environment: staging
      - targets: ['cryptify.postguard.eu:8000']
          labels:
            environment: production
```

The `/metrics` endpoint is unauthenticated — restrict access to the Prometheus
network segment via firewall or reverse-proxy allow-list.

## Channel label

The `channel` label on upload counters is derived inside Cryptify from the
request headers (in order of priority):

1. `X-Cryptify-Source` (explicit) — set by the Outlook and Thunderbird addons
   once their follow-up PRs land. Expected values: `outlook`, `thunderbird`,
   `api`.
2. `Authorization: Bearer ...` or `X-Api-Key` — labelled `api`.
3. `Origin` — `staging.postguard.*` → `staging-website`, any other
   `postguard.*` → `website`.
4. `User-Agent` substrings — `outlook` / `thunderbird`.
5. Fallback — `unknown`.

## Importing

1. In Grafana, navigate to **Dashboards → Import**.
2. Upload `postguard-usage.json` or paste its contents.
3. Select the Prometheus datasource that scrapes Cryptify.

## Follow-up work

- Outlook addon: send `X-Cryptify-Source: outlook` on every upload request
  (via the SDK wrapper it uses to talk to Cryptify).
- Thunderbird addon: same with `thunderbird`.
- Until those land, requests from the addons fall back to the `User-Agent`
  rule, which is approximate but functional.
