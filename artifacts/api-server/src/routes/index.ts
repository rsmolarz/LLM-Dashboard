import { Router, type IRouter } from "express";
import healthRouter from "./health";
import llmConfigRouter from "./llm-config";
import llmProxyRouter from "./llm-proxy";
import chatRouter from "./chat";
import modelProfilesRouter from "./model-profiles";
import trainingDataRouter from "./training-data";
import ragRouter from "./rag";
import openclawRouter from "./openclaw";
import scanRouter from "./scan";
import vpsDatabaseRouter from "./vps-database";

const router: IRouter = Router();

router.use(healthRouter);
router.use(llmConfigRouter);
router.use(llmProxyRouter);
router.use(chatRouter);
router.use(modelProfilesRouter);
router.use(trainingDataRouter);
router.use(ragRouter);
router.use(openclawRouter);
router.use(scanRouter);
router.use(vpsDatabaseRouter);

export default router;
