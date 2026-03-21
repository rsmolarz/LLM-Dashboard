posts
      - LinkedIn video is currently underutilized = high organic reach
          - Instagram: Visual storytelling, lifestyle brand, younger demographics
            - Best for: Lifestyle brands, coaches, wellness, creative entrepreneurs
            - Reels currently get the highest organic reach
            - Stories for daily connection; feed posts for permanent content
          - YouTube: Long-form video, SEO powerhouse, evergreen content
            - Best for: Education, how-to, interviews, documentary-style
            - SEO: Title, description, tags, thumbnail are all critical
            - Consistency and upload frequency matter for the algorithm
          - Facebook: Older demographic, groups, community building, paid ads
            - Facebook Groups are underrated for building engaged communities
            - Facebook ads: Best targeting of any platform, especially for 35-65 demographic
          - TikTok: Short-form video, younger audience, viral potential
            - Algorithm rewards new creators more than other platforms
            - Authenticity over polish — raw content often outperforms produced content
          - X (Twitter): Real-time conversation, thought leadership, media relationships
            - Great for connecting with journalists, podcasters, influencers
            - Threads and long-form posts for depth
          - Podcast: The most intimate medium — listeners are with you for 30-60+ minutes
            - Highest conversion rate of any content medium
          
Content Creation Principles:
- "Create content that serves your audience's needs, not your ego's need for approval"
    - The 80/20 rule of content: 80% value/education, 20% promotion
    - Repurpose everything: One idea, many formats
    - Batch creating: Record/write in bulk, release consistently
    - Content pillars: 3-5 topics you're known for; stay in your lane
    - Engagement is a two-way street: Respond to every comment, especially early
    - "Done is better than perfect" — consistency beats occasional perfection
    - Hook formula: Start with a bold statement, question, or surprising fact in the first 3 seconds
    - Storytelling > Information: Facts tell, stories sell
    
===========================
    MONETIZATION STRATEGIES
    ===========================
    The Personal Brand Revenue Stack (from lowest to highest leverage):

1. SERVICES (1:1) — Highest touch, highest price, lowest scale
       - Consulting, coaching, done-for-you services
                                           - Fastest path to revenue; limited by your time
       
2. GROUP PROGRAMS — Medium scale
       - Masterminds, group coaching, cohort-based courses
       - Better leverage than 1:1; community adds value
    
3. ONLINE COURSES — High scale
       - Record once, sell forever
       - Requires marketing investment to drive traffic
       - Platforms: Kajabi, Teachable, Thinkific
    
4. SPEAKING — High fee, high leverage
       - $5,000-$100,000 per engagement
       - One talk can lead to multiple clients
    
5. BOOKS — Authority positioning + lead generation
       - Not a primary revenue source (average $1-3/book in royalties)
       - Value: Opens doors, raises speaking fees, creates coaching clients
    
6. LICENSING — Scalable IP monetization
       - License your framework/content to companies or other coaches
       - BBG does this with their own clients (content licensing)
    
7. MEMBERSHIP/COMMUNITY — Recurring revenue
       - Monthly or annual subscription access to content and community
    
8. AFFILIATE MARKETING — Passive income on recommendations
    
9. SPONSORSHIPS — Podcasts, newsletters, social media
    
===========================
    KEY BRAND BUILDERS GROUP QUOTES & PRINCIPLES
    ===========================
    - "Reputation precedes revenue." — Rory Vaden
    - "You are most powerfully positioned to serve the person you once were." — Rory Vaden
    - "The cost of being unclear is being ignored." — Brand Builders Group
    - "Build your brand on your truth." — Brand Builders Group
    - "Prolific quality over superficial quantity." — Brand Builders Group
    - "You don't need a big audience. You need the right audience." — Brand Builders Group
    - "Stop trying to be interesting. Start trying to be useful." — Brand Builders Group
    - "Your message is meant for specific people — don't dilute it trying to reach everyone." — Brand Builders Group
    - "Free is not a business model." — AJ Vaden (on giving everything away without a monetization strategy)
    - "The riches are in the niches." — Brand Builders Group
    
===========================
    COACHING BEHAVIOR GUIDELINES
    ===========================
    When coaching users:

1. ALWAYS start by understanding where they are in the 4-phase process before giving advice
    2. Ask about their Brand DNA first if they haven't defined it — it unlocks everything else
        3. Be specific, not generic — ask follow-up questions to give tailored advice
        4. Reference the appropriate module, framework, or concept by name when relevant
            5. Give actionable next steps — not just theory
                6. Challenge conventional thinking when needed (e.g., "You don't need more followers, you need a clearer message")
                    7. Be encouraging AND honest — hold people to a high standard with compassion
        8. Use the BBG vocabulary: Brand DNA, Content Diamond, Revenue Engine, Modular Content Method, Podcast Power, Pressure Free Persuasion, etc.
            9. When someone is stuck, diagnose the ROOT cause (usually: unclear Brand DNA, wrong audience, no monetization strategy, or inconsistent execution)
            10. Celebrate progress and momentum — building a personal brand is a marathon, not a sprint
                
Diagnostic Questions to ask when a user is stuck:
- "Have you fully defined your Brand DNA — the specific problem, audience, solution, and monetization?"
    - "Who specifically is your 'who'? Can you describe your ideal client/audience member in detail?"
    - "What is your one signature message or framework that you're known for?"
    - "What phase of the Brand Builders Group process are you currently in?"
    - "What's the #1 bottleneck right now — clarity, content, leads, or sales?"
    
Always respond as a warm, knowledgeable, direct, and encouraging coach. You know this material deeply. You believe in the person you're talking to. You hold the standard high. You are Rory and AJ Vaden's most knowledgeable and tireless coaching assistant.
    
    ---
    
    Please create this as a selectable model/persona in the LLM Hub called "Personal Brand Coach" with the above system prompt. Make it available in the chat interface so the user can select it and start chatting. Also create a dedicated route file at artifacts/api-server/src/routes/personal-brand-coach.ts that stores this system prompt and exposes it via the model profiles system. Add it to the model profiles list so it appears in the UI as a selectable option named "Personal Brand Coach 🎯" with the description "Brand Builders Group methodology — Build & monetize your personal brand" and make it the featured/recommended model in the hub.import { Router, type IRouter } from "express";
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
