# Supply Chain Lite — Frontend

Frontend application for **Supply Chain Lite** — lightweight, modern tools to streamline supply chain planning, inventory, logistics, and execution. Built with **Vite**, **Bootstrap 5**, and **SCSS**.

## Architecture

This is the **frontend** repository. The full system consists of:

- **Frontend** (this repo) — multi-page web app built with Vite + Bootstrap
- **Backend** — Python FastAPI service providing REST APIs
- **Celery Workers** — asynchronous task workers for heavy-lifting operations like optimization and simulations

## Features

### Application

- **Demand Planning** — forecast and align supply with customer demand
- **Inventory & Capacity** — balance stock levels and production constraints
- **Logistics** — plan shipments and track fulfillment status
- **Analytics** — insights to improve service and cost
- **Optimization & Simulation** — run optimizations and simulate scenarios (powered by Celery workers)

### Technical

- **Vite** — fast dev server and optimized builds
- **Bootstrap 5.3** — with deep SCSS variable customization (Brutopia theme)
- **Sass** — modular SCSS architecture with components, layouts, mixins, and utilities
- **ESLint + Prettier + Stylelint** — linting and formatting out of the box
- **Multi-page support** — Vite auto-discovers `.html` files in `src/`
- **GitHub Actions CI** — build, lint, and format checks on every PR

## Getting Started

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- npm

### Installation

```bash
npm install
```

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

### Development

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### Build for Production

```bash
npm run build
```

Output goes to `dist/`.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
├── src/
│   ├── activate-account.html
│   ├── forgot-password.html
│   ├── home-page.html
│   ├── index.html
│   ├── login.html
│   ├── reset-password.html
│   ├── signup.html
│   ├── table.html
│   ├── common/
│   │   ├── css/
│   │   │   └── custom.css           # Shared custom CSS
│   │   └── js/
│   │       ├── api.js               # Fetch-based API client
│   │       ├── bsToast.js           # Bootstrap toast helpers
│   │       └── dom.js               # DOM utility helpers
│   ├── page_assets/
│   │   ├── activate-account/
│   │   │   ├── css/main.css
│   │   │   └── js/main.js
│   │   ├── forgot-password/
│   │   │   ├── css/main.css
│   │   │   └── js/main.js
│   │   ├── home-page/
│   │   │   ├── css/main.css
│   │   │   └── js/
│   │   │       ├── main.js
│   │   │       ├── models.js
│   │   │       ├── notifications.js
│   │   │       └── projects.js
│   │   ├── index/
│   │   │   ├── css/main.css
│   │   │   └── js/main.js
│   │   ├── login/
│   │   │   ├── css/main.css
│   │   │   └── js/main.js
│   │   ├── reset-password/
│   │   │   ├── css/main.css
│   │   │   └── js/main.js
│   │   ├── signup/
│   │   │   ├── css/main.css
│   │   │   └── js/main.js
│   │   └── table/
│   │       ├── css/main.css
│   │       └── js/
│   │           ├── commons.js
│   │           ├── main.js
│   │           └── tables.js
│   ├── public/                      # Static assets (copied as-is)
│   │   ├── scc.svg
│   │   └── summence_bw.png
│   └── scss/
│       ├── components/              # Bootstrap component overrides
│       │   ├── _alert.scss
│       │   ├── _avatar.scss
│       │   ├── _badge.scss
│       │   ├── _breadcrumb.scss
│       │   ├── _buttons.scss
│       │   ├── _card.scss
│       │   ├── _carousel.scss
│       │   ├── _divider.scss
│       │   ├── _dropdowns.scss
│       │   ├── _forms.scss
│       │   ├── _icons.scss
│       │   ├── _modal.scss
│       │   ├── _navbar.scss
│       │   ├── _navs.scss
│       │   ├── _pagination.scss
│       │   ├── _progress.scss
│       │   ├── _sidebar.scss
│       │   └── _table.scss
│       ├── layouts/
│       │   └── main.scss            # Page layout styles
│       ├── mixins/
│       │   └── _navbar.scss         # SCSS mixins
│       ├── _brutopia.scss           # Component import manifest
│       ├── _fonts.scss              # Self-hosted font declarations
│       ├── _utilities.scss          # Custom utility classes
│       ├── _variables.scss          # Bootstrap + theme variables
│       └── styles.scss              # Main SCSS entry point
├── .editorconfig
├── .env                             # Environment variables (not committed)
├── .env.example                     # Environment variable template
├── .gitignore
├── .nvmrc                           # Node version
├── .prettierignore
├── .prettierrc                      # Prettier config
├── .github/
│   └── workflows/
│       ├── ci.yml                   # CI pipeline
│       └── deploy.yml               # Deployment pipeline
├── AGENTS.md
├── eslint.config.js                 # ESLint flat config
├── LICENSE
├── package.json
├── vite.config.js
└── README.md
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint JavaScript with ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run lint:css` | Lint SCSS with Stylelint |
| `npm run lint:css:fix` | Auto-fix Stylelint issues |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting without writing |

## Customization

### Theme Colors

Edit `src/scss/_variables.scss` to change the color palette:

```scss
$primary:   #141414;
$secondary: #A8A196;
$success:   #6fc59a;
$danger:    #d1503b;
```

### Adding a New Page

1. Create `src/my-page.html`
2. Create `src/page_assets/my-page/js/main.js` for page-specific JS
3. Vite will auto-discover the HTML file — no config changes needed

### Environment Variables

All `VITE_`-prefixed variables in `.env` are available in JS via `import.meta.env`:

```js
const apiUrl = import.meta.env.VITE_API_BASE_URL;
```

### JS Utilities

Pre-built helpers are available in `src/common/js/`:

```js
import api from '@/common/js/api';
import { toastSuccess } from '@/common/js/toast';
import { $, on } from '@/common/js/dom';
```

## License

[MIT](LICENSE)

Production builds include `LICENSE.txt`, `THIRD-PARTY-NOTICES.txt` (production
dependencies and their upstream license/notice texts), and
`licenses/Inconsolata-OFL.txt`. Keep these files with deployments and release
archives. The notices are generated from the lockfile and installed packages;
the build fails if a production dependency has no license text or its installed
version differs from the lockfile. Build-only tooling is not included in these
runtime notices.

SheetJS is pinned to the official `0.20.3` tarball because the public npm `xlsx`
package remains on the vulnerable `0.18.5` release. `npm ci` requires access to
`cdn.sheetjs.com`; the lockfile records the tarball integrity hash. See the
[upstream installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

