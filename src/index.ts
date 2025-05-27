import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { envConfig } from "./env.js";
import { supabaseMiddleware } from "./middleware/auth.middleware.js";
import { errorHandlerMiddleware } from "./middleware/errorMiddleware.js";
import route from "./route/route.js";
import { globalRateLimit } from "./utils/redis.js";
const app = new Hono();

// Apply CORS first, then middleware
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowedOrigins = [
        "http://localhost:5173",
        "https://www.aurora.app",
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        return origin;
      } else {
        return null;
      }
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Range", "X-Total-Count"],
  }),
  globalRateLimit(),
  supabaseMiddleware()
);

app.use(logger()); // Logger should be before error handling

app.get("/", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>API Status</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
          }
          .status {
            font-size: 20px;
            color: green;
          }
        </style>
    </head>
    <body>
        <h1>API Status</h1>
        <p class="status">✅ API is working perfectly!</p>
        <p>Current Time: ${new Date().toLocaleString()}</p>
    </body>
    </html>
  `);
});

app.route("/api/v1", route);

app.onError(errorHandlerMiddleware);

// Ensure the server starts correctly in Bun
export default {
  port: envConfig.PORT || 9000, // Use 9000 if env variable is missing
  fetch: app.fetch, // Bun automatically calls this
};
