# ============================================================
#  Pixel Brawl — container for hosting (Render, Railway, Fly.io, VPS)
#  Builds the game, then runs API + game + multiplayer on one port.
# ============================================================
FROM node:22-slim

WORKDIR /app

# copy the whole project (node_modules etc. are skipped by .dockerignore)
COPY . .

# build the client (client/dist) and install the server packages
RUN npm run build

ENV NODE_ENV=production
# Render/Railway set PORT automatically; 2567 is the local default
EXPOSE 2567

CMD ["npm", "start"]
