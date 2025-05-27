import { Hono } from "hono";
import {
  bannerDeleteController,
  bannerGetController,
  bannerPostController,
  bannerPutController,
} from "./banner.controller.js";
import {
  bannerDeleteMiddleware,
  bannerGetMiddleware,
  bannerPostMiddleware,
  bannerPutMiddleware,
} from "./banner.middleware.js";
const banner = new Hono();

banner.post("/", bannerPostMiddleware, bannerPostController);

banner.put("/:id", bannerPutMiddleware, bannerPutController);

banner.delete("/:id", bannerDeleteMiddleware, bannerDeleteController);

banner.get("/", bannerGetMiddleware, bannerGetController);

export default banner;
