import {
  Prisma,
  type company_member_table,
  type user_table,
} from "@prisma/client";
import {
  invalidateMultipleCacheVersions,
  toNonNegative,
} from "../../utils/function.js";
import prisma from "../../utils/prisma.js";
import { redis } from "../../utils/redis.js";

export const packagePostModel = async (params: {
  amount: number;
  packageId: string;
  teamMemberProfile: company_member_table;
}) => {
  const { amount, packageId, teamMemberProfile } = params;

  const connectionData = await prisma.$transaction(async (tx) => {
    const [packageData, earningsData, referralData] = await Promise.all([
      tx.package_table.findFirst({
        where: { package_id: packageId },
      }),
      tx.$queryRaw<
        {
          company_combined_earnings: number;
          company_member_wallet: number;
          company_package_earnings: number;
          company_referral_earnings: number;
        }[]
      >`SELECT 
     company_combined_earnings,
     company_member_wallet,
     company_package_earnings,
     company_referral_earnings
     FROM company_schema.company_earnings_table 
     WHERE company_earnings_member_id = ${teamMemberProfile.company_member_id}::uuid 
     FOR UPDATE`,
      tx.company_referral_table.findUnique({
        where: {
          company_referral_member_id: teamMemberProfile.company_member_id,
        },
      }),
    ]);

    if (!packageData) {
      throw new Error("Package not found.");
    }

    if (packageData.package_is_disabled) {
      throw new Error("Package is disabled.");
    }

    if (!earningsData) {
      throw new Error("Earnings record not found.");
    }

    const {
      company_member_wallet,
      company_package_earnings,
      company_referral_earnings,
      company_combined_earnings,
    } = earningsData[0];

    const combinedEarnings = Number(company_combined_earnings.toFixed(2));
    const requestedAmount = Number(amount.toFixed(2));

    if (requestedAmount > combinedEarnings) {
      throw new Error("Insufficient balance in the wallet.");
    }

    const {
      companyWallet,
      companyEarnings,
      companyReferralBounty,
      companyCombinedEarnings,
      updatedCombinedWallet,
      isReinvestment,
    } = deductFromWallets(
      requestedAmount,
      combinedEarnings,
      Number(company_member_wallet.toFixed(2)),
      Number(company_package_earnings.toFixed(2)),
      Number(company_referral_earnings.toFixed(2)),
      Number(company_combined_earnings.toFixed(2))
    );

    const packagePercentage = new Prisma.Decimal(
      Number(packageData.package_percentage)
    ).div(100);

    const packageAmountEarnings = new Prisma.Decimal(requestedAmount).mul(
      packagePercentage
    );

    const referralChain = generateReferralChain(
      referralData?.company_referral_hierarchy ?? null,
      teamMemberProfile.company_member_id,
      100
    );

    let bountyLogs: Prisma.package_ally_bounty_logCreateManyInput[] = [];
    let baseKeys: string[] = [];
    let transactionKeys: string[] = [];
    let referrerKeys: string[] = [];

    let transactionLogs: Prisma.company_transaction_tableCreateManyInput[] = [];
    const connectionData = await tx.package_member_connection_table.create({
      data: {
        package_member_member_id: teamMemberProfile.company_member_id,
        package_member_package_id: packageId,
        package_member_amount: Number(requestedAmount.toFixed(2)),
        package_amount_earnings: Number(packageAmountEarnings.toFixed(2)),
        package_member_status: "ACTIVE",
        package_member_completion_date: new Date(
          Date.now() + packageData.packages_days * 24 * 60 * 60 * 1000
        ),
        package_member_is_reinvestment: isReinvestment,
      },
      select: {
        package_member_connection_id: true,
      },
    });

    await tx.company_transaction_table.create({
      data: {
        company_transaction_member_id: teamMemberProfile.company_member_id,
        company_transaction_amount: Number(requestedAmount.toFixed(2)),
        company_transaction_description: `${packageData.package_name} Activated`,
        company_transaction_type: "EARNINGS",
      },
    });

    await tx.company_earnings_table.update({
      where: {
        company_earnings_member_id: teamMemberProfile.company_member_id,
      },
      data: {
        company_combined_earnings: toNonNegative(updatedCombinedWallet),
        company_member_wallet: toNonNegative(companyWallet),
        company_package_earnings: toNonNegative(companyEarnings),
        company_referral_earnings: toNonNegative(companyReferralBounty),
      },
    });

    if (referralChain.length > 0) {
      const batchSize = 100;
      const limitedReferralChain = [];
      for (let i = 0; i < referralChain.length; i++) {
        if (referralChain[i].level > 10) break;
        limitedReferralChain.push(referralChain[i]);
      }

      for (let i = 0; i < limitedReferralChain.length; i += batchSize) {
        const batch = limitedReferralChain.slice(i, i + batchSize);

        bountyLogs = batch.map((ref) => {
          const calculatedEarnings =
            (Number(amount) * Number(ref.percentage)) / 100;

          return {
            package_ally_bounty_member_id: ref.referrerId,
            package_ally_bounty_percentage: ref.percentage,
            package_ally_bounty_earnings: calculatedEarnings,
            package_ally_bounty_type: ref.level === 1 ? "DIRECT" : "INDIRECT",
            package_ally_bounty_connection_id:
              connectionData.package_member_connection_id,
            package_ally_bounty_from: teamMemberProfile.company_member_id,
          };
        });

        transactionLogs = batch.map((ref) => {
          const calculatedEarnings =
            (Number(amount) * Number(ref.percentage)) / 100;

          return {
            company_transaction_member_id: ref.referrerId,
            company_transaction_amount: calculatedEarnings,
            company_transaction_type: "EARNINGS",
            company_transaction_description:
              ref.level === 1 ? "Referral" : `Matrix Level ${ref.level}`,
          };
        });

        for (const ref of batch) {
          const referrerId = ref.referrerId;
          const isIndirect = ref.level > 1;

          baseKeys.push(
            `${isIndirect ? "indirect" : "direct"}-referral:${referrerId}`
          );
          transactionKeys.push(`transaction:${referrerId}:EARNINGS`);
          referrerKeys.push(`user-model-get-${referrerId}`);
        }

        await Promise.all(
          batch.map(async (ref) => {
            if (!ref.referrerId) return;

            const calculatedEarnings =
              (Number(amount) * Number(ref.percentage)) / 100;

            await tx.company_earnings_table.update({
              where: { company_earnings_member_id: ref.referrerId },
              data: {
                company_referral_earnings: {
                  increment: calculatedEarnings,
                },
                company_combined_earnings: {
                  increment: calculatedEarnings,
                },
              },
            });
          })
        );
      }
    }

    if (bountyLogs.length > 0) {
      await tx.package_ally_bounty_log.createMany({ data: bountyLogs });
    }

    if (transactionLogs.length > 0) {
      await tx.company_transaction_table.createMany({
        data: transactionLogs,
      });
    }

    if (baseKeys.length > 0) {
      const keys = [...baseKeys, ...transactionKeys, ...referrerKeys];
      await invalidateMultipleCacheVersions(keys);
    }

    if (!teamMemberProfile?.company_member_is_active) {
      await tx.company_member_table.update({
        where: { company_member_id: teamMemberProfile.company_member_id },
        data: {
          company_member_is_active: true,
          company_member_date_updated: new Date(),
        },
      });
    }

    return connectionData;
  });

  return connectionData;
};

export const packageGetModel = async () => {
  const cacheKey = `package-get-model`;

  const cachedData = await redis.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const result = await prisma.$transaction(async (tx) => {
    const data = await tx.package_table.findMany({
      select: {
        package_id: true,
        package_name: true,
        package_percentage: true,
        packages_days: true,
        package_description: true,
        package_color: true,
        package_is_disabled: true,
        package_image: true,
      },
      orderBy: {
        package_percentage: "desc",
      },
    });
    return data;
  });

  await redis.set(cacheKey, JSON.stringify(result), { ex: 60 * 5 });

  return result;
};

export const packageCreatePostModel = async (params: {
  packageName: string;
  packageDescription: string;
  packagePercentage: string;
  packageDays: string;
  packageGif: string;
  packageImage: string;
}) => {
  const {
    packageName,
    packageDescription,
    packagePercentage,
    packageDays,
    packageGif,
    packageImage,
  } = params;

  const checkIfPackageExists = await prisma.package_table.findFirst({
    where: { package_name: packageName },
  });

  if (checkIfPackageExists) {
    throw new Error("Package already exists.");
  }

  const parsedPackagePercentage = parseFloat(packagePercentage);
  const parsedPackageDays = parseInt(packageDays, 10);

  if (isNaN(parsedPackagePercentage) || isNaN(parsedPackageDays)) {
    throw new Error(
      "Invalid number format for packagePercentage or packageDays."
    );
  }

  const result = await prisma.$transaction([
    prisma.package_table.create({
      data: {
        package_name: packageName,
        package_description: packageDescription,
        package_percentage: parsedPackagePercentage,
        packages_days: parsedPackageDays,
        package_color: "",
        package_image: packageImage,
      },
    }),
  ]);

  return result;
};

export const packageUpdatePutModel = async (params: {
  packageName: string;
  packageDescription: string;
  packagePercentage: string;
  packageIsDisabled: boolean;
  packageDays: string;
  packageGif: string;
  packageId: string;
  package_image: string;
}) => {
  const {
    packageName,
    packageDescription,
    packagePercentage,
    packageIsDisabled,
    packageDays,
    packageGif,
    packageId,
    package_image,
  } = params;

  const updatedPackage = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      return await tx.package_table.update({
        where: { package_id: packageId },
        data: {
          package_name: packageName,
          package_description: packageDescription,
          package_percentage: parseFloat(packagePercentage),
          packages_days: parseInt(packageDays),
          package_is_disabled: packageIsDisabled,
          package_color: "",
          package_image: package_image ? package_image : undefined,
        },
      });
    }
  );
  return updatedPackage;
};

export const claimPackagePostModel = async (params: {
  amount: number;
  earnings: number;
  packageConnectionId: string;
  teamMemberProfile: company_member_table;
}) => {
  const { amount, earnings, packageConnectionId, teamMemberProfile } = params;
  const currentTimestamp = new Date();

  await prisma.$transaction(async (tx) => {
    const packageConnection =
      await tx.package_member_connection_table.findUnique({
        where: {
          package_member_connection_id: packageConnectionId,
          package_member_member_id: teamMemberProfile.company_member_id,
        },
      });

    if (!packageConnection) {
      throw new Error("Invalid request.");
    }

    if (
      packageConnection.package_member_member_id !==
      teamMemberProfile.company_member_id
    ) {
      throw new Error("Invalid request.");
    }

    const startDate = new Date(
      packageConnection.package_member_connection_created
    );
    const completionDate = packageConnection.package_member_completion_date
      ? new Date(packageConnection.package_member_completion_date)
      : null;

    const elapsedTimeMs = Math.max(
      currentTimestamp.getTime() - startDate.getTime(),
      0
    );
    const totalTimeMs = completionDate
      ? Math.max(completionDate.getTime() - startDate.getTime(), 0)
      : 0;

    let percentage =
      totalTimeMs > 0 ? (elapsedTimeMs / totalTimeMs) * 100 : 100;
    percentage = Math.min(percentage, 100);

    const packageDetails = await tx.package_table.findUnique({
      where: {
        package_id: packageConnection.package_member_package_id,
      },
      select: {
        package_name: true,
      },
    });

    if (!packageDetails) {
      throw new Error("Invalid request.");
    }

    if (
      !packageConnection.package_member_is_ready_to_claim ||
      percentage !== 100
    ) {
      throw new Error("Invalid request. Package is not ready to claim.");
    }

    const totalClaimedAmount =
      packageConnection.package_member_amount +
      packageConnection.package_amount_earnings;

    const totalAmountToBeClaimed = amount + earnings;

    if (totalClaimedAmount !== totalAmountToBeClaimed) {
      throw new Error("Invalid request");
    }

    const updatedPackage = await tx.package_member_connection_table.updateMany({
      where: {
        package_member_connection_id: packageConnectionId,
        package_member_status: { not: "ENDED" },
      },
      data: {
        package_member_status: "ENDED",
        package_member_is_ready_to_claim: false,
      },
    });

    if (updatedPackage.count === 0) {
      throw new Error("Invalid request. Package has already been claimed.");
    }

    await tx.package_member_connection_table.update({
      where: { package_member_connection_id: packageConnectionId },
      data: {
        package_member_status: "ENDED",
        package_member_is_ready_to_claim: false,
      },
    });

    await tx.company_earnings_table.update({
      where: {
        company_earnings_member_id: teamMemberProfile.company_member_id,
      },
      data: {
        company_package_earnings: { increment: totalClaimedAmount },
        company_combined_earnings: { increment: totalClaimedAmount },
      },
    });

    await tx.company_transaction_table.create({
      data: {
        company_transaction_member_id: teamMemberProfile.company_member_id,
        company_transaction_amount: totalClaimedAmount,
        company_transaction_description: `${packageDetails.package_name} Claimed`,
        company_transaction_type: "EARNINGS",
      },
    });

    await tx.package_earnings_log.create({
      data: {
        package_member_connection_id: packageConnectionId,
        package_member_package_id: packageConnection.package_member_package_id,
        package_member_member_id: teamMemberProfile.company_member_id,
        package_member_connection_created:
          packageConnection.package_member_connection_created,
        package_member_amount: packageConnection.package_member_amount,
        package_member_amount_earnings: earnings,
        package_member_status: "ENDED",
      },
    });
  });
};

export const packageListGetModel = async (params: {
  teamMemberProfile: company_member_table;
}) => {
  const { teamMemberProfile } = params;

  const currentTimestamp = new Date();

  const chartData = await prisma.package_member_connection_table.findMany({
    where: {
      package_member_status: "ACTIVE",
      package_member_member_id: teamMemberProfile.company_member_id,
    },
    orderBy: {
      package_member_connection_created: "desc",
    },
    include: {
      package_table: {
        select: {
          package_name: true,
          package_color: true,
          packages_days: true,
          package_percentage: true,
          package_image: true,
        },
      },
    },
  });

  const processedData = await Promise.all(
    chartData.map(async (row) => {
      const startDate = new Date(row.package_member_connection_created);
      const completionDate = row.package_member_completion_date
        ? new Date(row.package_member_completion_date)
        : null;

      const elapsedTimeMs = Math.max(
        currentTimestamp.getTime() - startDate.getTime(),
        0
      );
      const totalTimeMs = completionDate
        ? Math.max(completionDate.getTime() - startDate.getTime(), 0)
        : 0;

      let percentage =
        totalTimeMs > 0 ? (elapsedTimeMs / totalTimeMs) * 100 : 100;
      percentage = Math.min(percentage, 100);

      // Calculate current amount
      const initialAmount = row.package_member_amount;
      const profitAmount = row.package_amount_earnings;
      const currentAmount = (initialAmount + profitAmount) * percentage;

      if (percentage === 100 && !row.package_member_is_ready_to_claim) {
        await prisma.package_member_connection_table.update({
          where: {
            package_member_connection_id: row.package_member_connection_id,
          },
          data: { package_member_is_ready_to_claim: true },
        });
      }

      return {
        package: row.package_table.package_name,
        package_color: row.package_table.package_color,
        completion_date: completionDate?.toISOString(),
        amount: Number(row.package_member_amount.toFixed(2)),
        completion: Number(percentage.toFixed(2)),
        package_connection_id: row.package_member_connection_id,
        profit_amount: Number(row.package_amount_earnings.toFixed(2)),
        current_amount: Number(Math.trunc(currentAmount)),
        is_ready_to_claim: percentage === 100,
        package_percentage: row.package_table.package_percentage,
        package_days: row.package_table.packages_days,
        package_image: row.package_table.package_image,
        package_date_created: row.package_member_connection_created,
      };
    })
  );

  return processedData;
};

export const packageListGetAdminModel = async () => {
  const result = await prisma.package_table.findMany({
    select: {
      package_id: true,
      package_name: true,
      package_percentage: true,
      package_description: true,
      packages_days: true,
      package_color: true,
      package_image: true,
    },
    orderBy: {
      package_percentage: "desc",
    },
  });

  return result;
};

export const packagePostReinvestmentModel = async (params: {
  amount: number;
  packageId: string;
  teamMemberProfile: company_member_table;
  user: user_table;
}) => {
  const { amount, packageId, teamMemberProfile } = params;

  const connectionData = await prisma.$transaction(async (tx) => {
    const [packageData, earningsData, referralData] = await Promise.all([
      tx.package_table.findUnique({
        where: { package_id: packageId },
        select: {
          package_percentage: true,
          packages_days: true,
          package_is_disabled: true,
          package_name: true,
        },
      }),
      tx.$queryRaw<
        {
          company_combined_earnings: number;
          company_package_earnings: number;
          company_referral_earnings: number;
        }[]
      >`SELECT 
       company_combined_earnings,
       company_package_earnings,
       company_referral_earnings
       FROM company_schema.company_earnings_table 
       WHERE company_earnings_member_id = ${teamMemberProfile.company_member_id}::uuid 
       FOR UPDATE`,

      tx.company_referral_table.findFirst({
        where: {
          company_referral_member_id: teamMemberProfile.company_member_id,
        },
        select: { company_referral_hierarchy: true },
      }),
    ]);

    if (!packageData) {
      throw new Error("Package not found.");
    }

    if (packageData.package_is_disabled) {
      throw new Error("Package is disabled.");
    }

    if (!earningsData) {
      throw new Error("Earnings record not found.");
    }

    const {
      company_combined_earnings,
      company_package_earnings,
      company_referral_earnings,
    } = earningsData[0];

    const combinedEarnings = Number(company_combined_earnings.toFixed(2));
    const requestedAmount = Number(amount.toFixed(2));

    if (combinedEarnings < requestedAmount) {
      throw new Error("Insufficient balance in the wallet.");
    }

    const finalAmount = requestedAmount;

    const {
      olympusEarnings,
      referralWallet,
      isReinvestment,
      updatedCombinedWallet,
    } = deductFromWalletsReinvestment(
      requestedAmount,
      combinedEarnings,
      Number(company_package_earnings.toFixed(2)),
      Number(company_referral_earnings.toFixed(2))
    );

    const packagePercentage = new Prisma.Decimal(
      Number(packageData.package_percentage)
    ).div(100);

    const packageAmountEarnings = new Prisma.Decimal(finalAmount).mul(
      packagePercentage
    );

    const referralChain = generateReferralChain(
      referralData?.company_referral_hierarchy ?? null,
      teamMemberProfile.company_member_id,
      100
    );

    let bountyLogs: Prisma.package_ally_bounty_logCreateManyInput[] = [];
    let transactionLogs: Prisma.company_transaction_tableCreateManyInput[] = [];

    const requestedAmountWithBonus = requestedAmount;

    const connectionData = await tx.package_member_connection_table.create({
      data: {
        package_member_member_id: teamMemberProfile.company_member_id,
        package_member_package_id: packageId,
        package_member_amount: Number(requestedAmountWithBonus.toFixed(2)),
        package_amount_earnings: Number(packageAmountEarnings.toFixed(2)),
        package_member_status: "ACTIVE",
        package_member_completion_date: new Date(
          Date.now() + packageData.packages_days * 24 * 60 * 60 * 1000
        ),
        package_member_is_reinvestment: isReinvestment,
      },
    });

    await tx.company_transaction_table.create({
      data: {
        company_transaction_member_id: teamMemberProfile.company_member_id,
        company_transaction_amount: Number(requestedAmountWithBonus.toFixed(2)),
        company_transaction_description: `${packageData.package_name} Activated`,
        company_transaction_type: "EARNINGS",
      },
    });

    await tx.company_earnings_table.update({
      where: {
        company_earnings_member_id: teamMemberProfile.company_member_id,
      },
      data: {
        company_combined_earnings: updatedCombinedWallet,
        company_package_earnings: olympusEarnings,
        company_referral_earnings: referralWallet,
      },
    });

    if (referralChain.length > 0) {
      const batchSize = 100;
      const limitedReferralChain = [];
      for (let i = 0; i < referralChain.length; i++) {
        if (referralChain[i].level > 10) break;
        limitedReferralChain.push(referralChain[i]);
      }

      for (let i = 0; i < limitedReferralChain.length; i += batchSize) {
        const batch = limitedReferralChain.slice(i, i + batchSize);

        bountyLogs = batch.map((ref) => {
          // Calculate earnings based on ref.percentage and round to the nearest integer
          const calculatedEarnings =
            (Number(finalAmount) * Number(ref.percentage)) / 100;

          return {
            package_ally_bounty_member_id: ref.referrerId,
            package_ally_bounty_percentage: ref.percentage,
            package_ally_bounty_earnings: calculatedEarnings,
            package_ally_bounty_type: ref.level === 1 ? "DIRECT" : "INDIRECT",
            package_ally_bounty_connection_id:
              connectionData.package_member_connection_id,
            package_ally_bounty_from: teamMemberProfile.company_member_id,
          };
        });

        transactionLogs = batch.map((ref) => {
          const calculatedEarnings =
            (Number(finalAmount) * Number(ref.percentage)) / 100;

          return {
            company_transaction_member_id: ref.referrerId,
            company_transaction_amount: calculatedEarnings,
            company_transaction_description:
              ref.level === 1 ? "Referral" : `Matrix Level ${ref.level}`,
          };
        });

        await Promise.all(
          batch.map(async (ref) => {
            if (!ref.referrerId) return;

            const calculatedEarnings =
              (Number(finalAmount) * Number(ref.percentage)) / 100;

            await tx.company_earnings_table.update({
              where: { company_earnings_member_id: ref.referrerId },
              data: {
                company_referral_earnings: {
                  increment: calculatedEarnings,
                },
                company_combined_earnings: {
                  increment: calculatedEarnings,
                },
              },
            });
          })
        );
      }

      if (bountyLogs.length > 0) {
        await tx.package_ally_bounty_log.createMany({ data: bountyLogs });
      }

      if (transactionLogs.length > 0) {
        await tx.company_transaction_table.createMany({
          data: transactionLogs,
        });
      }
    }

    return connectionData;
  });

  return connectionData;
};

function generateReferralChain(
  hierarchy: string | null,
  teamMemberId: string,
  maxDepth = 100
) {
  if (!hierarchy) return [];

  const hierarchyArray = hierarchy.split(".");
  const currentIndex = hierarchyArray.indexOf(teamMemberId);

  if (currentIndex === -1) {
    throw new Error("Current member ID not found in the hierarchy.");
  }

  return hierarchyArray
    .slice(0, currentIndex)
    .reverse()
    .slice(0, maxDepth)
    .map((referrerId, index) => ({
      referrerId,
      percentage: getBonusPercentage(index + 1),
      level: index + 1,
    }));
}

function getBonusPercentage(level: number): number {
  const bonusMap: Record<number, number> = {
    1: 10,
    2: 1.5,
    3: 1.5,
    4: 1.5,
    5: 1,
    6: 1,
    7: 1,
    8: 1,
    9: 1,
    10: 1,
  };

  return bonusMap[level] || 0;
}

function deductFromWalletsReinvestment(
  amount: number,
  combinedWallet: number,
  olympusEarnings: number,
  referralWallet: number
) {
  let remaining = amount;
  let isReinvestment = false;

  if (combinedWallet < amount) {
    throw new Error("Insufficient balance in combined wallet.");
  }

  // Deduct from Olympus Earnings next
  if (remaining > 0) {
    if (olympusEarnings >= remaining) {
      isReinvestment = true;
      olympusEarnings -= remaining;
      remaining = 0;
    } else {
      remaining -= olympusEarnings;
      isReinvestment = true;
      olympusEarnings = 0;
    }
  }

  // Deduct from Referral Wallet
  if (remaining > 0) {
    if (referralWallet >= remaining) {
      referralWallet -= remaining;
      remaining = 0;
    } else {
      remaining -= referralWallet;
      referralWallet = 0;
    }
  }

  remaining = Math.round(remaining * 1000000) / 1000000;

  // If any balance remains, throw an error
  if (remaining > 0) {
    throw new Error("Insufficient funds to complete the transaction.");
  }

  // Return updated balances and remaining combined wallet
  return {
    olympusEarnings,
    referralWallet,
    isReinvestment,
    updatedCombinedWallet: combinedWallet - amount,
  };
}

function deductFromWallets(
  amount: number,
  combinedWallet: number,
  companyWallet: number,
  companyEarnings: number,
  companyReferralBounty: number,
  companyCombinedEarnings: number
) {
  let remaining = amount;
  let isReinvestment = false;

  // Validate total funds
  if (combinedWallet < amount) {
    throw new Error("Insufficient balance in combined wallet.");
  }

  // Deduct from Olympus Wallet first
  if (companyWallet >= remaining) {
    companyWallet -= remaining;
    remaining = 0;
  } else {
    remaining -= companyWallet;
    companyWallet = 0;
  }

  // Deduct from Olympus Earnings next
  if (remaining > 0) {
    if (companyEarnings >= remaining) {
      isReinvestment = true;
      companyEarnings -= remaining;
      remaining = 0;
    } else {
      isReinvestment = true;
      remaining -= companyEarnings;
      companyEarnings = 0;
    }
  }

  // Deduct from Referral Wallet
  if (remaining > 0) {
    if (companyReferralBounty >= remaining) {
      companyReferralBounty -= remaining;
      remaining = 0;
    } else {
      remaining -= companyReferralBounty;
      companyReferralBounty = 0;
    }
  }

  if (remaining > 0) {
    if (companyCombinedEarnings >= remaining) {
      companyCombinedEarnings -= remaining;
      remaining = 0;
    } else {
      remaining -= companyCombinedEarnings;
      companyCombinedEarnings = 0;
    }
  }

  if (remaining > 0) {
    throw new Error("Insufficient funds to complete the transaction.");
  }

  // Return updated balances and remaining combined wallet
  return {
    companyWallet,
    companyEarnings,
    companyReferralBounty,
    companyCombinedEarnings,
    updatedCombinedWallet: combinedWallet - amount,
    isReinvestment,
  };
}
