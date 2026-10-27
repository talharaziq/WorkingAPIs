# Contributing to WorkingAPI

Thanks for helping keep the API directory accurate. A smaller set of clear, useful listings is better than a large set of stale or misleading entries.

## Add or update an API

Edit `data/apis.json` and preserve the structure used by existing records.

Every listing should include:

- A stable, unique, kebab-case `id`.
- The official API name, category, and a short factual description.
- A concrete endpoint that demonstrates a common use case.
- A link to official documentation or the provider's official project page.
- Accurate authentication details. Use `None` only when the example can be called without a key, token, or account.
- HTTPS and CORS details. Use `Unknown` if CORS has not been verified, and record evidence or caveats in `cors_evidence` or `notes`.
- Rate-limit and free-tier information, with a link to the provider's current terms or documentation.
- A JavaScript example that matches the endpoint, HTTP method, required headers, and response type.

Do not guess at limits or access rules. If the provider does not publish a limit, say that it is not clearly published and link to the docs. Free to start, no key required, unlimited use, and commercial use are different claims.

## Automated endpoint checks

Set `check_url` only when an endpoint is a low-risk, public, anonymous HTTPS GET request. Do not use endpoints that require credentials, submit data, trigger side effects, run expensive queries, or violate a provider's terms. Avoid large responses and bulk downloads.

The scheduled checker rotates across approved URLs, sends a single request, does not retry, and records a snapshot. It is not a full functional test or uptime guarantee. Keep the catalogue's `status_policy` and `check_policy` consistent with that behavior.

To run the checker locally:

```bash
python scripts/check_apis.py --batch-size 24 --workers 6
```

Use `--all` sparingly because it checks every eligible endpoint in one run. To test CORS for the deployed site, pass the site's actual origin with `--origin`.

## Before submitting a pull request

Run:

```bash
python scripts/validate_catalog.py
```

Also check the official docs link, try the endpoint when practical, inspect the example code, and make sure the displayed access notes are accurate. If changing CORS details, test from a browser origin where possible; a successful command-line request alone does not establish browser CORS support.

## Editorial rules

- Keep descriptions short, direct, and factual.
- Prefer official provider sources over third-party lists.
- Do not promise guaranteed uptime, unlimited free use, commercial permission, or a published quota without evidence.
- Mark keys, OAuth, registration, and rate limits clearly.
- Do not include real API keys, passwords, or access tokens in the catalogue.
- Avoid duplicate entries that differ only by a query parameter. Add another entry only when it provides a distinct service or dataset.
- Correct or remove dead endpoints rather than keeping them solely to increase the entry count.
- Add source notes for recently verified authentication, CORS, or rate-limit details.

## License

By submitting a contribution, you agree that your project-authored contribution is distributed under the repository's MIT License. Third-party API content and provider terms remain separate.
