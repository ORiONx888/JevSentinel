FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
# patternShadow.js imports the research library at runtime; include it in the image.
COPY research ./research

ENV NODE_ENV=production

CMD ["node", "src/telegram-run.mjs"]
