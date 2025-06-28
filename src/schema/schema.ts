import { z } from "zod";

//for auth and register

const reservedUsernames = [
  "admin",
  "root",
  "support",
  "superuser",
  "about",
  "contact",
  "user",
  "null",
  "undefined",
  "test",
];

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginSchema = z.object({
  userName: z
    .string()
    .trim()
    .min(6, "Username must be at least 6 characters long")
    .max(20, "Username must be at most 20 characters long")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9._]*$/,
      "Username must start with a letter and can only contain letters, numbers, dots, and underscores"
    )
    .refine(
      (val) => !/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu.test(val),
      {
        message: "Username must not contain emojis",
      }
    )
    .refine((val) => !reservedUsernames.includes(val.toLowerCase()), {
      message: "This username is not allowed",
    }),
  password: z
    .string()
    .trim()
    .min(6, "Password must be at least 6 characters")
    .refine((val) => !val.includes(" "), {
      message: "Password must not contain spaces",
    })
    .optional(),
});

export const loginCheckSchema = z.object({
  userName: z
    .string()
    .trim()
    .min(6, "Username must be at least 6 characters long")
    .max(20, "Username must be at most 20 characters long")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9._]*$/,
      "Username must start with a letter and can only contain letters, numbers, dots, and underscores"
    )
    .refine(
      (val) => !/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu.test(val),
      {
        message: "Username must not contain emojis",
      }
    )
    .refine((val) => !reservedUsernames.includes(val.toLowerCase()), {
      message: "This username is not allowed",
    }),
});

//register

export const registerUserSchema = z.object({
  userId: z.string().uuid(),
  userName: z
    .string()
    .trim()
    .min(6, "Username must be at least 6 characters long")
    .max(20, "Username must be at most 20 characters long")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9._]*$/,
      "Username must start with a letter and can only contain letters, numbers, dots, and underscores"
    )
    .refine(
      (val) => !/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu.test(val),
      {
        message: "Username must not contain emojis",
      }
    )
    .refine((val) => !reservedUsernames.includes(val.toLowerCase()), {
      message: "This username is not allowed",
    }),
  firstName: z
    .string()
    .trim()
    .min(3, "First name is required")
    .max(50, "First name must be less than 50 characters"),
  lastName: z
    .string()
    .trim()
    .min(3, "Last name is required")
    .max(50, "Last name must be less than 50 characters"),
  referalLink: z.string().min(2),
  email: z.preprocess(
    (val) => (val === "" || val == null ? undefined : val),
    z.string().email("Invalid email address").optional()
  ),
  phoneNumber: z.preprocess(
    (val) => (val === "" || val == null ? undefined : val),
    z
      .string()
      .regex(/^\d+$/, "Phone number must only contain digits")
      .min(10, "Phone number must be at least 10 digits")
      .max(11, "Phone number must be at most 11 digits")
      .optional()
  ),
  url: z.string().min(2),
  botField: z.string().optional(),
});

//for deposit

export const depositSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(3, "Amount is required and must be at least 200 pesos")
    .max(6, "Amount must be less than 6 digits")
    .regex(/^\d+$/, "Amount must be a number")
    .refine((amount) => parseInt(amount, 10) >= 200, {
      message: "Amount must be at least 200 pesos",
    }),
  topUpMode: z.string().min(1, "Top up mode is required"),
  accountName: z.string().min(1, "Field is required"),
  accountNumber: z.string().min(1, "Field is required"),
});

export type DepositFormValues = z.infer<typeof depositSchema>;

export const updateDepositSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().optional(),
  requestId: z.string().uuid(),
});

export const depositHistoryPostSchema = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  columnAccessor: z.string().min(3),
  isAscendingSort: z.boolean(),
  userId: z.string().optional(),
});

export const depositListPostSchema = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(10),
  search: z.string().optional(),
  columnAccessor: z.string().min(3),
  merchantFilter: z.string().optional(),
  userFilter: z.string().optional(),
  statusFilter: z.enum(["APPROVED", "REJECTED", "PENDING"]),
  isAscendingSort: z.boolean(),
  dateFilter: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

export const depositReferencePostSchema = z.object({
  reference: z.string().min(5, "Field is required").max(5, "Field is required"),
});

export const depositReportPostSchema = z.object({
  dateFilter: z
    .object({
      month: z.string().optional(),
      year: z.string().optional(),
    })
    .optional(),
});

//user schema

export const userSchemaPut = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  userId: z.string().uuid(),
});

export const userSchemaPost = z.object({
  memberId: z.string().uuid(),
});

export const userSchemaPatch = z.object({
  memberId: z.string().uuid(),
  action: z.enum(["updateRole", "banUser"]),
  role: z
    .enum(["ADMIN", "MEMBER", "MERCHANT", "ACCOUNTING", "ACCOUNTING_HEAD"])
    .optional(),
});

export const userProfileSchemaPatch = z.object({
  profilePicture: z.string().min(1),
  userId: z.string().uuid(),
});

export const userChangePasswordSchema = z.object({
  password: z.string().min(6),
  userId: z.string().uuid(),
});

export const userGenerateLinkSchema = z.object({
  formattedUserName: z.string().min(1),
});

export const userSponsorSchema = z.object({
  userId: z.string().uuid(),
});

export const userGetReferralSchema = z.object({
  memberId: z.string().uuid(),
  dateFilter: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

export const userListSchema = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(10),
  search: z.string().optional(),
  columnAccessor: z.string().min(3),
  isAscendingSort: z.boolean(),
  userRole: z.string().optional(),
  dateCreated: z.string().optional(),
  bannedUser: z.boolean().optional(),
});

export const userActiveListSchema = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(10),
  search: z.string().optional(),
  columnAccessor: z.string().min(3),
  isAscendingSort: z.boolean(),
});

export const userListReinvestedSchema = z.object({
  dateFilter: z.object({
    start: z.string().optional().nullable(),
    end: z.string().optional().nullable(),
  }),
  take: z.number().min(1).max(10),
  skip: z.number().min(1),
});

export const userTreeSchema = z.object({
  memberId: z.string().uuid(),
});

export const userGetSearchSchema = z.object({
  userName: z
    .string()
    .min(1, "Username must be at least 6 characters long")
    .max(20, "Username must be at most 20 characters long")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    ),
});

//transaction schema

export const transactionSchemaPost = z.object({
  limit: z.number().min(1).max(10),
  page: z.number().min(1),
  status: z.enum(["DEPOSIT", "WITHDRAWAL", "EARNINGS"]),
});

//referral schema

export const directReferralsSchemaPost = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(10),
  search: z.string().optional(),
  columnAccessor: z.string().min(3),
  isAscendingSort: z.boolean(),
});

export const indirectReferralsSchemaPost = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(10),
  search: z.string().optional(),
  columnAccessor: z.string().min(3),
  isAscendingSort: z.boolean(),
});

//packages schema

export const packagePostSchema = z.object({
  amount: z.number().refine((val) => Number(val) >= 100, {
    message: "Minimum amount is 100 pesos",
  }),
  packageId: z.string().uuid(),
});

export const packageReinvestmentPostSchema = z.object({
    amount: z.number().refine((val) => Number(val) >= 100, {
      message: "Minimum amount is 100 pesos",
    }),
    packageId: z.string().uuid(),
    packageConnectionId: z.string().uuid(),
  });

export const createPackagePostSchema = z.object({
  packageName: z.string().min(3),
  packageDescription: z.string().min(3),
  packagePercentage: z.string().min(1),
  packageDays: z.string().min(1),
  packageColor: z.string().optional(),
  packageImage: z.string().min(3).optional(),
});

export const updatePackageSchema = z.object({
  packageName: z.string().min(3),
  packageDescription: z.string().min(3),
  packagePercentage: z.string().min(1),
  packageDays: z.string().min(1),
  packageIsDisabled: z.boolean().optional(),
  packageColor: z.string().nullable().optional(),
  package_image: z.string().nullable().optional(),
  packageId: z.string().uuid(),
});

export const claimPackagePutSchema = z.object({
  amount: z.number().min(1),
  earnings: z.number(),
  packageConnectionId: z.string().uuid(),
});

//merchant schema

export const merchantDeleteSchema = z.object({
  merchantId: z.string().uuid(),
});

export const merchantPostSchema = z.object({
  accountNumber: z.string().min(1),
  accountType: z.string().min(1),
  accountName: z.string().min(1),
  merchantQrAttachment: z.string().optional(),
});

export const merchantPatchSchema = z.object({
  amount: z.number().min(1),
  memberId: z.string().uuid(),
  userName: z.string().min(1),
});

export const merchantBankSchema = z.object({
  page: z.number().min(1).max(10),
  limit: z.number().min(1).max(10),
});

//withdraw schema

export const withdrawPostSchema = z.object({
  earnings: z.enum(["PACKAGE", "REFERRAL"]),
  amount: z
    .string()
    .min(3, "Minimum amount is required atleast 100 pesos")
    .refine((amount) => parseInt(amount.replace(/,/g, ""), 10) >= 100, {
      message: "Amount must be at least 100 pesos",
    }),
  bank: z.string().min(1, "Please select a bank"),
  accountName: z
    .string()
    .min(6, "Account name is required")
    .max(40, "Account name must be at most 24 characters"),
  accountNumber: z
    .string()
    .min(6, "Account number is required")
    .max(24, "Account number must be at most 24 digits"),
});

export const withdrawHistoryPostSchema = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(10),
  search: z.string().optional(),
  columnAccessor: z.string().min(3).optional(),
  userId: z.string().optional(),
  isAscendingSort: z.boolean().optional(),
});

export const updateWithdrawSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().optional(),
  requestId: z.string().uuid(),
});

export const withdrawListPostSchema = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(10),
  search: z.string().optional(),
  columnAccessor: z.string().min(3),
  userFilter: z.string().optional(),
  statusFilter: z.enum(["APPROVED", "REJECTED", "PENDING"]),
  isAscendingSort: z.boolean(),
  dateFilter: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  showHiddenUser: z.boolean(),
  showAllDays: z.boolean().default(false),
});

//dashboard schema

export const dashboardPostSchema = z.object({
  dateFilter: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .optional(),
});

export const withdrawHistoryReportPostSchema = z.object({
  dateFilter: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

export const withdrawTotalReportPostSchema = z.object({
  type: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  take: z.number().optional(),
  skip: z.number().optional(),
});

export const withdrawHideUserPostSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["add", "remove"]),
});

export const withdrawUserGetSchema = z.object({
  id: z.string().uuid(),
});

//leaderboard schema

export const leaderboardPostSchema = z.object({
  leaderBoardType: z.enum(["DIRECT", "INDIRECT"]),
  limit: z.number().min(1).max(10),
  page: z.number().min(1),
});

// options schema

export const userOptionsPostSchema = z.object({
  page: z.number().min(1).max(10),
  limit: z.number().min(1).max(500),
});

//wheel schema

export const wheelPutSchema = z.object({
  quantity: z.number().max(100),
});

export const wheelPutSettingsSchema = z.object({
  id: z.string().uuid(),
  percentage: z.number().max(100),
  label: z.string().min(1),
  color: z.string().min(1),
});

//testimonial schema

export const testimonialPostSchema = z.array(
  z.object({
    videoUrl: z.string().min(1),
    posterUrl: z.string().min(1),
  })
);

export const testimonialGetSchema = z.object({
  take: z.string().min(1).max(15),
  skip: z.string().min(1),
});

export const testimonialPutSchema = z.object({
  id: z.string().uuid(),
});

export const bannerPostSchema = z.object({
  company_promo_image: z.string().min(1),
});

export const bannerPutSchema = z.object({
  company_promo_image: z.string().min(1),
  id: z.string().uuid(),
});

export const bannerDeleteSchema = z.object({
  id: z.string().uuid(),
});

export const userGetIdSchema = z.object({
  id: z.string().uuid(),
});
