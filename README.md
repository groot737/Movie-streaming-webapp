# GioStream - Movie Streaming Web App

A modern React-based movie streaming web application landing page built with Vite, Tailwind CSS, and Framer Motion.

## 🚀 Features

- **Private Watch Rooms**: Create invite-only rooms for synchronized viewing
- **Synced Playback**: Watch together with real-time synchronization
- **Chat & Reactions**: Built-in messaging and emoji reactions
- **TMDB Integration**: Browse trending and top-rated movies
- **Responsive Design**: Mobile-first design that works everywhere
- **Smooth Animations**: Rich animations powered by Framer Motion

## Prerequisites

- Node.js 16+ and npm installed
- TMDB API key (get one at [https://www.themoviedb.org/settings/api](https://www.themoviedb.org/settings/api))

## Installation

1. **Clone the repository** (if applicable) or navigate to the project directory:
```bash
cd Movie-streaming-webapp
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
   - Create a `.env` file in the root directory
   - Add your TMDB API key:
```env
VITE_TMDB_API_KEY=your_api_key_here
```

## Running the Application

### Development Server
```bash
npm run dev
```
The app will open automatically at `http://localhost:3000`

### Production Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## 📁 Project Structure

```
Movie-streaming-webapp/
├── src/
│   ├── LandingPage.jsx    # Main landing page component
│   ├── main.jsx           # React entry point
│   └── index.css          # Global styles with Tailwind
├── index.html             # HTML entry point
├── vite.config.js         # Vite configuration
├── tailwind.config.js     # Tailwind CSS configuration
├── postcss.config.js      # PostCSS configuration
├── package.json           # Dependencies and scripts
└── .env                   # Environment variables (not in git)
```

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Animation library
- **TMDB API** - Movie database

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🔑 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_TMDB_API_KEY` | Your TMDB API key | Yes |

## 🤝 Contributing

This is a personal project, but feel free to fork and modify as needed.

## 📄 License

Private project for personal use.

## Auth Server (Passport + Postgres)

This repo now includes an Express auth server with session-based Passport auth.

### Server Environment Variables

```env
DATABASE_URL=postgres://user:password@host:5432/dbname
SESSION_SECRET=replace_with_secure_value
CLIENT_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:3001
```

### Database Setup

Run the schema in `server/schema.sql` to create the `users` table. Sessions are stored
in Postgres via `connect-pg-simple` (table auto-creates on first run).

### Run Auth Server

```bash
npm run server
```
