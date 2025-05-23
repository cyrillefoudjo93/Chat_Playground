# AI Chat Playground Docker Setup

This document provides instructions for running the AI Chat Playground using Docker with multi-stage builds for optimized production deployment.

## Prerequisites

- Docker and Docker Compose installed
- Git (to clone the repository)

## Environment Setup

Before running the services, create environment files for both backend and frontend:

1. For the backend server:
```bash
cp server/.env.example server/.env
```

Then edit `server/.env` to include your actual API keys and configuration.

2. For the frontend application:
```bash
cp hands-free-chat/.env.example hands-free-chat/.env
```

Update the variables as needed for your environment.

## Running Services with Docker Compose

### Development Environment

For development, you can run the services with hot-reloading:

```bash
docker-compose -f docker-compose.dev.yml up
```

### Production Environment

For production deployment:

```bash
docker-compose up -d
```

This will:
- Build and start the NestJS backend (available on port 3000)
- Build and start the React frontend with Nginx (available on port 80)
- Set up Redis for caching and rate limiting

## Accessing Services

- Frontend: http://localhost
- Backend API: http://localhost:3000/api
- Health Check: http://localhost:3000/api/health

## Building Individual Services

To build and run services separately:

### Backend (NestJS)

```bash
cd server
docker build -t chat-playground-backend .
docker run -p 3000:3000 --env-file .env chat-playground-backend
```

### Frontend (React)

```bash
cd hands-free-chat
docker build -t chat-playground-frontend .
docker run -p 80:80 chat-playground-frontend
```

## Multi-Stage Builds Explanation

The Dockerfiles use multi-stage builds to optimize the final production image:

1. **Builder Stage**:
   - Installs all dependencies including development dependencies
   - Compiles/builds the application
   - Creates optimized assets

2. **Production Stage**:
   - Starts with a fresh, minimal base image
   - Copies only built assets and production dependencies
   - Results in a smaller, more secure image

## Additional Information

- Logs are persisted in volumes for both services
- Redis data is persisted in a volume
- Health checks are configured for all services
- Proper security headers are set in Nginx

## Troubleshooting

If you encounter issues:

1. Check container logs:
```bash
docker-compose logs -f [service_name]
```

2. Verify health status:
```bash
docker-compose ps
```

3. Access a container's shell:
```bash
docker-compose exec [service_name] sh
```
