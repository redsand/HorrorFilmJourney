# Domain Checklist (cinemacodex.com)

## DNS and TLS

- [ ] `cinemacodex.com` A/ALIAS/CNAME points to production host.
- [ ] `www.cinemacodex.com` redirect policy decided and configured.
- [ ] TLS certificate active and auto-renew enabled.
- [ ] HSTS enabled at edge/proxy if supported.

## Redirect policy

- [ ] Canonical host chosen:
  - `cinemacodex.com` or `www.cinemacodex.com`
- [ ] Non-canonical host 301 redirects to canonical.
- [ ] HTTP -> HTTPS redirect enforced.

## Environment separation

- [ ] Production uses production DB only.
- [ ] Preview/staging cannot access production DB or secrets.
- [ ] `SESSION_SECRET` is unique per environment.

## Robots / indexing

- [ ] Beta decision:
  - index enabled, or
  - `noindex` while in private testing
- [ ] `robots.txt` strategy applied accordingly.

## Metadata basics

- [ ] `<title>` set to CinemaCodex brand message.
- [ ] `<meta name="description">` present.
- [ ] OpenGraph tags for homepage.

## Email deliverability

- [ ] N/A currently (no outbound email flows in app).
