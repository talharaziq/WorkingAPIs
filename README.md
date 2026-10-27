# WorkingAPI — Free Public APIs That Work

**WorkingAPI is a searchable directory of free public APIs and free-tier REST APIs.** Browse APIs by category, check whether authentication is required, review CORS and rate-limit notes, open official documentation, and copy JavaScript examples.

The site is a lightweight static website built with HTML, CSS, and JavaScript. It is designed to run on **GitHub Pages** with no build step, database, account system, or paid service required to browse the directory.

## Features

- **150 API listings** across 21 categories, including weather, maps, developer tools, books, finance, games, science, food, transport, and open data.
- **Search and filters** to find APIs by name, category, access requirements, and saved items.
- **Authentication notes** that distinguish APIs with no key from services that require a key, token, or registration.
- **CORS information** for developers who want to call an API directly from a browser.
- **Rate-limit and free-tier notes** with links to official provider documentation.
- **Copyable JavaScript examples** for JSON, text, XML, and image responses where applicable.
- **Automated endpoint checks** using a scheduled GitHub Actions workflow. Checks rotate through a limited batch to avoid unnecessary requests to providers.
- **Machine-readable API data** in `data/apis.json`, plus the latest stored check results in `data/status.json`.
- **Responsive layout** that works on desktop and mobile, with saved APIs stored only in local browser storage.
- **Open-source contributions**: add, correct, or remove listings through pull requests.

## Browse the directory

After publishing the repository with GitHub Pages, open the URL shown in **Settings → Pages**. Search by a topic such as `weather`, `maps`, `books`, or `currency`, or filter for APIs that do not require a key.

## API categories

The directory contains these categories:

| Category | APIs |
|---|---:|
| Animals | 5 |
| Art & Culture | 5 |
| Books & Knowledge | 8 |
| Developer Tools | 13 |
| Education & Language | 1 |
| Finance & Crypto | 8 |
| Food & Drink | 7 |
| Fun & Lifestyle | 3 |
| Games & Entertainment | 10 |
| Geography & Maps | 10 |
| Government & Open Data | 5 |
| Images & Design | 7 |
| Movies & TV | 6 |
| Music & Audio | 5 |
| Network & Security | 9 |
| Science & Research | 13 |
| Sports & Fitness | 6 |
| Testing & Mock Data | 9 |
| Time & Calendar | 4 |
| Transport & Mobility | 5 |
| Weather & Environment | 11 |
| **Total** | **150** |

## Run WorkingAPI locally

WorkingAPI has no npm dependencies or build step. It loads the API catalogue from JSON, so open it through a local HTTP server instead of opening `index.html` directly with a `file://` URL.

Requirements: Python 3 for local serving and the validation/check scripts. The website itself runs in a modern browser.

```bash
# Clone your repository, then enter its directory.
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

### Validate the catalogue

```bash
python scripts/validate_catalog.py
```

This checks the expected entry count, required fields, unique IDs, URL formats, supported CORS values, JavaScript example shape, and the relationship between the catalogue and status files.

### Run the endpoint checker manually

Check a rotating batch of 24 eligible endpoints:

```bash
python scripts/check_apis.py --batch-size 24 --workers 6
```

Check every endpoint that has an approved `check_url` (use this sparingly):

```bash
python scripts/check_apis.py --all --workers 6
```

To make the CORS probe site-specific, run the checker with `--origin` set to the actual origin of your published site (scheme and hostname only, with no path), or change `PROBE_ORIGIN` in `scripts/check_apis.py`. The default is a reserved `.invalid` origin, so those results are a general header probe until you configure your published origin.

## Publish with GitHub Pages

1. Create a **public GitHub repository** named `workingapi`.
2. Upload the contents of this project folder to the repository root. Keep `.github/`, `data/`, and `scripts/` in place.
3. Open **Settings → Pages** and choose **GitHub Actions** as the deployment source.
4. Open **Settings → Actions → General → Workflow permissions** and allow repository content read/write so the scheduled checker can save updated results to `data/status.json`.
5. Go to **Actions** and run **Deploy WorkingAPI to GitHub Pages** once, or push a commit to the `main` branch.
6. When deployment succeeds, GitHub shows the published URL in **Settings → Pages**.

The deployment workflow validates the catalogue before publishing. The scheduled checker runs daily, tests up to 24 eligible endpoints per run, updates the status file, and deploys the updated site. Since 96 entries are configured for automated checks in the current catalogue, the rotating set takes multiple daily runs to cover them all.

If you use a branch other than `main`, update the branch name in `.github/workflows/deploy-pages.yml`.

## What the status labels mean

An **Online** result means the endpoint returned a successful HTTP response during its last check. It does not prove that the data is correct, the API is available to every user, authentication will work for your account, or the provider guarantees uptime.

- **Not checked**: no automated result has been recorded yet.
- **Online**: the latest HTTP probe succeeded.
- **HTTP error / Server error / Unreachable**: the endpoint returned an error or could not be reached during the last check.
- **Manual check**: the endpoint is not configured for automated requests.

The checker sends one low-volume GET request per selected endpoint, caps the response body it reads, uses a short timeout, and does not retry failed requests. Only records with a reviewed `check_url` are included. Authenticated endpoints, POST endpoints, bulk downloads, and requests likely to cause side effects should not be added to the scheduled checker.

**CORS is separate from reachability.** The Python checker reads CORS response headers, but it does not run inside a real browser. A positive or negative header probe is not a guarantee that every browser app will be allowed; origin restrictions and credentials can affect browser requests. For a site-specific probe, configure the checker with the origin of your published site.

Authentication, free tiers, quotas, rate limits, provider terms, and endpoints can change. Check the linked official documentation before using a listing, especially in production. Free access does not mean unlimited use or automatic permission for commercial use.

## API catalogue format

`data/apis.json` is the source of truth for the public API directory. Each API record can include:

| Field | Meaning |
|---|---|
| `id` | Stable, unique identifier used to match status records |
| `name` | API or service name |
| `category` | Directory category |
| `description` | Short explanation of what the API provides |
| `endpoint` | Example endpoint for the listing |
| `docs` | Official documentation or provider project page |
| `auth` | Authentication requirement as currently understood |
| `https` | Whether the example endpoint uses HTTPS |
| `cors` / `cors_evidence` | CORS information and its source or caveat |
| `rate_limit` | Published limit, if known, or a note to check official docs |
| `free_tier` | Summary of free access and major restrictions |
| `example_js` | Copyable JavaScript example |
| `check_url` | Optional, reviewed HTTPS GET URL eligible for automated checks |
| `notes` | Important caveats for the listing |

Use clear language for missing information. Keep unknown limits or CORS details marked as unknown rather than guessing. Never put real access tokens or private keys in the public catalogue.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before adding or updating an entry. Useful contributions include checking official documentation, correcting authentication or free-tier details, testing CORS from a browser, improving examples, and reporting dead or redirected endpoints.

Run the catalogue validator before opening a pull request:

```bash
python scripts/validate_catalog.py
```

## Data sources and third-party terms

Listings link to each provider's official documentation. The catalogue was initially assembled using public API directories and provider sources, including:

- [public-apis/public-apis](https://github.com/public-apis/public-apis) — community-maintained API directory.
- [CORS.dev public API guide](https://cors.dev/guides/free-public-apis) — browser CORS reference for selected APIs.
- [DevHunt free APIs](https://devhunt.org/free-apis) — additional discovery source.
- Official provider documentation linked in each entry.

WorkingAPI is an independent directory and is not affiliated with the listed providers. Provider names, trademarks, data, service availability, API terms, and licensing remain subject to their respective owners and terms. Please report incorrect information through a GitHub issue or pull request.

## License

The WorkingAPI website, scripts, and project-authored catalogue contributions are released under the [MIT License](LICENSE). The license does not override third-party API provider terms, data licenses, trademarks, or copyrights.

## GitHub repository details

Suggested repository description:

> A searchable directory of 150 free public APIs and REST APIs, with authentication notes, CORS details, JavaScript examples, and automated endpoint status checks.

Suggested GitHub topics:

`free-api` · `public-api` · `api-directory` · `rest-api` · `free-apis` · `api-list` · `cors` · `github-pages` · `javascript` · `open-source` · `api-status-checker`
