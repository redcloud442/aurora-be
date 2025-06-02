import { Hono } from "hono";
import {
  userActiveListController,
  userChangePasswordController,
  userGenerateLinkController,
  userGetController,
  userGetSearchController,
  userListController,
  userListReinvestedController,
  userPatchController,
  userPostController,
  userProfilePutController,
  userPutController,
  userReferralController,
  userSponsorController,
  userTreeController,
} from "./user.controller.js";
import {
  userActiveListMiddleware,
  userChangePasswordMiddleware,
  userGenerateLinkMiddleware,
  userGetMiddleware,
  userGetSearchMiddleware,
  userListMiddleware,
  userListReinvestedMiddleware,
  userPatchMiddleware,
  userPostMiddleware,
  userProfilePutMiddleware,
  userPutMiddleware,
  userReferralMiddleware,
  userSponsorMiddleware,
  userTreeMiddleware,
} from "./user.middleware.js";

const user = new Hono();

user.post("/", userPostMiddleware, userPostController);

user.put("/", userPutMiddleware, userPutController);

user.patch("/:id", userPatchMiddleware, userPatchController);

user.get("/search", userGetSearchMiddleware, userGetSearchController);

user.post("/:id/referral", userReferralMiddleware, userReferralController);

user.put("/:id", userProfilePutMiddleware, userProfilePutController);

user.get("/:id/tree", userTreeMiddleware, userTreeController);

user.get("/", userGetMiddleware, userGetController);

user.get("/:id", userGetMiddleware, userGetController);

user.put(
  "/:id/change-password",
  userChangePasswordMiddleware,
  userChangePasswordController
);

user.post(
  "/generate-link",
  userGenerateLinkMiddleware,
  userGenerateLinkController
);

user.post(
  "/list/reinvested",
  userListReinvestedMiddleware,
  userListReinvestedController
);

user.post("/sponsor", userSponsorMiddleware, userSponsorController);

user.post("/list", userListMiddleware, userListController);

user.post("/active-list", userActiveListMiddleware, userActiveListController);

export default user;
