import { Router, type IRouter, type Request } from "express";
import { db, llmConfigTable } from "@workspace/db";

const router: IRouter = Router();

async function getOllamaUrl(): Promise<string | null> {
  const [config] = await db.select().from(llmConfigTable).limit(1);
  return config?.serverUrl ?? null;
}

const DOMAIN_PRESETS = {
  medical: {
    label: "Medical / ENT",
    icon: "stethoscope",
    generation: [
      {
        id: "audiogram-diagram",
        label: "Audiogram Educational Diagram",
        prompt: "Create a clean, professional medical audiogram chart diagram showing frequency (250Hz-8000Hz) on x-axis and hearing level (dB) on y-axis, with labeled zones for normal hearing, mild, moderate, severe, and profound hearing loss. Use medical blue and red colors for left/right ears. Professional medical illustration style.",
      },
      {
        id: "ent-anatomy",
        label: "ENT Anatomy Illustration",
        prompt: "Create a detailed, labeled anatomical cross-section illustration of the human ear showing the outer ear, ear canal, tympanic membrane, middle ear ossicles (malleus, incus, stapes), cochlea, and auditory nerve. Professional medical textbook illustration style with clean labels.",
      },
      {
        id: "sinus-diagram",
        label: "Paranasal Sinus Diagram",
        prompt: "Create a professional medical illustration showing a frontal view of the paranasal sinuses: frontal, ethmoid, maxillary, and sphenoid sinuses. Clean anatomical diagram style with color-coded labels. Medical education quality.",
      },
      {
        id: "patient-education",
        label: "Patient Education Card",
        prompt: "Create a clean, patient-friendly infographic about ear infection (otitis media) prevention. Include simple icons showing: wash hands, avoid smoke exposure, breastfeeding benefits, vaccination. Warm, approachable medical design with large readable text.",
      },
    ],
    analysis: [
      {
        id: "audiogram-read",
        label: "Read Audiogram",
        prompt: "Analyze this audiogram image. Identify: 1) Type of hearing loss (conductive, sensorineural, or mixed) for each ear, 2) Degree of hearing loss (normal/mild/moderate/severe/profound) at each frequency, 3) Air-bone gap if visible, 4) Recommended next steps. Use standard audiological terminology.",
      },
      {
        id: "scope-analysis",
        label: "Scope Image Analysis",
        prompt: "Analyze this endoscopy/otoscopy/laryngoscopy image. Describe: 1) What anatomical structures are visible, 2) Any abnormal findings (inflammation, masses, fluid, perforation, etc.), 3) Possible differential diagnoses based on visual findings, 4) Recommended additional workup. Note: This is for educational purposes only, not a clinical diagnosis.",
      },
      {
        id: "ct-scan-review",
        label: "CT/Imaging Review",
        prompt: "Review this CT scan or medical imaging. Describe: 1) The anatomical region and view, 2) Normal structures visible, 3) Any abnormal findings (opacification, masses, deviation, erosion), 4) Radiological impression. Note: AI analysis for educational purposes only.",
      },
    ],
  },
  finance: {
    label: "Finance / Hedge Fund",
    icon: "trending-up",
    generation: [
      {
        id: "market-chart",
        label: "Market Analysis Chart",
        prompt: "Create a professional financial market analysis chart showing candlestick patterns with volume bars below, moving averages (20, 50, 200 day), RSI indicator panel, and MACD panel. Dark theme with green/red candles. Bloomberg terminal aesthetic.",
      },
      {
        id: "portfolio-allocation",
        label: "Portfolio Allocation Visual",
        prompt: "Create an elegant portfolio allocation visualization showing a modern donut chart with asset classes: US Equities (40%), International Equities (20%), Fixed Income (25%), Alternatives (10%), Cash (5%). Professional dark theme with gradient colors. Include risk-return labels.",
      },
      {
        id: "financial-infographic",
        label: "Financial Report Infographic",
        prompt: "Create a professional quarterly earnings infographic with sections for: Revenue growth trend, EPS comparison, margin analysis, and key metrics dashboard. Modern corporate design with clean data visualization elements. Dark blue and gold color scheme.",
      },
      {
        id: "risk-dashboard",
        label: "Risk Dashboard Visual",
        prompt: "Create a sophisticated risk management dashboard showing: VaR heat map, correlation matrix, drawdown chart, and Sharpe ratio gauge. Hedge fund presentation quality. Dark theme with neon accent colors.",
      },
    ],
    analysis: [
      {
        id: "chart-analysis",
        label: "Technical Chart Analysis",
        prompt: "Analyze this financial chart image. Identify: 1) Chart type and timeframe, 2) Key support and resistance levels, 3) Technical patterns (head & shoulders, triangles, channels, etc.), 4) Indicator readings if visible (RSI, MACD, moving averages), 5) Potential trade setup with entry, stop-loss, and target. Include risk-reward ratio.",
      },
      {
        id: "financial-doc",
        label: "Financial Document Analysis",
        prompt: "Analyze this financial document/statement image. Extract: 1) Key financial metrics (revenue, net income, margins), 2) Year-over-year changes, 3) Notable line items, 4) Red flags or concerns, 5) Overall financial health assessment.",
      },
    ],
  },
  social: {
    label: "Social Media",
    icon: "share-2",
    generation: [
      {
        id: "instagram-post",
        label: "Instagram Post Graphic",
        prompt: "Create a visually stunning Instagram post graphic (square format) with modern gradient background, bold typography for a motivational quote, and subtle geometric design elements. Trending aesthetic with vibrant colors. Include space for caption overlay.",
      },
      {
        id: "youtube-thumbnail",
        label: "YouTube Thumbnail",
        prompt: "Create an eye-catching YouTube thumbnail with bold, large text, dramatic lighting, high contrast colors, and visual elements that create curiosity. 16:9 format. Include an expressive face placeholder area and bold contrasting text area. Click-bait style but professional.",
      },
      {
        id: "story-template",
        label: "Story Template",
        prompt: "Create a sleek Instagram/TikTok story template (9:16 vertical) with modern glassmorphism design, gradient background, space for photo/video overlay, and text placement areas for headline and CTA. Trendy 2024 social media aesthetic.",
      },
      {
        id: "carousel-cover",
        label: "Carousel Slide Cover",
        prompt: "Create a professional carousel post cover slide with bold title text, clean design, brand-friendly colors (choose modern palette), and a 'Swipe →' indicator. Square format. Professional content creator style.",
      },
    ],
    analysis: [
      {
        id: "post-analysis",
        label: "Post Performance Analysis",
        prompt: "Analyze this social media post/screenshot. Evaluate: 1) Visual composition and appeal, 2) Text readability and hook strength, 3) Brand consistency, 4) Estimated engagement potential, 5) Specific improvements for better reach and engagement. Suggest A/B test variations.",
      },
      {
        id: "competitor-analysis",
        label: "Competitor Content Analysis",
        prompt: "Analyze this competitor's social media content/screenshot. Identify: 1) Content strategy patterns, 2) Visual style and branding elements, 3) Engagement tactics used, 4) Strengths to learn from, 5) Gaps and opportunities to differentiate.",
      },
    ],
  },
  realestate: {
    label: "Real Estate",
    icon: "home",
    generation: [
      {
        id: "listing-hero",
        label: "Property Listing Hero Image",
        prompt: "Create a stunning real estate listing hero image showing a modern luxury home with manicured landscaping, warm lighting at golden hour, blue sky with clouds. Professional real estate photography style. Aspirational and inviting.",
      },
      {
        id: "virtual-staging",
        label: "Virtual Staging Concept",
        prompt: "Create a beautifully staged modern living room interior with contemporary furniture, warm lighting, hardwood floors, neutral walls, and tasteful decor. Real estate virtual staging quality. Bright, airy, and welcoming. Professional interior photography style.",
      },
      {
        id: "market-report",
        label: "Market Report Graphic",
        prompt: "Create a professional real estate market report infographic with sections for: median home price trend, days on market, inventory levels, and price per square foot comparison. Clean, modern design with real estate branding colors (navy, gold, white).",
      },
      {
        id: "floorplan-style",
        label: "Floor Plan Illustration",
        prompt: "Create a clean, modern 2D floor plan illustration of a 3-bedroom, 2-bathroom home showing living room, kitchen, dining area, master suite, and two additional bedrooms. Include furniture placement. Professional architectural rendering style with measurements.",
      },
    ],
    analysis: [
      {
        id: "property-analysis",
        label: "Property Photo Analysis",
        prompt: "Analyze this property photo. Assess: 1) Property condition (exterior/interior), 2) Estimated age and architectural style, 3) Visible upgrades or needed repairs, 4) Curb appeal rating (1-10), 5) Staging suggestions for listing, 6) Potential red flags for buyers/investors.",
      },
      {
        id: "comp-analysis",
        label: "Comparable Property Analysis",
        prompt: "Analyze this property listing/photo for comparable analysis. Identify: 1) Property type and approximate square footage, 2) Key features visible, 3) Condition assessment, 4) Neighborhood characteristics visible, 5) How this compares to typical market listings.",
      },
    ],
  },
};

router.get("/media/presets", async (_req, res): Promise<void> => {
  res.json(DOMAIN_PRESETS);
});

router.get("/media/vision-models", async (_req, res): Promise<void> => {
  const serverUrl = await getOllamaUrl();
  if (!serverUrl) {
    res.json({ available: false, models: [] });
    return;
  }

  try {
    const tagsRes = await fetch(`${serverUrl}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!tagsRes.ok) {
      res.json({ available: false, models: [] });
      return;
    }
    const data = (await tagsRes.json()) as any;
    const allModels = (data.models || []).map((m: any) => m.name);
    const visionModels = allModels.filter(
      (m: string) =>
        m.includes("llava") ||
        m.includes("vision") ||
        m.includes("bakllava") ||
        m.includes("moondream")
    );

    res.json({
      available: visionModels.length > 0,
      models: visionModels,
      allModels,
    });
  } catch {
    res.json({ available: false, models: [] });
  }
});

router.post("/media/generate-image", async (req, res): Promise<void> => {
  const { prompt, size } = req.body as {
    prompt?: string;
    size?: "1024x1024" | "512x512" | "256x256";
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  try {
    const { generateImageBuffer } = await import(
      "@workspace/integrations-openai-ai-server/image"
    );
    const buffer = await generateImageBuffer(prompt, size || "1024x1024");
    const b64 = buffer.toString("base64");

    res.json({
      success: true,
      image: `data:image/png;base64,${b64}`,
      prompt,
      size: size || "1024x1024",
    });
  } catch (err: any) {
    res.status(500).json({
      error: `Image generation failed: ${err?.message ?? "Unknown error"}`,
    });
  }
});

router.post("/media/analyze-image", async (req, res): Promise<void> => {
  const { image, prompt, model } = req.body as {
    image?: string;
    prompt?: string;
    model?: string;
  };

  if (!image) {
    res.status(400).json({ error: "image (base64 data URL) is required" });
    return;
  }

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const serverUrl = await getOllamaUrl();
  if (!serverUrl) {
    res.status(503).json({ error: "Ollama server not configured" });
    return;
  }

  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

  const maxBytes = 15 * 1024 * 1024;
  if (base64Data.length * 0.75 > maxBytes) {
    res.status(413).json({ error: "Image too large. Maximum size is 15MB." });
    return;
  }

  const visionModel = model || "llava:13b";

  try {
    const ollamaRes = await fetch(`${serverUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: "user",
            content: prompt,
            images: [base64Data],
          },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(180000),
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      res.status(502).json({
        error: `Vision model failed: ${text}`,
      });
      return;
    }

    const data = (await ollamaRes.json()) as any;
    const analysis = data.message?.content ?? "";

    res.json({
      success: true,
      analysis,
      model: visionModel,
      promptUsed: prompt,
    });
  } catch (err: any) {
    res.status(500).json({
      error: `Vision analysis failed: ${err?.message ?? "Unknown error"}`,
    });
  }
});

export default router;
