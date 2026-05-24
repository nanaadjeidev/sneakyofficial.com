# sneakyofficial.com

---

# sneakyofficial.com

The source code for [**sneakyofficial.com**](https://sneakyofficial.com) A personal portfolio, Splatoon weapon scraper, and full-stack showcase all rolled into one. Built by **Nana Adjei** (that's me, hi), this repo features a sleek React frontend, an async Python backend, and some delicious scraping sauce on the side.

---

## Tech Stack

### Frontend (`src/frontend`)

* **React 18**
* **TypeScript + Vite**
* **Tailwind CSS**
* **React Router**
* Some 3D with `@react-three/fiber` + cool animated components
* Built assets live in `dist/`, deployed via `nginx`

### Backend (`src/backend`)

* **Python 3.10**
* **aiohttp** for async web server and REST API
* **OAuth2** (Discord integration)
* Custom scrapers: `splatscraper.py`, `splatweightscraper.py`, etc.
* MySQL database interactions

---

## Project Features

* Live-rendered portfolio with animated sections
* Splatdle — a custom Wordle-style game based on Splatoon weapons
* OAuth2 login with Discord
* REST API built from scratch using `aiohttp`
* Web scrapers to keep weapon data fresh
* Clean separation between frontend, backend, and data resources

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

## Directory Tree (important bits only)

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

## Scripts You Might Care About

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

## Deployed With

* **Nginx** (static + reverse proxy)
* **Let's Encrypt** via Certbot (HTTPS, free SSL)
* **Ubuntu VPS**, manually configured

---

## Contact Me

Want to collaborate, give feedback, or report a bug that ruined your Splatdle streak?

* Discord: `sneakyonnightmode`
* Email: [nanaadjei6981@gmail.com](mailto:nanaadjei6981@gmail.com)
* Website: [**sneakyofficial.com**](https://sneakyofficial.com/socials)

---

### Bonus

> "Stay fresh." – Callie & Marie (probably also about code hygiene)
