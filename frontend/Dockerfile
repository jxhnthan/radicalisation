# Build stage
FROM node:20-alpine AS build
WORKDIR /app
# Run as the unprivileged node user (SonarQube: no root in containers)
RUN chown -R node:node /app
USER node
# Lockfile first for reproducible installs
COPY --chown=node:node frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY --chown=node:node frontend .
RUN npm run build

# Serve stage - nginx-unprivileged runs as a non-root user out of the box
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
