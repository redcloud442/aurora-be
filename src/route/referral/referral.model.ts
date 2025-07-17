import { Prisma, type company_member_table } from "@prisma/client";
import prisma from "../../utils/prisma.js";
import { redis } from "../../utils/redis.js";

export const referralDirectModelPost = async (params: {
  page: number;
  limit: number;
  search: string;
  columnAccessor: string;
  isAscendingSort: boolean;
  teamMemberProfile: company_member_table;
}) => {
  const {
    page,
    limit,
    search,
    columnAccessor,
    isAscendingSort,
    teamMemberProfile,
  } = params;

  const version =
    (await redis.get(
      `direct-referral:${teamMemberProfile.company_member_id}:version`
    )) || "v1";

  const cacheKey = `referral-direct-${teamMemberProfile.company_member_id}-${page}-${limit}-${search}-${columnAccessor}-${version}`;

  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    return cachedData;
  }

  const offset = Math.max((page - 1) * limit, 0);

  const directReferrals = await prisma.company_referral_table.findMany({
    where: {
      company_referral_from_member_id: teamMemberProfile.company_member_id,
    },
    select: {
      company_referral_member_id: true,
      company_referral_date: true,
    },
  });

  const directReferralIds = directReferrals.map(
    (ref) => ref.company_referral_member_id
  );

  if (directReferralIds.length === 0) {
    return { data: [], totalCount: 0 };
  }

  let searchCondition = Prisma.sql``;
  if (search) {
    const searchTerm = `%${search}%`;
    searchCondition = Prisma.sql`
      AND (
        u.user_first_name ILIKE ${searchTerm} OR
        u.user_last_name ILIKE ${searchTerm} OR
        u.user_username ILIKE ${searchTerm}
      )
    `;
  }

  const direct = await prisma.$queryRaw`
  SELECT *
  FROM (
    SELECT DISTINCT ON (u.user_id)
      u.user_first_name,
      u.user_last_name,
      u.user_username,
      pa.package_ally_bounty_log_date_created,
      ar.company_referral_date,
      COALESCE(SUM(pa.package_ally_bounty_earnings), 0) AS total_bounty_earnings
    FROM company_schema.company_member_table m
    JOIN user_schema.user_table u ON u.user_id = m.company_member_user_id
    JOIN packages_schema.package_ally_bounty_log pa ON pa.package_ally_bounty_from = m.company_member_id
    JOIN packages_schema.package_member_connection_table pc ON pa.package_ally_bounty_connection_id = pc.package_member_connection_id
    JOIN company_schema.company_referral_table ar ON ar.company_referral_member_id = pa.package_ally_bounty_from
    WHERE pa.package_ally_bounty_member_id = ${teamMemberProfile.company_member_id}::uuid
      AND pa.package_ally_bounty_type = 'DIRECT'
      AND pc.package_member_is_reinvestment = false
      ${searchCondition}
    GROUP BY u.user_id, u.user_first_name, u.user_last_name, u.user_username, pa.package_ally_bounty_log_date_created, ar.company_referral_date
    ORDER BY u.user_id, pa.package_ally_bounty_log_date_created DESC
  ) AS sub
  ORDER BY sub.package_ally_bounty_log_date_created DESC
  LIMIT ${limit} OFFSET ${offset}
`;

  const totalCount: { count: number }[] = await prisma.$queryRaw`
SELECT COUNT(*) AS count
FROM (
  SELECT DISTINCT ON (u.user_id) 1
  FROM company_schema.company_member_table m
  JOIN user_schema.user_table u ON u.user_id = m.company_member_user_id
  JOIN packages_schema.package_ally_bounty_log pa ON pa.package_ally_bounty_from = m.company_member_id
  JOIN packages_schema.package_member_connection_table pc ON pa.package_ally_bounty_connection_id = pc.package_member_connection_id
  WHERE pa.package_ally_bounty_member_id = ${teamMemberProfile.company_member_id}::uuid
    AND pa.package_ally_bounty_type = 'DIRECT'
    AND pc.package_member_is_reinvestment = false
    ${searchCondition}
  ORDER BY u.user_id, pa.package_ally_bounty_log_date_created ASC
) AS subquery;
`;

  const returnData = {
    data: direct,
    totalCount: Number(totalCount[0]?.count || 0),
  };

  await redis.set(cacheKey, JSON.stringify(returnData), { ex: 60 * 5 });

  return returnData;
};

export const referralIndirectModelPost = async (params: {
  page: number;
  limit: number;
  search: string;
  columnAccessor: string;
  isAscendingSort: boolean;
  teamMemberProfile: company_member_table;
}) => {
  const {
    page,
    limit,
    search,
    columnAccessor,
    isAscendingSort,
    teamMemberProfile,
  } = params;

  const version =
    (await redis.get(
      `indirect-referral:${teamMemberProfile.company_member_id}:version`
    )) || "v1";

  const cacheKey = `referral-indirect-${teamMemberProfile.company_member_id}-${page}-${limit}-${search}-${columnAccessor}-${version}`;

  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    return cachedData;
  }

  const directReferrals = await prisma.company_referral_table.findMany({
    where: {
      company_referral_from_member_id: teamMemberProfile.company_member_id,
    },
    select: {
      company_referral_member_id: true,
      company_referral_date: true,
    },
  });

  const directReferralIds = directReferrals.map(
    (ref) => ref.company_referral_member_id
  );

  let indirectReferrals = new Set<string>();
  let currentLevelReferrals = [teamMemberProfile.company_member_id];
  let currentLevel = 0;
  const maxLevel = 10;

  while (currentLevel < maxLevel && currentLevelReferrals.length > 0) {
    const referrerData: { company_referral_hierarchy: string }[] =
      await prisma.$queryRaw`
    SELECT ar.company_referral_hierarchy
    FROM company_schema.company_referral_table ar
    JOIN company_schema.company_referral_link_table al
      ON al.company_referral_link_id = ar.company_referral_link_id
    WHERE al.company_referral_link_member_id = ANY (${currentLevelReferrals}::uuid[])
  `;

    let nextLevelReferrals: string[] = [];
    referrerData.forEach((ref) => {
      const hierarchyArray = ref.company_referral_hierarchy.split(".").slice(1);
      hierarchyArray.forEach((id) => {
        if (
          !indirectReferrals.has(id) &&
          id !== teamMemberProfile.company_member_id
        ) {
          indirectReferrals.add(id);
          nextLevelReferrals.push(id);
        }
      });
    });

    currentLevelReferrals = nextLevelReferrals;
    currentLevel++;
  }

  const finalIndirectReferralIds = Array.from(indirectReferrals).filter(
    (id) => !directReferralIds.includes(id)
  );

  if (finalIndirectReferralIds.length === 0) {
    return { success: false, message: "No referral data found" };
  }

  const offset = Math.max((page - 1) * limit, 0);
  const searchCondition = search
    ? Prisma.raw(
        `AND (ut.user_first_name ILIKE ${`%${search}%`} OR ut.user_last_name ILIKE ${`%${search}%`} OR ut.user_username ILIKE ${`%${search}%`})`
      )
    : Prisma.empty;

  const indirectReferralDetails: {
    user_first_name: string;
    user_last_name: string;
    user_username: string;
    package_ally_bounty_log_date_created: Date;
    total_bounty_earnings: number;
  }[] = await prisma.$queryRaw`
  SELECT *
  FROM (
      SELECT DISTINCT ON (ut.user_id)
        ut.user_first_name, 
        ut.user_last_name, 
        ut.user_username, 
        pa.package_ally_bounty_log_date_created,
        ar.company_referral_date,
        COALESCE(SUM(pa.package_ally_bounty_earnings), 0) AS total_bounty_earnings
      FROM company_schema.company_member_table am
      JOIN user_schema.user_table ut
        ON ut.user_id = am.company_member_user_id
      JOIN packages_schema.package_ally_bounty_log pa
        ON am.company_member_id = pa.package_ally_bounty_from
      JOIN company_schema.company_referral_table ar
        ON ar.company_referral_member_id = pa.package_ally_bounty_from
      JOIN packages_schema.package_member_connection_table pc
        ON pa.package_ally_bounty_connection_id = pc.package_member_connection_id
      WHERE pa.package_ally_bounty_from = ANY(${finalIndirectReferralIds}::uuid[])
        AND pa.package_ally_bounty_member_id = ${teamMemberProfile.company_member_id}::uuid 
        AND pc.package_member_is_reinvestment = false
        ${searchCondition}
      GROUP BY 
        ut.user_id,
        ut.user_first_name, 
        ut.user_last_name, 
        ut.user_username, 
        pa.package_ally_bounty_log_date_created,
        ar.company_referral_date
      ORDER BY ut.user_id, pa.package_ally_bounty_log_date_created DESC, ar.company_referral_date DESC
      LIMIT ${limit} OFFSET ${offset};
      ) AS sub
      ORDER BY sub.package_ally_bounty_log_date_created DESC
    `;

  const totalCountResult: { count: number }[] = await prisma.$queryRaw`
  SELECT COUNT(*) AS count
  FROM (
    SELECT DISTINCT ON (ut.user_id) ut.user_id
    FROM company_schema.company_member_table am
    JOIN user_schema.user_table ut
      ON ut.user_id = am.company_member_user_id
    JOIN packages_schema.package_ally_bounty_log pa
      ON am.company_member_id = pa.package_ally_bounty_from
    JOIN packages_schema.package_member_connection_table pc
      ON pa.package_ally_bounty_connection_id = pc.package_member_connection_id
    WHERE pa.package_ally_bounty_from = ANY(${finalIndirectReferralIds}::uuid[])
      AND pa.package_ally_bounty_member_id = ${teamMemberProfile.company_member_id}::uuid
      AND pc.package_member_is_reinvestment = false
      ${searchCondition}
    ORDER BY ut.user_id, pa.package_ally_bounty_log_date_created DESC
  ) AS subquery;
`;

  const returnData = {
    data: indirectReferralDetails,
    totalCount: Number(totalCountResult[0]?.count || 0),
  };

  await redis.set(cacheKey, JSON.stringify(returnData), { ex: 60 * 5 });

  return returnData;
};

export const referralTotalGetModel = async (params: {
  teamMemberProfile: company_member_table;
}) => {
  const { teamMemberProfile } = params;

  return await prisma.$transaction(async (tx) => {
    const [result] = await tx.$queryRaw<
      Array<{
        package_ally_bounty_member_id: string;
        totalamount: number;
        totalreferral: number;
      }>
    >`
      SELECT
        package_ally_bounty_member_id,
        SUM(package_ally_bounty_earnings) AS totalamount,
        COUNT(DISTINCT package_ally_bounty_from) AS totalreferral
      FROM packages_schema.package_ally_bounty_log
        WHERE package_ally_bounty_member_id::uuid = ${teamMemberProfile.company_member_id}::uuid
      GROUP BY package_ally_bounty_member_id
    `;

    return {
      data: result ? result.totalamount : 0,
    };
  });
};
