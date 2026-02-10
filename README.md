# sneakyofficial.com

The source code for [**sneakyofficial.com**](https://sneakyofficial.com). A personal portfolio, Splatoon weapon scraper, and full-stack showcase rolled into one. Built by **Nana Adjei** (me). React frontend, async Python backend, and some well-seasoned scraping logic.

---

## Tech Stack

### Frontend (`src/frontend`)

* **React 18**
* **TypeScript + Vite**
* **Tailwind CSS**
* **React Router**
* 3D elements via `@react-three/fiber` and animated components
* Production build outputs to `dist/`, served with `nginx`

### Backend (`src/backend`)

* **Python 3.10**
* **aiohttp** for async web server and REST API
* **OAuth2** (Discord integration)
* Custom scrapers: `splatscraper.py`, `splatweightscraper.py`, etc.
* MySQL database interactions

---

## Project Features

* Live-rendered portfolio with animated sections
* **Splatdle**, a Wordle-style game based on Splatoon weapons
* Discord OAuth2 authentication
* REST API built from scratch with `aiohttp`
* Web scrapers to keep weapon data up to date
* Clear separation between frontend, backend, and data layers

---

## Setup Instructions

### Clone the Repo

```bash
git clone https://github.com/yourusername/sneakyofficial.com.git
cd sneakyofficial.com
```

---

### Frontend

```bash
cd src/frontend
npm install
npm run dev
```

#### Build for production

```bash
npm run build
```

---

### Backend

```bash
cd src/
python3.10 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

pip install -r requirements.txt
python main.py
```

This starts the `aiohttp` server on port `8080`.
API endpoints are available under `/api/*` (e.g. `/api/splatdle`).

---

## Directory Tree (important bits)

```bash
.
├── src
│   ├── frontend
│   │   ├── app
│   │   └── dist
│   └── backend
│       ├── website
│       ├── bot
│       └── resources
├── splatscraper.py
├── splatweightscraper.py
├── build_react.sh
├── requirements.txt
└── README.md
```

---

## Useful Scripts

```bash
# Build frontend and copy output to backend
./build_react.sh
# remember to chmod +x it

# Run scraper manually
python splatscraper.py

# Fix weapon key inconsistencies
python splatkeyfixer.py
```

---

## Example API Response

```json
{
  "name": "Splattershot (Splatoon 3)",
  "class": "Shooter",
  "range": 60,
  "damage": 47,
  "special": "Trizooka"
}
```

---

## Deployment

* **Nginx** for static hosting and reverse proxy
* **Let’s Encrypt** via Certbot for HTTPS
* **Ubuntu VPS**, manually configured

---

## Contact

Want to collaborate, give feedback, or report a bug that ruined your Splatdle streak?

* Discord: `sneakyonnightmode`
* Email: [nanaadjei6981@gmail.com](mailto:nanaadjei6981@gmail.com)
* Website: [**sneakyofficial.com**](https://sneakyofficial.com/socials)

---

> “Stay fresh.”
> Still applies to codebases.

