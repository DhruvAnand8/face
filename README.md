# FacePass React + Node App

This repository now contains a React frontend and a Node.js backend for the FacePass login demo.

## Setup

1. Install backend dependencies:

```bash
cd /Users/admin/AWS/server
npm install
```

2. Install frontend dependencies:

```bash
cd /Users/admin/AWS/client
npm install
```

## Development

Start the backend:

```bash
cd /Users/admin/AWS/server
npm run dev
```

Start the frontend:

```bash
cd /Users/admin/AWS/client
npm run dev
```

Then open the URL shown by Vite (usually `http://localhost:5173`).

## API

- `GET /api/users` — list registered users
- `POST /api/users` — register a new user
- `PUT /api/users/:id/login` — update last login time
- `DELETE /api/users/:id` — delete a user

## Notes

- The frontend uses `face-api.js` and the browser camera.
- The backend stores users in `server/data/users.json`.
