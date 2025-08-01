import { Hono } from "hono";
import { MineSweepWebhookController } from "./webhook.controller.js";
import { MineSweepWebhookMiddleware } from "./webhook.middleware.js";
const webhook = new Hono();
webhook.post("/", MineSweepWebhookMiddleware, MineSweepWebhookController);
export default webhook;
