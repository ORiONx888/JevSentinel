import { createTelegramBot } from "./telegram.js";

const bot = createTelegramBot();
await bot.start();
