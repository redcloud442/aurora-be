import prisma from "../../utils/prisma.js";
import { redis } from "../../utils/redis.js";
export const leaderboardPostModel = async (params) => {
    const { leaderBoardType, limit, page } = params;
    const offset = (page - 1) * limit;
    const cacheKey = `leaderboard-${leaderBoardType}-${limit}-${page}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return cachedData;
    }
    // Get total count of distinct members in the leaderboard
    const totalCount = (await prisma.$queryRaw `
        SELECT COUNT(DISTINCT package_ally_bounty_member_id) AS count
        FROM packages_schema.package_ally_bounty_log
        WHERE package_ally_bounty_type = ${leaderBoardType}
      `)[0]?.count || 0;
    const leaderBoardData = await prisma.$queryRaw `
    SELECT
      package_ally_bounty_member_id,
      SUM(package_ally_bounty_earnings) AS totalamount,
      COUNT(DISTINCT package_ally_bounty_from) AS totalreferral
    FROM packages_schema.package_ally_bounty_log
    WHERE package_ally_bounty_type = ${leaderBoardType}
    GROUP BY package_ally_bounty_member_id
    ORDER BY totalAmount DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
    const memberIds = leaderBoardData.map((entry) => entry.package_ally_bounty_member_id);
    // Fetch usernames for the members in the leaderboard
    const members = await prisma.company_member_table.findMany({
        where: { company_member_id: { in: memberIds } },
        include: { user_table: { select: { user_username: true } } },
    });
    const memberLookup = Object.fromEntries(members.map((m) => [
        m.company_member_id.trim(),
        m.user_table?.user_username || "Unknown",
    ]));
    const leaderboardWithUserDetails = leaderBoardData.map((entry) => ({
        username: memberLookup[entry.package_ally_bounty_member_id] || "Unknown",
        totalAmount: Number(entry.totalamount) || 0,
        totalReferral: Number(entry.totalreferral) || 0,
    }));
    const returndata = {
        totalCount: Number(totalCount),
        data: leaderboardWithUserDetails,
    };
    await redis.set(cacheKey, JSON.stringify(leaderboardWithUserDetails), {
        ex: 60 * 2,
    });
    return returndata;
};
