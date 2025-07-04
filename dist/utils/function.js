import { redis } from "./redis.js";
import { supabaseClient } from "./supabase.js";
export const sendErrorResponse = (message, status) => Response.json({ message: message }, { status });
export const sendSuccessResponse = (message, status) => Response.json({ message: message }, { status });
export const getClientIP = (request) => {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor)
        return forwardedFor.split(",")[0].trim();
    const realIP = request.headers.get("x-real-ip");
    if (realIP)
        return realIP;
    // 1. Cloudflare (most reliable if available)
    const cfIP = request.headers.get("cf-connecting-ip");
    if (cfIP)
        return cfIP;
    // 4. Fallback
    return "unknown";
};
export const getUserSession = async (token) => {
    const supabase = supabaseClient;
    const session = await supabase.auth.getUser(token);
    if (session.error) {
        return null;
    }
    return session.data.user;
};
export const calculateFinalAmount = (amount, selectedEarnings) => {
    if (selectedEarnings === "PACKAGE") {
        const fee = amount * 0.1;
        return amount - fee;
    }
    else if (selectedEarnings === "REFERRAL") {
        const fee = amount * 0.1;
        return amount - fee;
    }
    else if (selectedEarnings === "WINNING") {
        const fee = amount * 0.1;
        return amount - fee;
    }
    return amount;
};
export const calculateFee = (amount, selectedEarnings) => {
    if (selectedEarnings === "PACKAGE") {
        const fee = amount * 0.1;
        return fee;
    }
    else if (selectedEarnings === "REFERRAL") {
        const fee = amount * 0.1;
        return fee;
    }
    else if (selectedEarnings === "WINNING") {
        const fee = amount * 0.1;
        return fee;
    }
    return 0;
};
export const getPhilippinesTime = (date, time) => {
    // Adjust the date to Philippine Time (UTC+8)
    const philippinesOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
    const adjustedDate = new Date(date.getTime() + philippinesOffset);
    // Set the start or end of the day based on the time parameter
    if (time === "start") {
        adjustedDate.setUTCHours(0, 0, 0, 0);
    }
    else {
        adjustedDate.setUTCHours(23, 59, 59, 999);
    }
    // Convert back to UTC for accurate comparisons
    const resultDate = new Date(adjustedDate.getTime() - philippinesOffset);
    // Return ISO string for database queries
    return resultDate.toISOString();
};
export const toNonNegative = (num) => num < 0 || Math.abs(num) < 1e-6 ? 0 : num;
export const getDepositBonus = (amount) => {
    const depositTiers = [
        { deposit: 10000, percentage: 0.001 },
        { deposit: 25000, percentage: 0.005 },
        { deposit: 50000, percentage: 0.01 },
        { deposit: 75000, percentage: 0.02 },
        { deposit: 100000, percentage: 0.03 },
    ];
    if (amount < 10000) {
        return 0;
    }
    const lowestTier = depositTiers
        .filter((tier) => tier.deposit <= amount)
        .reduce((prev, curr) => (curr.deposit > prev.deposit ? curr : prev), depositTiers[0]);
    return amount * lowestTier.percentage;
};
export const generateRandomCode = (length = 10) => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};
export const generateUniqueReferralCode = async (prisma, maxAttempts = 5) => {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const code = generateRandomCode();
        const existing = await prisma.company_referral_link_table.findUnique({
            where: { company_referral_code: code },
        });
        if (!existing)
            return code;
        attempts++;
    }
    throw new Error("Failed to generate a unique referral code after multiple attempts.");
};
export const invalidateCacheVersion = async (baseKey) => {
    const versionKey = `${baseKey}:version`;
    await redis.incr(versionKey);
};
export const invalidateMultipleCacheVersions = async (baseKeys) => {
    const pipeline = redis.multi();
    baseKeys.forEach((baseKey) => {
        const versionKey = `${baseKey}:version`;
        pipeline.incr(versionKey);
    });
    await pipeline.exec();
};
export const invalidateCache = async (key) => {
    await redis.del(key);
};
export const invalidateMultipleCache = async (baseKeys) => {
    const pipeline = redis.multi();
    baseKeys.forEach((baseKey) => {
        pipeline.del(baseKey);
    });
    await pipeline.exec();
};
