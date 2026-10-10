# DevHub

DevHub is a developer collaboration and project management platform. Teams can organize projects, coordinate work, and share progress in one place.

## Structure

- `client/` — frontend application
- `server/` — backend API

Each app is independently runnable. JavaScript (ES modules) is used throughout.

## Getting started

Install dependencies from the repository root:

```bash
npm install
```

Run the client:

```bash
npm run dev:client
```

Run the server:

```bash
npm run dev:server
```

Or start either app from its own directory:

```bash
cd client && npm run dev
cd server && npm run dev
```
