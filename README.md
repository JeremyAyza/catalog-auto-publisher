# catalog-auto-publisher

[![CI](https://github.com/JeremyAyza/catalog-auto-publisher/actions/workflows/ci.yml/badge.svg)](https://github.com/JeremyAyza/catalog-auto-publisher/actions/workflows/ci.yml)

Turns a folder of product photos into a catalog with GPT-4o Vision, then publishes it to Facebook Marketplace, Instagram and the WhatsApp Business catalog.

Status: personal tool, built for and used by a family-run clothing brand. Node scripts with Playwright for Meta's sites, and a Chrome extension for WhatsApp Web.

## What it does

1. **Generate** (`npm run generate`): reads the photos in `productos/`, asks GPT-4o for a title, descriptions, category and tags for each product, and writes them to a JSON dataset.
2. **Publish to Marketplace** (`npm run bot`) and **Instagram** (`npm run bot:ig`): Playwright fills each listing or post from the dataset and publishes it.
3. **Publish to WhatsApp** (`extension-wa/`): a side panel in WhatsApp Web adds each product to the Business catalog.

Every product keeps `published.facebook`, `published.instagram` and `published.whatsapp` flags in the dataset, so each channel skips what is already up and a run can stop and resume.

> [!WARNING]
> The bots publish without asking for confirmation on each item. That is on purpose: approving every post by hand did not scale, and a wrong listing is cheap to fix, because someone reviews what went out and edits it on the platform. They also use `puppeteer-extra-plugin-stealth` and random delays between actions, and automating these sites goes against Meta's terms. Use it on your own accounts and at your own risk.

## How to run it

Requirements: Node.js 20, an OpenAI API key, and Google Chrome for the extension.

```bash
git clone https://github.com/JeremyAyza/catalog-auto-publisher
cd catalog-auto-publisher
npm install
npx playwright install chromium
cp .env.example .env              # set OPENAI_API_KEY
cp brand.example.json brand.json  # fill in your brand
```

Put the photos in `productos/` (or point `PARENT_FOLDER` somewhere else):

```text
productos/
├── vestido-lino-azul/   # a folder is one product
│   ├── 01.jpg           # sorted by name: the first is the main photo
│   └── 02.jpg           # all of them go to the gallery
└── bolso-negro.jpg      # a loose photo is a product too
```

Then:

```bash
npm run generate   # writes datasets/dataset_<folder>.json; prices start at 0, fill them in
npm run login      # sign in to Facebook once; the session stays in fb_session/
npm run bot        # Marketplace
npm run bot:ig     # Instagram, same browser profile
```

The bots use the most recent dataset, or the one you name: `npm run bot -- dataset_ejemplo` or `DATASET_FILE=...`. For WhatsApp, build the extension (`cd extension-wa && npm install && npm run build`), load `.output/chrome-mv3` in Chrome, open WhatsApp Web and select the project folder in the panel. [`datasets/dataset_sample.json`](datasets/dataset_sample.json) shows the dataset format.

### brand.json

Everything specific to the store lives here, not in the code: name, WhatsApp number, social handles, size and shipping lines, Instagram closing, hashtags and the country picked in the WhatsApp catalog. `style` picks the prompt: `fashion` (clothing copy, a fixed footer on Marketplace and a separate Instagram caption) or `generic` (one-line closing). See [`brand.example.json`](brand.example.json).

## How it works

```text
generate_dataset.ts   # scan photos, shrink large ones, GPT-4o JSON, save after each product
brand.ts              # brand.json loading and the footer, caption and closing texts
bot_marketplace.ts    # Marketplace listing: up to 10 photos, title, price, category, condition, description, tags
bot_instagram.ts      # Instagram carousel: up to 10 photos, original aspect ratio, caption
login.ts              # persistent Facebook session
utils.ts              # dataset lookup, delays, timestamps
extension-wa/         # WXT + React + Zustand side panel for WhatsApp Web
tests/                # Vitest
```

## Technical decisions

- **Plain JSON as the state.** One dataset per photo folder, written after every product and every publish. Re-running `generate` skips photos that are already in it, and each bot skips items already flagged for its channel. Trade-off: no locking, so two bots must not write the same file at the same time.
- **Fixed text outside the model.** In the `fashion` style, GPT-4o writes only the product copy; the footer, contact lines and hashtags are appended in code from `brand.json`, so the model cannot get the phone number or the handles wrong. They are stored in the dataset, so a change in `brand.json` applies to products generated after it.
- **Browser automation instead of APIs.** The bots drive the real web UI with a persistent signed-in profile, with no app registration or tokens. They break when Meta changes its interface, and they pause (`page.pause()`) when a button is missing instead of guessing.
- **A Chrome extension for WhatsApp.** WhatsApp Web runs in the user's own browser with the session already open, so the extension reads the photos through the File System Access API and writes the `published.whatsapp` flag back to the same JSON.
- **Small inputs to the model.** Photos wider or taller than 2000 px are scaled down to fit in 1080 px, and everything is sent as JPEG quality 80, which keeps each request small.

## Tests

```bash
npm test                        # brand texts, brand.json validation, dataset lookup
cd extension-wa && npm test     # reading the country from brand.json
```

The calls to OpenAI and the browser flows have no automated tests. CI typechecks both packages, runs the tests and builds the extension.

## Known limitations

- The selectors and labels are the Spanish ones from Meta's UI, and the WhatsApp price fields expect a catalog in PEN.
- A product with price 0 goes out at 0 on Marketplace and at 100 in WhatsApp; set prices before publishing.
- The WhatsApp upload stops at the first product that fails.
- The prompts and the generated copy are in Spanish.

## License

[MIT](LICENSE) © 2026 Jeremy Ayza
