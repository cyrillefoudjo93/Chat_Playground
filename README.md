# Chat Playground

A full-stack chat application with a React frontend and NestJS backend.

## Project Structure

- `/hands-free-chat` - Frontend React application
- `/server` - Backend NestJS application

## Prerequisites

- Docker and Docker Compose installed
- Node.js and PNPM (for local development)

## Getting Started with Docker

### Development Environment

1. Clone the repository
2. Create `.env` files in both frontend and backend directories (use the `.env.example` files as templates)
3. Run the development Docker Compose:

```bash
docker-compose -f docker-compose.dev.yml up
```

This will start both the frontend and backend services in development mode with hot reloading.

### Production Environment

To build and run the application in production mode:

```bash
docker-compose up --build
```

### Docker Services

- Frontend: React application running on port 80
- Backend: NestJS API running on port 3000

## Development Without Docker

### Frontend

```bash
cd hands-free-chat
pnpm install
pnpm dev
```

### Backend

```bash
cd server
pnpm install
pnpm start:dev
```

## Environment Variables

Make sure to set up your environment variables:

1. Copy `.env.example` to `.env` in both `/hands-free-chat` and `/server` directories
2. Update the variables according to your environment

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

MIT
