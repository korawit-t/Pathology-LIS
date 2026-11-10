# Stage 1: Build React
FROM node:22-alpine AS build-stage
WORKDIR /app

# VITE_API_BASE_URL is baked into the bundle at build time. It normally comes
# from frontend/.env, which `COPY . .` brings into the build. A build arg
# (`--build-arg VITE_API_BASE_URL=...`, or `build.args` in compose, as the dev
# override does) wins over the file when it is given.
#
# Never turn an absent arg into `ENV VITE_API_BASE_URL=$VITE_API_BASE_URL`:
# that sets the variable to an empty string, and Vite lets any variable that
# already exists — empty included — override the .env file, so every build
# shipped with the API at "" and login hit nginx (405).
ARG VITE_API_BASE_URL

COPY package*.json ./
RUN npm install
COPY . .
# This nginx serves only the SPA and never proxies the API, so a build without
# an API URL can never log in. Refuse it here instead of at the login screen.
RUN if [ -z "$VITE_API_BASE_URL" ]; then \
        unset VITE_API_BASE_URL; \
        if ! grep -qsE '^VITE_API_BASE_URL=.+' .env .env.production .env.production.local; then \
            echo "VITE_API_BASE_URL is not set: put the backend URL as the browser sees it (e.g. http://192.168.1.100:8000) in frontend/.env, then rebuild." >&2; \
            exit 1; \
        fi; \
    fi \
    && npm run build

# Stage 2: Serve with Nginx
FROM nginx:stable-alpine
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
