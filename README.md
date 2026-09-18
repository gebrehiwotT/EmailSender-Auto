# EmailSender-Auto

An automated email delivery and dispatch application designed to send personalized credentials and announcements with rich HTML templates via corporate or standard SMTP relays.

## Features

- **Automated Batch Sending**: Upload an Excel spreadsheet (`.xlsx`) to parse user profiles, credentials, and email addresses.
- **Smart Domain Validation & Correction**:
  - Automatically corrects common typos in corporate domains (e.g. `@ethiopianairlines.com`).
  - Supports standard external mail domains (`@gmail.com`, `@yahoo.com`, etc.) without blocking.
- **Delivery Status Tracking**: Real-time status update per recipient (`pending`, `sent`, `error`, `failed`) and persistent dispatch history.
- **Rich Text Template Editor**: Customizable email templates with placeholders like `[Full Name]`, `[User ID]`, `[Password]`, and `[Email]`.
- **Built-in Authentication & User Management**: Role-based access control with secure bcrypt password hashing and JWT sessions.
- **Production-Ready**: Node.js backend with SQLite storage (`node:sqlite`) and React + Vite frontend.

---

## Project Structure

```text
EmailSender-Auto/
├── client/                 # React + Vite frontend
│   ├── src/                # UI components, styling, and application logic
│   ├── public/             # Static public assets
│   ├── index.html          # Frontend HTML shell
│   ├── vite.config.js      # Vite configuration & dev proxy
│   └── package.json        # Frontend dependencies & scripts
├── server/                 # Express.js backend
│   ├── index.js            # Express API endpoints, SMTP dispatch, auth
│   ├── database.js         # SQLite database wrapper & schema definition
│   ├── install-service.js  # Optional Windows Service setup script
│   ├── .env.example        # Environment variable template
│   └── package.json        # Backend dependencies & scripts
└── README.md
```

---

## Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (version 18+ recommended)
- npm or yarn

### 2. Backend Setup

```bash
cd server
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration:
# - JWT_SECRET
# - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
```

To run the backend server:

```bash
# Production mode
npm start

# Development mode (with auto-restart)
npm run dev
```

### 3. Frontend Setup

```bash
cd ../client
npm install

# Start local dev server
npm run dev

# Or build for production
npm run build
```

When building for production, the compiled assets in `client/dist` can be served directly by the Express backend.

---

## License

ISC License
