import { Hono } from "hono";

import {
  packageGetController,
  packagePostController,
  packageReinvestmentPostController,
  packagesClaimPostController,
  packagesCreatePostController,
  packagesGetAdminController,
  packagesListPostController,
  packagesUpdatePutController,
} from "./package.controller.js";
import {
  packageCreatePostMiddleware,
  packageGetMiddleware,
  packagePostMiddleware,
  packageReinvestmentPostMiddleware,
  packagesClaimPostMiddleware,
  packagesGetListMiddleware,
  packageUpdatePutMiddleware,
} from "./package.middleware.js";

const packages = new Hono();

packages.post("/", packagePostMiddleware, packagePostController);

packages.get("/", packageGetMiddleware, packageGetController);

packages.put("/:id", packageUpdatePutMiddleware, packagesUpdatePutController);

packages.post("/list", packageGetMiddleware, packagesListPostController);

packages.get("/list", packagesGetListMiddleware, packagesGetAdminController);

packages.post(
  "/create",
  packageCreatePostMiddleware,
  packagesCreatePostController
);

packages.post(
  "/claim",
  packagesClaimPostMiddleware,
  packagesClaimPostController
);

packages.post(
  "/reinvestment",
  packageReinvestmentPostMiddleware,
  packageReinvestmentPostController
);

export default packages;
