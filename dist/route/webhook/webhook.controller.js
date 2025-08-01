import { redis } from "../../utils/redis.js";
import { MineSweepWebhookModel } from "./webhook.model.js";
export const MineSweepWebhookController = async (c) => {
    try {
        const params = c.get("params");
        await MineSweepWebhookModel({
            memberId: params.memberId,
            amount: params.amount,
        });
        const cacheKey = `user-model-get-${params.memberId}`;
        await redis.del(cacheKey);
        return c.json({ message: "Webhook received" }, 200);
    }
    catch (error) {
        return c.json({ message: "Internal server error" }, 500);
    }
};
