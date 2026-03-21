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
echo "  Ollama + OpenWebUI Docker Setup Script"
echo "============================================"
echo ""

OLLAMA_PORT=${config.port}
WEBUI_PORT=3000

# Update system
echo "[1/6] Updating system..."
sudo apt update && sudo apt upgrade -y

# Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    sudo apt install docker.io docker-compose -y
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "[INFO] Docker installed successfully."
else
    echo "[INFO] Docker already installed."
fi

# Detect NVIDIA GPU
echo "[3/6] Detecting GPU..."
HAS_GPU=false
if command -v nvidia-smi &> /dev/null; then
    echo "[INFO] NVIDIA GPU detected!"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    HAS_GPU=true

    # Install NVIDIA Container Toolkit if not present
    if ! dpkg -l | grep -q nvidia-container-toolkit; then
        echo "[INFO] Installing NVIDIA Container Toolkit..."
        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
        curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \\
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \\
            sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
        sudo apt update
        sudo apt install -y nvidia-container-toolkit
        sudo nvidia-ctk runtime configure --runtime=docker
        sudo systemctl restart docker
        echo "[INFO] NVIDIA Container Toolkit installed."
    fi
else
    echo "[INFO] No NVIDIA GPU detected. Running CPU-only mode."
fi

# Stop existing containers if running
echo "[4/6] Cleaning up old containers..."
docker stop ollama 2>/dev/null || true
docker rm ollama 2>/dev/null || true
docker stop openwebui 2>/dev/null || true
docker rm openwebui 2>/dev/null || true

# Launch Ollama
echo "[5/6] Starting Ollama server..."
if [ "$HAS_GPU" = true ]; then
    echo "[INFO] Running Ollama with GPU acceleration..."
    docker run -d \\
        --name ollama \\
        --restart unless-stopped \\
        --gpus all \\
        -p $OLLAMA_PORT:11434 \\
        -v ollama:/root/.ollama \\
        ollama/ollama
else
    echo "[INFO] Running Ollama in CPU-only mode..."
    docker run -d \\
        --name ollama \\
        --restart unless-stopped \\
        -p $OLLAMA_PORT:11434 \\
        -v ollama:/root/.ollama \\
        ollama/ollama
fi

# Wait for Ollama to start
echo "[INFO] Waiting for Ollama to start..."
sleep 5

# Pull default models
echo "[INFO] Pulling recommended models..."
docker exec ollama ollama pull llama3
docker exec ollama ollama pull mistral
docker exec ollama ollama pull deepseek-coder

# Launch OpenWebUI
echo "[6/6] Starting OpenWebUI (ChatGPT-style interface)..."
docker run -d \\
    --name openwebui \\
    --restart unless-stopped \\
    -p $WEBUI_PORT:8080 \\
    -v open-webui:/app/backend/data \\
    -e OLLAMA_BASE_URL=http://host.docker.internal:$OLLAMA_PORT \\
    --add-host=host.docker.internal:host-gateway \\
    ghcr.io/open-webui/open-webui:main

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "  Ollama API:    http://YOUR-VPS-IP:$OLLAMA_PORT"
echo "  OpenWebUI:     http://YOUR-VPS-IP:$WEBUI_PORT"
echo "  GPU Enabled:   $HAS_GPU"
echo ""
echo "  Models installed:"
echo "    - llama3     (general reasoning)"
echo "    - mistral    (fast, efficient)"
echo "    - deepseek-coder (coding)"
echo ""
echo "  Test with:"
echo "    curl http://localhost:$OLLAMA_PORT/api/tags"
echo ""
echo "  IMPORTANT: Open these ports in your firewall:"
echo "    sudo ufw allow $OLLAMA_PORT"
echo "    sudo ufw allow $WEBUI_PORT"
echo ""
echo "  For security, restrict to your IP only:"
echo "    sudo ufw allow from YOUR_IP to any port $OLLAMA_PORT"
echo "============================================"
`;

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=setup-ollama.sh");
  res.send(script);
});

export default router;
