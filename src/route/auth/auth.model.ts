import type { Prisma } from "@prisma/client";
import { generateUniqueReferralCode } from "../../utils/function.js";
import prisma from "../../utils/prisma.js";
import { supabaseClient } from "../../utils/supabase.js";

export const loginModel = async (params: { userName: string; ip: string }) => {
  const { userName, ip } = params;
  const user = await prisma.user_table.findFirst({
    where: {
      user_username: {
        equals: userName,
        mode: "insensitive",
      },
      company_member_table: {
        some: {
          company_member_role: {
            not: "ADMIN",
          },
        },
      },
    },
    include: {
      company_member_table: true,
    },
  });

  if (!user) {
    throw new Error("Invalid username or user is not a member.");
  }

  const teamMemberProfile = user.company_member_table[0];

  if (!teamMemberProfile)
    throw new Error("User profile not found or incomplete.");

  if (teamMemberProfile.company_member_restricted) {
    throw new Error("User is temporarily restricted.");
  }

  if (
    teamMemberProfile.company_member_restricted ||
    !teamMemberProfile.company_member_company_id
  ) {
    throw new Error("Access restricted or incomplete profile.");
  }

  await prisma.$transaction([
    prisma.user_history_log.create({
      data: {
        user_ip_address: ip,
        user_history_user_id: user.user_id,
      },
    }),
  ]);

  const redirects: Record<string, string> = {
    MEMBER: "/",
  };

  const redirect = redirects[teamMemberProfile.company_member_role] || "/";

  return redirect;
};

export const loginGetModel = async (userName: string) => {
  const user = await prisma.user_table.findFirstOrThrow({
    where: {
      user_username: {
        equals: userName,
        mode: "insensitive",
      },
    },
  });

  const teamMember = await prisma.company_member_table.findUnique({
    where: {
      company_member_user_id: user?.user_id,
    },
    select: {
      company_member_role: true,
      company_member_restricted: true,
    },
  });

  if (teamMember?.company_member_restricted) {
    throw new Error("Not Allowed");
  }

  return user;
};

export const adminModel = async (params: {
  userName: string;
  password: string;
}) => {
  const { userName } = params;

  const user = await prisma.user_table.findFirst({
    where: {
      user_username: {
        equals: userName,
        mode: "insensitive",
      },
      company_member_table: {
        some: {
          company_member_role: "ADMIN",
        },
      },
    },
    include: {
      company_member_table: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (!user) {
    throw new Error("User is not an admin");
  }

  const teamMember = user.company_member_table[0];

  if (!teamMember) {
    throw new Error("User is not an admin");
  }

  return { success: true };
};

export const registerUserModel = async (params: {
  userId: string;
  userName: string;
  password: string;
  firstName: string;
  lastName: string;
  referalLink: string;
  url: string;
  botField: string;
  ip: string;
  email: string;
  phoneNumber: string;
}) => {
  const {
    userId,
    userName,
    firstName,
    lastName,
    referalLink,
    url,
    ip,
    botField,
    email,
    phoneNumber,
  } = params;

  if (referalLink) {
    const DEFAULT_COMPANY_ID = "a1b9ceb9-cb09-4c09-832d-6e5a017d048b";

    return await prisma.$transaction(async (tx) => {
      const referralCode = await generateUniqueReferralCode(tx);

      const referralLinkURL = `${url}?referralCode=${encodeURIComponent(referralCode)}`;

      const user = await tx.user_table.create({
        data: {
          user_id: userId,
          user_email: email,
          user_first_name: firstName,
          user_last_name: lastName,
          user_username: userName,
          user_bot_field: botField === "true" ? true : false,
          user_phone_number: phoneNumber,
          company_member_table: {
            create: {
              company_member_role: "MEMBER",
              company_member_company_id: DEFAULT_COMPANY_ID,
              company_earnings_table: {
                create: {},
              },
              company_referral_link_table: {
                create: {
                  company_referral_link: referralLinkURL,
                  company_referral_code: referralCode,
                },
              },
            },
          },
        },
        select: {
          user_id: true,
          company_member_table: {
            select: {
              company_member_id: true,
            },
          },
        },
      });

      await handleReferral(
        tx,
        referalLink,
        user.company_member_table[0].company_member_id
      );

      await supabaseClient.auth.admin.updateUserById(userId, {
        user_metadata: {
          Role: "MEMBER",
          ReferralCode: referralCode,
          ReferralLink: referralLinkURL,
          CompanyId: DEFAULT_COMPANY_ID,
          UserName: userName,
          CompanyMemberId: user.company_member_table[0].company_member_id,
        },
      });

      return {
        success: true,
        user,
      };
    });
  }

  await prisma.user_history_log.create({
    data: {
      user_ip_address: ip || "127.0.0.1",
      user_history_user_id: userId,
    },
  });
};

async function handleReferral(
  tx: Prisma.TransactionClient,
  referalLink: string,
  allianceMemberId: string
) {
  const referrerData = await tx.$queryRaw<
    {
      company_referral_link_id: string;
      company_referral_hierarchy: string;
      company_member_id: string;
    }[]
  >`
    SELECT
        rl.company_referral_link_id,
        rt.company_referral_hierarchy,
        am.company_member_id
      FROM company_schema.company_referral_link_table rl
      LEFT JOIN company_schema.company_referral_table rt
        ON rl.company_referral_link_member_id = rt.company_referral_member_id
      LEFT JOIN company_schema.company_member_table am
        ON am.company_member_id = rl.company_referral_link_member_id
      LEFT JOIN user_schema.user_table ut
        ON ut.user_id = am.company_member_user_id
      WHERE rl.company_referral_code = ${referalLink}
  `;

  const referrerLinkId = referrerData[0].company_referral_link_id;
  const parentHierarchy = referrerData[0].company_referral_hierarchy;
  const referrerMemberId = referrerData[0].company_member_id;

  const newReferral = await tx.company_referral_table.create({
    data: {
      company_referral_member_id: allianceMemberId,
      company_referral_link_id: referrerLinkId,
      company_referral_hierarchy: "",
      company_referral_from_member_id: referrerMemberId,
    },
    select: {
      company_referral_id: true,
    },
  });

  const newHierarchy = parentHierarchy
    ? `${parentHierarchy}.${allianceMemberId}`
    : `${referrerMemberId}.${allianceMemberId}`;

  await tx.company_referral_table.update({
    where: {
      company_referral_id: newReferral.company_referral_id,
    },
    data: {
      company_referral_hierarchy: newHierarchy,
    },
  });
}
