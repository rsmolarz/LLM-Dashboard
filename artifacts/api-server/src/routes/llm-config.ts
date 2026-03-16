import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, llmConfigTable } from "@workspace/db";
import {
  GetLlmConfigResponse,
  SaveLlmConfigBody,
  SaveLlmConfigResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/llm/config", async (_req, res): Promise<void> => {
  let [config] = await db.select().from(llmConfigTable).limit(1);

  if (!config) {
    [config] = await db
      .insert(llmConfigTable)
      .values({})
      .returning();
  }

  res.json(GetLlmConfigResponse.parse(config));
});

router.put("/llm/config", async (req, res): Promise<void> => {
  const parsed = SaveLlmConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [existing] = await db.select().from(llmConfigTable).limit(1);

  let config;
  if (existing) {
    [config] = await db
      .update(llmConfigTable)
      .set(parsed.data)
      .where(eq(llmConfigTable.id, existing.id))
      .returning();
  } else {
    [config] = await db
      .insert(llmConfigTable)
      .values(parsed.data)
      .returning();
  }

  res.json(SaveLlmConfigResponse.parse(config));
});

router.get("/llm/setup-script", async (_req, res): Promise<void> => {
  let [config] = await db.select().from(llmConfigTable).limit(1);

  if (!config) {
    [config] = await db.insert(llmConfigTable).values({}).returning();
  }

  const script = `#!/bin/bash
set -e

echo "============================================"
echo "  llama.cpp Docker Setup Script"
echo "============================================"
echo ""

CONTAINER_NAME="${config.containerName}"
PORT=${config.port}
CPU_THREADS=${config.cpuThreads}
CTX_SIZE=${config.contextSize}
GPU_LAYERS=${config.gpuLayers}
MODEL_DIR="$HOME/models"

# Create model directory
mkdir -p "$MODEL_DIR"

# Detect NVIDIA GPU
HAS_GPU=false
if command -v nvidia-smi &> /dev/null; then
    echo "[INFO] NVIDIA GPU detected!"
    nvidia-smi --query-gpu=name --format=csv,noheader
    HAS_GPU=true
else
    echo "[INFO] No NVIDIA GPU detected. Running in CPU-only mode."
    GPU_LAYERS=0
fi

# Download a starter model if none exists
if [ -z "$(ls -A $MODEL_DIR/*.gguf 2>/dev/null)" ]; then
    echo ""
    echo "[INFO] No models found. Downloading Qwen 2.5 3B (~2GB)..."
    curl -L -o "$MODEL_DIR/qwen2.5-3b-instruct-q4_k_m.gguf" \\
        "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
    echo "[INFO] Model downloaded successfully."
fi

MODEL_FILE=$(ls "$MODEL_DIR"/*.gguf | head -1)
echo ""
echo "[INFO] Using model: $MODEL_FILE"

# Stop existing container if running
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# Run llama.cpp server
echo ""
echo "[INFO] Starting llama.cpp server..."

if [ "$HAS_GPU" = true ] && [ "$GPU_LAYERS" -gt 0 ]; then
    echo "[INFO] Running with GPU acceleration ($GPU_LAYERS layers on GPU)"
    docker run -d \\
        --name "$CONTAINER_NAME" \\
        --restart unless-stopped \\
        --gpus all \\
        -p $PORT:8080 \\
        -v "$MODEL_DIR:/models" \\
        ghcr.io/ggml-org/llama.cpp:server-cuda \\
        --model "/models/$(basename $MODEL_FILE)" \\
        --host 0.0.0.0 \\
        --port 8080 \\
        --threads $CPU_THREADS \\
        --ctx-size $CTX_SIZE \\
        --n-gpu-layers $GPU_LAYERS
else
    echo "[INFO] Running in CPU-only mode"
    docker run -d \\
        --name "$CONTAINER_NAME" \\
        --restart unless-stopped \\
        -p $PORT:8080 \\
        -v "$MODEL_DIR:/models" \\
        ghcr.io/ggml-org/llama.cpp:server \\
        --model "/models/$(basename $MODEL_FILE)" \\
        --host 0.0.0.0 \\
        --port 8080 \\
        --threads $CPU_THREADS \\
        --ctx-size $CTX_SIZE
fi

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "  Container: $CONTAINER_NAME"
echo "  Port: $PORT"
echo "  Model: $(basename $MODEL_FILE)"
echo "  GPU Layers: $GPU_LAYERS"
echo ""
echo "  Test with: curl http://localhost:$PORT/health"
echo ""
echo "  Make sure port $PORT is open in your firewall!"
echo "============================================"
`;

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=setup-llama.sh");
  res.send(script);
});

export default router;
