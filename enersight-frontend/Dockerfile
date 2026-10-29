# EnerSight frontend — Vite build, served by nginx.
#
# Two stages so node and the 300MB of node_modules stay out of the shipped image:
# what gets served is the contents of dist/ and nothing else.

FROM node:20-alpine AS build

WORKDIR /app

# Copied first so a change to source code does not re-run the install layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
