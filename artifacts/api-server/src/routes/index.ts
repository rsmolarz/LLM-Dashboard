import { Router, type IRouter } from "express";
import healthRouter from "./health";
import llmConfigRouter from "./llm-config";
import llmProxyRouter from "./llm-proxy";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(llmConfigRouter);
router.use(llmProxyRouter);
router.use(chatRouter);

export default router;
