import type { Context, Next } from "hono";
import { MineSweepWebhookSchema } from "../../schema/schema.js";
import { sendErrorResponse } from "../../utils/function.js";
import { rateLimit } from "../../utils/redis.js";

export const MineSweepWebhookMiddleware = async (c: Context, next: Next) => {
  const secret = c.req.header("x-webhook-secret");

  if (secret !== process.env.WEBHOOK_SECRET) {
    return c.json({ message: "Unauthorized: Invalid webhook secret" }, 401);
  }
  const { memberId, event, amount } = await c.req.json();

  const isAllowed = await rateLimit(
    `rate-limit:${memberId}:webhook-post`,
    100,
    "1m",
    c
  );

  if (!isAllowed) {
    return sendErrorResponse("Too Many Requests", 429);
  }

  const validate = MineSweepWebhookSchema.safeParse({
    memberId,
    event,
    amount,
  });

  if (!validate.success) {
    return sendErrorResponse(validate.error.message, 400);
  }

  c.set("params", validate.data);
  await next();
};
