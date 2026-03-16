import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Image,
  Eye,
  Upload,
  Loader2,
  Download,
  Stethoscope,
  TrendingUp,
  Share2,
  Home,
  Wand2,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "generate" | "analyze";
type Domain = "medical" | "finance" | "social" | "realestate";

interface Preset {
  id: string;
  label: string;
  prompt: string;
}

interface DomainPresets {
  label: string;
  icon: string;
  generation: Preset[];
  analysis: Preset[];
}

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

const DOMAIN_ICONS: Record<string, React.ElementType> = {
  stethoscope: Stethoscope,
  "trending-up": TrendingUp,
  "share-2": Share2,
  home: Home,
};

const DOMAIN_COLORS: Record<Domain, string> = {
  medical: "cyan",
  finance: "emerald",
  social: "pink",
  realestate: "amber",
};

export default function Vision() {
  const [tab, setTab] = useState<Tab>("generate");
  const [domain, setDomain] = useState<Domain>("medical");
  const [prompt, setPrompt] = useState("");
  const [imageSize, setImageSize] = useState<"1024x1024" | "512x512" | "256x256">("1024x1024");
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisModel, setAnalysisModel] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: presets } = useQuery<Record<Domain, DomainPresets>>({
    queryKey: ["/api/media/presets"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/media/presets`);
      return res.json();
    },
  });

  const { data: visionInfo } = useQuery({
    queryKey: ["/api/media/vision-models"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/media/vision-models`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const currentPresets = presets?.[domain];
  const domainColor = DOMAIN_COLORS[domain];

  const generateImage = useCallback(async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setGenError(null);
    setGeneratedImage(null);

    try {
      const res = await fetch(`${API_BASE}/media/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size: imageSize }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setGeneratedImage(data.image);
    } catch (err: any) {
      setGenError(err?.message ?? "Unknown error");
    } finally {
      setGenerating(false);
    }
  }, [prompt, imageSize]);

  const analyzeImage = useCallback(async () => {
    if (!uploadedImage || !analysisPrompt.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const res = await fetch(`${API_BASE}/media/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: uploadedImage,
          prompt: analysisPrompt,
          model: analysisModel || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAnalysisResult(data.analysis);
    } catch (err: any) {
      setAnalysisError(err?.message ?? "Unknown error");
    } finally {
      setAnalyzing(false);
    }
  }, [uploadedImage, analysisPrompt, analysisModel]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedImage(ev.target?.result as string);
      setAnalysisResult(null);
      setAnalysisError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const downloadImage = useCallback(() => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `generated-${Date.now()}.png`;
    link.click();
  }, [generatedImage]);

  const applyPreset = useCallback((preset: Preset) => {
    if (tab === "generate") {
      setPrompt(preset.prompt);
    } else {
      setAnalysisPrompt(preset.prompt);
    }
  }, [tab]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-3xl font-display font-bold text-white mb-2">
          Vision Studio
        </h1>
        <p className="text-muted-foreground text-sm mb-5">
          Generate images with AI or analyze images with vision models across specialized domains.
        </p>

        <div className="flex gap-3 mb-5">
          <button
            onClick={() => setTab("generate")}
            className={cn(
              "flex-1 p-4 rounded-xl border transition-all text-left",
              tab === "generate"
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Wand2 className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-white text-sm">Generate Images</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Create images with GPT-Image-1 using domain presets
            </p>
          </button>

          <button
            onClick={() => setTab("analyze")}
            className={cn(
              "flex-1 p-4 rounded-xl border transition-all text-left",
              tab === "analyze"
                ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-white text-sm">Analyze Images</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload images for AI vision analysis (audiograms, scopes, charts, photos)
            </p>
          </button>
        </div>

        <div className="flex gap-2 mb-5">
          {(Object.keys(DOMAIN_COLORS) as Domain[]).map((d) => {
            const dp = presets?.[d];
            const IconComp = DOMAIN_ICONS[dp?.icon || ""] || Sparkles;
            return (
              <button
                key={d}
                onClick={() => setDomain(d)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all border",
                  domain === d
                    ? `border-${domainColor}-500/40 bg-${domainColor}-500/10 text-white`
                    : "border-white/10 bg-white/5 text-muted-foreground hover:text-white hover:bg-white/10"
                )}
                style={
                  domain === d
                    ? {
                        borderColor: `var(--domain-${d})`,
                        backgroundColor: `color-mix(in srgb, var(--domain-${d}) 10%, transparent)`,
                      }
                    : {}
                }
              >
                <IconComp className="w-3.5 h-3.5" />
                {dp?.label || d}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 p-6 pt-0 flex gap-6">
        <div className="w-72 shrink-0">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            {tab === "generate" ? "Generation" : "Analysis"} Presets
          </h3>
          <div className="space-y-2">
            {(tab === "generate"
              ? currentPresets?.generation
              : currentPresets?.analysis
            )?.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="w-full text-left p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <p className="text-xs font-medium text-white">{preset.label}</p>
                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                  {preset.prompt.slice(0, 80)}...
                </p>
              </button>
            ))}
          </div>

          {tab === "analyze" && (
            <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-xs font-medium text-white mb-2">Vision Model</p>
              {visionInfo?.available ? (
                <div className="space-y-1.5">
                  {visionInfo.models.map((m: string) => (
                    <button
                      key={m}
                      onClick={() => setAnalysisModel(m)}
                      className={cn(
                        "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all",
                        (analysisModel || visionInfo.models[0]) === m
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "text-muted-foreground hover:text-white hover:bg-white/5"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>No vision models found. Pull llava:13b to enable.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {tab === "generate" ? (
            <div className="space-y-4">
              <div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to generate..."
                  className="w-full h-32 p-4 rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      generateImage();
                    }
                  }}
                />
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value as any)}
                  className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-primary/50"
                >
                  <option value="1024x1024">1024×1024</option>
                  <option value="512x512">512×512</option>
                  <option value="256x256">256×256</option>
                </select>

                <Button
                  onClick={generateImage}
                  disabled={!prompt.trim() || generating}
                  className="gap-2"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  {generating ? "Generating..." : "Generate Image"}
                </Button>

                <span className="text-xs text-muted-foreground">
                  Ctrl+Enter to generate · Uses Replit credits
                </span>
              </div>

              {genError && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {genError}
                </div>
              )}

              {generatedImage && (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                    <img
                      src={generatedImage}
                      alt="Generated"
                      className="w-full max-h-[500px] object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={downloadImage} variant="outline" size="sm" className="gap-2">
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {imageSize} · GPT-Image-1
                    </span>
                  </div>
                </div>
              )}

              {!generating && !generatedImage && !genError && (
                <div className="flex items-center justify-center p-12">
                  <div className="text-center max-w-sm">
                    <Image className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">
                      AI Image Generation
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Select a domain preset or write your own prompt to generate images.
                      Powered by GPT-Image-1 for high-quality results across medical, financial,
                      social media, and real estate domains.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />

              {!uploadedImage ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-48 rounded-xl border-2 border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/30 transition-all flex flex-col items-center justify-center gap-3"
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">Upload Image for Analysis</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Audiograms, scope images, CT scans, charts, property photos, social media posts
                    </p>
                  </div>
                </button>
              ) : (
                <div className="relative">
                  <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                    <img
                      src={uploadedImage}
                      alt={uploadedFileName}
                      className="w-full max-h-72 object-contain"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setUploadedImage(null);
                      setUploadedFileName("");
                      setAnalysisResult(null);
                      setAnalysisError(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/60 text-xs text-white">
                    {uploadedFileName}
                  </div>
                </div>
              )}

              <div>
                <textarea
                  value={analysisPrompt}
                  onChange={(e) => setAnalysisPrompt(e.target.value)}
                  placeholder="What would you like to know about this image? Or select an analysis preset..."
                  className="w-full h-24 p-4 rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      analyzeImage();
                    }
                  }}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploadedImage ? "Change Image" : "Upload"}
                </Button>

                <Button
                  onClick={analyzeImage}
                  disabled={!uploadedImage || !analysisPrompt.trim() || analyzing}
                  className="gap-2"
                  variant="glow"
                >
                  {analyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  {analyzing ? "Analyzing..." : "Analyze Image"}
                </Button>

                <span className="text-xs text-muted-foreground">
                  Ctrl+Enter to analyze · Free (runs on VPS)
                </span>
              </div>

              {analysisError && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {analysisError}
                </div>
              )}

              {analysisResult && (
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-5 h-5 text-purple-400" />
                    <h3 className="text-sm font-semibold text-white">Vision Analysis</h3>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans leading-relaxed">
                      {analysisResult}
                    </pre>
                  </div>
                </div>
              )}

              {!analyzing && !analysisResult && !analysisError && !uploadedImage && (
                <div className="flex items-center justify-center p-8">
                  <div className="text-center max-w-sm">
                    <Eye className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">
                      AI Vision Analysis
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Upload an image and select a domain-specific analysis preset.
                      The vision model reads audiograms, scope images, financial charts,
                      property photos, and more.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
