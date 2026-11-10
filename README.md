# Bouncer

Bouncer keeps bots out of your self-hosted [Umami](https://umami.is) analytics. It sits between your website and your Umami server, drops events that come from bots, and forwards the rest to Umami. Bouncer doesn't block bots from visiting your website, but they won't pollute your analytics.

Adding Bouncer is a simple hostname swap. Wherever your site points at Umami today, point it at Bouncer instead.

## Filters

Each event goes through these filters in order. The first one that matches drops the event.

| Setting              | Drops the event when                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `automated_browsers` | the browser is controlled by automation tools, such as Selenium, Playwright or Puppeteer      |
| `ua_bot_detection`   | the browser's user agents belongs to a bot                                                    |
| `datacenter_ips`     | the visitor IP belongs to a hosting provider                                                  |
| `vpn_ips`            | the visitor IP belongs to a VPN provider (this includes iCloud Private Relay users)           |
| `referrer_spam`      | the referrer's domain, or a parent domain, is on a spam list                                  |
| `header_anomalies`   | the request has no `User-Agent` or no `Accept-Language` header                                |
| `origin_mismatch`    | the request has no `Origin` header, or its host differs from the page's hostname in the event |

## Setup

Bouncer supports Umami v2.17.0 and later, and is offered as a [Docker image on ghcr.io](https://ghcr.io/loopwerk/bouncer).

If you build Umami yourself, leave `COLLECT_API_HOST` and `COLLECT_API_ENDPOINT` unset. They're baked into the tracker script, so visitors' browsers would send events to a different host or path and skip Bouncer's filters.

### Configuration

Bouncer reads its settings from environment variables, a YAML file, or both; environment variables win. The file is `bouncer.config.yml` in the working directory, or the path in `BOUNCER_CONFIG`. Start from [`bouncer.config.example.yml`](bouncer.config.example.yml).

```yaml
upstream: https://umami.example.com
ip_header: CF-Connecting-IP

filters:
  automated_browsers: true
  datacenter_ips: true
  vpn_ips: false
  ua_bot_detection: true
  referrer_spam: true
  header_anomalies: true
  origin_mismatch: true

server:
  port: 3100
  host: 0.0.0.0

log_level: info
```

Only `upstream` is required. `ip_header` is not set by default; the other values above are the defaults.

The environment variables are `BOUNCER_UPSTREAM`, `BOUNCER_IP_HEADER`, `BOUNCER_FILTER_AUTOMATED_BROWSERS`, `BOUNCER_FILTER_DATACENTER_IPS`, `BOUNCER_FILTER_VPN_IPS`, `BOUNCER_FILTER_UA_BOT_DETECTION`, `BOUNCER_FILTER_REFERRER_SPAM`, `BOUNCER_FILTER_HEADER_ANOMALIES`, `BOUNCER_FILTER_ORIGIN_MISMATCH`, `BOUNCER_PORT`, `BOUNCER_HOST` and `BOUNCER_LOG_LEVEL`.

#### `upstream`

Your Umami server's URL. Bouncer fetches `<upstream>/script.js` and forwards events to `<upstream>/api/send`.

#### `ip_header`

The header that holds the visitor's IP. Usually something sits in front of Bouncer (a CDN, a reverse proxy, or your site's own proxy), so the connection to Bouncer doesn't come from the visitor.

| Bouncer runs…            | `ip_header`                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| exposed directly         | leave it out; Bouncer uses the connection's IP                                            |
| behind Cloudflare        | `CF-Connecting-IP`                                                                        |
| behind a reverse proxy   | the header it sets, e.g. `X-Real-IP`, or `X-Forwarded-For` (Bouncer uses the first entry) |
| behind your site's proxy | the header your site's proxy sets                                                         |

When `ip_header` is set and a request doesn't have it, Bouncer drops the event. After setting up Bouncer, check the logs for `missing_ip` lines.

Bouncer trusts the header as-is. A request posted straight to Bouncer can fake it; see [Limitations](#limitations).

### Connecting your site

There are two ways, matching the two ways sites load Umami today.

#### Change the script's URL in your HTML

```html
<!-- Before -->
<script defer src="https://umami.example.com/script.js" data-website-id="…"></script>

<!-- After -->
<script defer src="https://bouncer.example.com/script.js" data-website-id="…"></script>
```

If the tag has a `data-host-url` attribute pointing at Umami, remove it. Always use the `/script.js` path, even if you've configured Umami to use a custom script name (`TRACKER_SCRIPT_NAME`).

#### Point your site's proxy at Bouncer

Many sites proxy Umami through their own domain, so ad blockers don't block it. Change the proxy's destination from Umami to Bouncer, and pass the visitor's IP along. For nginx:

```nginx
location = /script.js {
    proxy_pass https://bouncer.example.com/script.js;
    proxy_set_header Host bouncer.example.com;
    proxy_ssl_server_name on;
}

location = /api/send {
    proxy_pass https://bouncer.example.com/api/send;
    proxy_set_header Host bouncer.example.com;
    proxy_ssl_server_name on;
    proxy_set_header X-Client-Real-IP $remote_addr;
}
```

Then set Bouncer's `ip_header` setting to `x-client-real-ip`. Umami needs no changes: Bouncer passes the visitor's IP to Umami inside the event.

> [!TIP]
> A custom header name is safer than `X-Real-IP` or `X-Forwarded-For`: CDNs and proxies between your site and Bouncer can rewrite the standard ones.

If your site is behind Cloudflare, use `$http_cf_connecting_ip` instead of `$remote_addr`.

### Running with Docker

```sh
docker run -p 3100:3100 -e BOUNCER_UPSTREAM=https://umami.example.com -e BOUNCER_IP_HEADER=CF-Connecting-IP ghcr.io/loopwerk/bouncer:latest
```

To use a config file instead, mount it at `/app/bouncer.config.yml`.

### Running on Coolify

1. Create an application with the Docker Image option, using `ghcr.io/loopwerk/bouncer:latest`.
2. Set the exposed port to `3100` and give it a domain.
3. Add the environment variables `BOUNCER_UPSTREAM` and `BOUNCER_IP_HEADER`. Coolify's proxy sits in front of Bouncer, so `BOUNCER_IP_HEADER` is always needed: `CF-Connecting-IP` behind Cloudflare, `X-Forwarded-For` without a CDN, or the custom header your site's proxy sets.
4. Deploy.

### Reaching Umami

Bouncer's requests to Umami come from Bouncer's server. If Umami sits behind a firewall or Cloudflare rules, make sure they let Bouncer through.

## Limitations

- Umami only - Plausible support is planned for a future release.
- Self-hosted Umami only - Umami's cloud-hosted version is not supported at this point.
- Bouncer targets bots that visit your site and run the tracker. A bot that posts events straight to Bouncer can fake the IP header.
- Bots that post straight to Umami skip Bouncer entirely.
- No residential proxy, threat IP or behavioral detection.

## Recommended setup

### Only let Bouncer reach Umami's `/api/send`

Bouncer only sees the events that go through it. A bot that posts straight to Umami's `/api/send` skips Bouncer entirely, so block that path for everything except Bouncer's server. Behind Cloudflare, that's a custom rule that blocks `/api/send` unless `ip.src` is Bouncer's IP.

If your backend also sends events with Umami's API, allow its IP as well. Don't send those events through Bouncer: they don't come from a browser, so `origin_mismatch` drops them, and `datacenter_ips` and `header_anomalies` likely do too.

### Pass the `Origin` header on to Bouncer

If a proxy between the browser and Bouncer removes the `Origin` header, turn `origin_mismatch` off, or it drops every event. nginx passes the header on by default.

## Logs

Bouncer writes one JSON object per line to stdout.

```json
{"time":"2026-11-06T16:12:25.530Z","level":"info","msg":"drop","reason":"datacenter_ip","ip":"3.5.140.1","userAgent":"Mozilla/5.0 …","hostname":"www.example.com"}
{"time":"2026-11-06T16:12:25.584Z","level":"info","msg":"pass","hostname":"www.example.com"}
```

Drops include the IP and user agent, so you can see what's being filtered. Passes include only the hostname: Bouncer doesn't log real visitors' IPs.

Drops and passes are logged at the `info` level. Set `log_level` to `warn` to log only problems, or `error` to log only failures.

## Development

You need [pnpm](https://pnpm.io).

```sh
pnpm install
cp bouncer.config.example.yml bouncer.config.yml
pnpm dev
```

## Data sources

| Data                   | Source                                                                            | License       | Updated                           |
| ---------------------- | --------------------------------------------------------------------------------- | ------------- | --------------------------------- |
| Datacenter and VPN IPs | [X4BNet/lists_vpn](https://github.com/X4BNet/lists_vpn)                           | MIT           | downloaded at startup, then daily |
| Referrer spam domains  | [matomo-org/referrer-spam-list](https://github.com/matomo-org/referrer-spam-list) | public domain | downloaded at startup, then daily |
| Bot user agents        | [isbot](https://github.com/omrilotan/isbot)                                       | Unlicense     | with the npm package              |
| Bot user agents        | [node-device-detector](https://github.com/sanchezzzhak/node-device-detector)      | MIT           | with the npm package              |

## License

[PolyForm Shield 1.0.0](LICENSE.md). You may use, change and self-host Bouncer for any purpose, except to provide a product that competes with it, such as a hosted Bouncer service. For a license that allows that, contact [Loopwerk](https://www.loopwerk.io).
