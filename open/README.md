# Mavicat Website

Mavicat Website is the standalone Node.js site for publishing Mavicat releases, collecting product feedback, and giving users a clean download entry outside the desktop app.

## Features

- Product introduction, latest screenshots, and release download page
- User registration, login, logout, and password changes
- Public comments and feedback for visitors and signed-in users
- Default administrator account: `admin`
- Default administrator password: `Kailing@2026`
- Admin release management with inline installer uploads by platform and architecture
- Public visitors can download every uploaded installer from the release center

## Run

```bash
pnpm install
pnpm dev
```

The server listens on `http://localhost:4175` by default. Set `PORT` to override it.

## Storage

Runtime data is stored under `storage/data/db.json`, and uploaded installers are stored under
`storage/uploads/`. These files are ignored by Git.
