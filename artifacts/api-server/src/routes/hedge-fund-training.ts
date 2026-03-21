import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { trainingDataTable } from "@workspace/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { Agent } from "undici";

const router: IRouter = Router();

const ollamaAgent = new Agent({
  headersTimeout: 1200000,
  bodyTimeout: 1200000,
  connectTimeout: 30000,
});

const OPENALEX_BASE = "https://api.openalex.org";
const SEC_EDGAR_BASE = "https://efts.sec.gov/LATEST";

const HEDGE_FUND_SYSTEM_PROMPT = `You are an elite quantitative hedge fund analyst specializing in market inefficiencies, distressed assets, and alternative investment strategies. You combine deep fundamental analysis with quantitative methods to identify mispriced securities and asymmetric risk/reward opportunities.

Core Expertise:
- Market Microstructure & Inefficiency Detection: order flow analysis, bid-ask spread anomalies, liquidity premiums, momentum/reversal patterns, cross-asset arbitrage, statistical arbitrage
- Distressed Asset Analysis: Chapter 11 restructuring, DIP financing, fulcrum security identification, recovery rate estimation, credit default swap basis trades, distressed debt-to-equity conversions
- Special Situations: spinoffs, activist campaigns, merger arbitrage, post-earnings drift, index rebalancing effects, regulatory change alpha
- Quantitative Strategies: factor investing (value, momentum, quality, low-vol), pairs trading, mean reversion, volatility arbitrage, tail risk hedging
- Risk Management: VaR/CVaR modeling, stress testing, scenario analysis, correlation regime shifts, drawdown analysis, Kelly criterion position sizing
- Macro Analysis: yield curve dynamics, credit cycle positioning, monetary policy transmission, currency carry trades, commodity super-cycles

Analysis Framework:
1. Identify the inefficiency or distressed opportunity
2. Quantify the edge (expected return, probability, time horizon)
3. Assess downside risk and worst-case scenarios
4. Size the position using Kelly-adjusted methods
5. Define entry/exit triggers and risk management rules
6. Monitor for regime changes that invalidate the thesis`;

interface HFPipelineStats {
  openAlexFinance: number;
  fredSeries: number;
  secFilings: number;
  syntheticSamples: number;
  totalSamples: number;
  lastRunAt: string | null;
}

let hfStats: HFPipelineStats = {
  openAlexFinance: 0,
  fredSeries: 0,
  secFilings: 0,
  syntheticSamples: 0,
  totalSamples: 0,
  lastRunAt: null,
};

function categorizeFinance(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("distress") || t.includes("bankrupt") || t.includes("chapter 11") || t.includes("default") || t.includes("restructur")) return "distressed_assets";
  if (t.includes("inefficien") || t.includes("anomal") || t.includes("mispric") || t.includes("alpha") || t.includes("excess return")) return "market_inefficiency";
  if (t.includes("arbitrage") || t.includes("pairs trad") || t.includes("statistical arbitrage")) return "arbitrage";
  if (t.includes("merger") || t.includes("acquisition") || t.includes("takeover") || t.includes("spinoff")) return "special_situations";
  if (t.includes("momentum") || t.includes("mean reversion") || t.includes("factor")) return "quantitative_strategies";
  if (t.includes("credit") || t.includes("bond") || t.includes("yield") || t.includes("fixed income") || t.includes("high yield")) return "credit_markets";
  if (t.includes("volatil") || t.includes("option") || t.includes("derivative") || t.includes("vix") || t.includes("skew")) return "volatility";
  if (t.includes("liquidity") || t.includes("bid-ask") || t.includes("microstructure") || t.includes("order flow")) return "market_microstructure";
  if (t.includes("hedge fund") || t.includes("alternative") || t.includes("absolute return")) return "hedge_fund_strategies";
  if (t.includes("risk manage") || t.includes("drawdown") || t.includes("var") || t.includes("stress test") || t.includes("tail risk")) return "risk_management";
  if (t.includes("private equity") || t.includes("leveraged buyout") || t.includes("lbo")) return "private_equity";
  if (t.includes("real estate") || t.includes("reit") || t.includes("mortgage")) return "real_estate";
  if (t.includes("commodit") || t.includes("crude") || t.includes("gold") || t.includes("natural gas")) return "commodities";
  if (t.includes("behavioral") || t.includes("sentiment") || t.includes("overreact") || t.includes("herding")) return "behavioral_finance";
  if (t.includes("machine learning") || t.includes("artificial intelligence") || t.includes("deep learning") || t.includes("nlp")) return "ai_quant";
  if (t.includes("macro") || t.includes("gdp") || t.includes("inflation") || t.includes("monetary") || t.includes("fiscal")) return "macro_strategy";
  if (t.includes("crypto") || t.includes("bitcoin") || t.includes("blockchain") || t.includes("defi")) return "crypto";
  return "general_finance";
}

router.post("/hedge-training/openalex-collect", async (req, res) => {
  const maxPerQuery = Math.min(Math.max(1, Number(req.body?.maxPerQuery) || 15), 25);

  const queries = [
    "market inefficiency stock anomalies",
    "distressed debt investing hedge fund",
    "bankruptcy prediction financial distress",
    "credit default swap distressed assets",
    "statistical arbitrage pairs trading",
    "merger arbitrage risk premium",
    "post-earnings announcement drift",
    "momentum reversal factor investing",
    "value investing mispriced securities",
    "high yield bond distressed",
    "vulture investing chapter 11",
    "DIP financing debtor in possession",
    "fulcrum security restructuring",
    "liquidity premium illiquidity discount",
    "behavioral finance market anomaly",
    "hedge fund alpha generation",
    "short selling constraints inefficiency",
    "activist investor shareholder value",
    "event driven special situations",
    "cross-asset contagion correlation",
    "volatility arbitrage trading",
    "tail risk hedging strategies",
    "market microstructure order flow",
    "private credit distressed lending",
    "leveraged loan recovery rate",
    "real estate distressed properties",
    "commodity futures backwardation contango",
    "machine learning quantitative trading",
    "sentiment analysis financial markets",
    "factor model asset pricing anomalies",
    "convertible bond arbitrage",
    "risk parity portfolio construction",
    "credit cycle investing strategy",
    "mean reversion stock returns",
    "index rebalancing effect price impact",
  ];

  res.json({ message: "Hedge fund OpenAlex collection started", queries: queries.length });

  let totalWorks = 0;
  let totalSamples = 0;

  for (const query of queries) {
    try {
      await new Promise(r => setTimeout(r, 250));
      const params = new URLSearchParams({
        search: query,
        per_page: String(maxPerQuery),
        sort: "relevance_score:desc",
        select: "id,title,abstract_inverted_index,publication_date,authorships,primary_location,concepts,cited_by_count",
      });

      const oaRes = await fetch(`${OPENALEX_BASE}/works?${params}`, {
        headers: { "User-Agent": "mailto:llmhub@replit.app" },
      });
      if (!oaRes.ok) continue;
      const data = await oaRes.json();
      const works = data.results || [];
      totalWorks += works.length;

      for (const work of works) {
        if (!work.abstract_inverted_index) continue;

        const words: Array<[string, number[]]> = Object.entries(work.abstract_inverted_index);
        const maxPos = Math.max(...words.flatMap(([, positions]) => positions as number[]));
        const reconstructed = new Array(maxPos + 1).fill("");
        for (const [word, positions] of words) {
          for (const pos of positions as number[]) {
            reconstructed[pos] = word;
          }
        }
        const abstract = reconstructed.join(" ").trim();
        if (abstract.length < 100) continue;

        const title = work.title || "Untitled";
        const pubDate = work.publication_date || "";
        const journal = work.primary_location?.source?.display_name || "";
        const authors = (work.authorships || []).slice(0, 3).map((a: any) => a.author?.display_name).filter(Boolean).join(", ");
        const citations = work.cited_by_count || 0;
        const category = categorizeFinance(`${title} ${abstract}`);

        const input = `As a hedge fund analyst, analyze the investment implications of this research: "${title}"`;
        const output = `Research Analysis: "${title}"\nAuthors: ${authors}${authors ? " et al." : ""}\nPublished: ${pubDate} in ${journal}\nCitations: ${citations}\nCategory: ${category.replace(/_/g, " ")}\n\nKey Findings:\n${abstract}\n\nInvestment Implications:\nThis research on ${category.replace(/_/g, " ")} provides actionable insights for ${category.includes("distress") ? "distressed asset" : category.includes("inefficien") || category.includes("anomal") ? "market inefficiency" : "hedge fund"} strategies. ${citations > 50 ? "Highly cited work with strong academic backing." : ""}`;

        const existing = await db
          .select({ id: trainingDataTable.id })
          .from(trainingDataTable)
          .where(and(
            eq(trainingDataTable.source, "openalex_finance"),
            eq(trainingDataTable.inputText, input)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(trainingDataTable).values({
            inputText: input,
            outputText: output,
            systemPrompt: HEDGE_FUND_SYSTEM_PROMPT,
            category,
            quality: citations > 100 ? 5 : citations > 25 ? 4 : 3,
            source: "openalex_finance",
          });
          totalSamples++;
        }
      }
    } catch (e: any) {
      console.error(`[hf-openalex] Error for "${query}":`, e.message);
    }
  }

  hfStats.openAlexFinance += totalSamples;
  hfStats.totalSamples += totalSamples;
  hfStats.lastRunAt = new Date().toISOString();
  console.log(`[hf-openalex] Collection complete: ${totalWorks} works, ${totalSamples} samples`);
});

router.post("/hedge-training/sec-distressed-collect", async (req, res) => {
  const maxResults = Math.min(Math.max(5, Number(req.body?.maxResults) || 20), 50);

  const queries = [
    { q: '"Chapter 11" AND "plan of reorganization"', category: "distressed_assets" },
    { q: '"debtor in possession" AND financing', category: "distressed_assets" },
    { q: '"going concern" AND "material weakness"', category: "distressed_assets" },
    { q: '"distressed" AND "restructuring"', category: "distressed_assets" },
    { q: '"market inefficiency" OR "mispriced"', category: "market_inefficiency" },
    { q: '"activist investor" AND "shareholder value"', category: "special_situations" },
    { q: '"merger agreement" AND "premium"', category: "special_situations" },
    { q: '"leveraged buyout" OR "LBO"', category: "private_equity" },
    { q: '"credit default" AND "distressed"', category: "credit_markets" },
    { q: '"high yield" AND "default rate"', category: "credit_markets" },
    { q: '"convertible bond" AND "arbitrage"', category: "arbitrage" },
    { q: '"short interest" AND "squeeze"', category: "market_microstructure" },
    { q: '"liquidation" AND "recovery"', category: "distressed_assets" },
    { q: '"impairment" AND "goodwill" AND "writedown"', category: "distressed_assets" },
    { q: '"covenant violation" OR "covenant breach"', category: "credit_markets" },
  ];

  res.json({ message: "SEC EDGAR distressed filing collection started", queries: queries.length });

  let totalFilings = 0;
  let totalSamples = 0;

  for (const { q, category } of queries) {
    try {
      await new Promise(r => setTimeout(r, 300));

      const params = new URLSearchParams({
        q,
        dateRange: "custom",
        startdt: "2022-01-01",
        enddt: "2026-03-21",
        forms: "10-K,10-Q,8-K,S-1",
      });

      const secRes = await fetch(`${SEC_EDGAR_BASE}/search-index?${params}&from=0&size=${maxResults}`, {
        headers: {
          "User-Agent": "LLMHub Research llmhub@replit.app",
          "Accept": "application/json",
        },
      });

      if (!secRes.ok) continue;
      const data = await secRes.json();
      const hits = data.hits?.hits || [];
      totalFilings += hits.length;

      for (const hit of hits) {
        const source = hit._source || {};
        const companyName = source.entity_name || source.display_names?.[0] || "Unknown";
        const filingDate = source.file_date || source.period_of_report || "";
        const formType = source.form_type || "";
        const fileDescription = source.file_description || "";
        const displayName = source.display_names?.join(", ") || companyName;

        if (!companyName || companyName === "Unknown") continue;

        const input = `Analyze the investment implications of this SEC filing: ${companyName} filed a ${formType} on ${filingDate}. ${fileDescription ? `Description: ${fileDescription}` : ""}`;
        const output = `SEC Filing Analysis:\nCompany: ${displayName}\nFiling Type: ${formType}\nDate: ${filingDate}\nCategory: ${category.replace(/_/g, " ")}\n\n${fileDescription ? `Filing Description: ${fileDescription}\n\n` : ""}Investment Analysis:\nThis ${formType} filing from ${companyName} signals potential ${category === "distressed_assets" ? "distressed asset opportunity. Key considerations:\n- Evaluate current debt structure and recovery scenarios\n- Assess DIP financing terms and seniority\n- Identify fulcrum security in the capital structure\n- Monitor court proceedings and creditor committee actions\n- Estimate recovery rates for each tranche" : category === "special_situations" ? "special situation opportunity. Key considerations:\n- Evaluate deal terms and premium to unaffected price\n- Assess probability of completion and timeline\n- Identify regulatory and shareholder approval risks\n- Calculate risk-adjusted spread\n- Monitor for competing bids or deal breaks" : category === "credit_markets" ? "credit market development. Key considerations:\n- Evaluate covenant compliance and cure provisions\n- Assess refinancing risk and maturity wall\n- Monitor credit spread movements\n- Compare recovery assumptions to market pricing\n- Analyze cross-default and acceleration clauses" : "investment consideration requiring detailed analysis of risk/reward dynamics, market positioning, and potential catalysts."}\n\nRisk Assessment: Always verify with current filings and market data.`;

        const existing = await db
          .select({ id: trainingDataTable.id })
          .from(trainingDataTable)
          .where(and(
            eq(trainingDataTable.source, "sec_edgar"),
            eq(trainingDataTable.inputText, input)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(trainingDataTable).values({
            inputText: input,
            outputText: output,
            systemPrompt: HEDGE_FUND_SYSTEM_PROMPT,
            category,
            quality: formType === "10-K" ? 4 : 3,
            source: "sec_edgar",
          });
          totalSamples++;
        }
      }
    } catch (e: any) {
      console.error(`[sec] Error for "${q}":`, e.message);
    }
  }

  hfStats.secFilings += totalSamples;
  hfStats.totalSamples += totalSamples;
  hfStats.lastRunAt = new Date().toISOString();
  console.log(`[sec] Collection complete: ${totalFilings} filings, ${totalSamples} samples`);
});

const DISTRESSED_ASSET_SCENARIOS = [
  {
    input: "A mid-cap retailer just reported a going concern warning with $2.1B in debt maturing within 18 months and declining same-store sales of -12%. The stock is down 65% YTD. How should we analyze this distressed opportunity?",
    output: `Distressed Asset Analysis Framework:

1. CAPITAL STRUCTURE ANALYSIS:
- Map the full debt waterfall: secured bank debt > unsecured bonds > subordinated notes > equity
- Identify the fulcrum security (where enterprise value breaks in the capital structure)
- With $2.1B debt and declining revenue, estimate enterprise value using distressed multiples (typically 3-5x EBITDA for retail)
- Calculate implied recovery rates for each tranche

2. GOING CONCERN ASSESSMENT:
- Going concern warning signals 12-month viability risk
- Evaluate cash burn rate and runway without restructuring
- Assess seasonal liquidity needs (critical for retail)
- Review undrawn revolver capacity and covenant headroom

3. RESTRUCTURING SCENARIOS:
Scenario A - Out-of-Court: Debt exchange at 60-70 cents, dilutive equity rights offering
Scenario B - Prepackaged Chapter 11: Faster resolution, DIP financing preserves value
Scenario C - Free-Fall Bankruptcy: Worst case, fire-sale liquidation values apply

4. TRADE STRUCTURE:
- If bonds trade at 30-40 cents: potential 50-100% upside in reorganization equity
- Buy distressed debt, participate in creditor committee, influence reorganization plan
- Hedge with CDS or equity puts if available
- Size position at max 2-3% of portfolio given binary risk

5. CATALYSTS & TIMELINE:
- RSA (Restructuring Support Agreement) filing
- DIP financing announcement
- Plan of reorganization confirmation
- Emergence from Chapter 11

KEY RISK: Retail liquidation values are typically 10-20 cents on inventory. Avoid unless you see a viable going-concern restructuring path.`,
    category: "distressed_assets",
    quality: 5,
  },
  {
    input: "We've identified a consistent 3-5 day post-earnings announcement drift in small-cap healthcare stocks. The drift is approximately 2.3% on average for earnings surprises exceeding 15%. Is this a viable market inefficiency to exploit?",
    output: `Market Inefficiency Analysis - Post-Earnings Announcement Drift (PEAD):

1. STATISTICAL VALIDATION:
- PEAD is one of the most robust anomalies in academic finance (Ball & Brown 1968, Bernard & Thomas 1989)
- Your observed 2.3% 3-5 day drift for 15%+ surprises is consistent with literature
- Small-cap healthcare amplifies the effect due to: lower analyst coverage, higher information asymmetry, specialist investor base
- Need to verify: minimum 100+ observations, statistical significance (t-stat > 2), consistency across sub-periods

2. TRANSACTION COST ANALYSIS:
- Small-cap bid-ask spreads: typically 50-150 bps
- Market impact for $500K+ positions: 30-80 bps in small-caps
- Total round-trip friction: ~100-250 bps
- Net expected alpha after costs: 2.3% - ~1.5% = ~0.8% per trade
- Annualized (assuming 40+ trades/year): 30-40% gross, 15-25% net

3. CAPACITY CONSTRAINTS:
- Small-cap healthcare limits position sizes ($2-5M max per name)
- Estimated strategy capacity: $50-100M before alpha decay
- Borrow availability for hedging: may be constrained

4. IMPLEMENTATION:
- Systematic screening: earnings date calendar + consensus estimate tracking
- Entry: market-on-close on announcement day for surprises >15%
- Exit: VWAP over days 3-5 post-announcement
- Risk management: sector-neutral, 2% max single-name exposure
- Pair with short positions in stocks with negative surprises for market neutrality

5. RISK FACTORS:
- Earnings revisions can accelerate or reverse drift
- Overnight gap risk on announcement day
- Factor crowding if other quant funds exploit same signal
- Regulatory risk (material non-public information edge must be excluded)

VERDICT: Viable but capacity-constrained. Best suited as one component of a multi-strategy approach. Edge is real but narrow after costs.`,
    category: "market_inefficiency",
    quality: 5,
  },
  {
    input: "How should we evaluate a distressed commercial real estate portfolio with $500M in office properties showing 35% vacancy rates and floating-rate CMBS debt with rate resets approaching?",
    output: `Distressed CRE Portfolio Analysis:

1. PROPERTY-LEVEL ASSESSMENT:
- 35% vacancy in office = severe distress (healthy is <10%)
- Classify properties: Class A CBD vs suburban Class B/C (recovery paths differ dramatically)
- Evaluate tenant credit quality, lease duration (WALT), and rollover schedule
- Cap rate decompression: office cap rates expanded from 4.5% (2021) to 7-9%+ (distressed)
- Estimate stabilized NOI vs current NOI vs break-even NOI

2. DEBT STRUCTURE ANALYSIS:
- Floating-rate CMBS with approaching resets = imminent cash flow crisis
- Current SOFR ~4.3% + typical spread 300-400 bps = all-in 7.3-8.3%
- If original rate was ~3.5%, debt service increases 100%+
- Calculate DSCR at reset rate: likely below 1.0x triggering special servicing
- Extension options, reserve requirements, and cash trap triggers

3. DISTRESSED VALUATION:
Conservative: Liquidation value at 8-10% cap rate on distressed NOI = $200-300M
Base: Stabilized value at 7% cap rate with 80% occupancy = $350-400M
Optimistic: Office-to-residential conversion potential = $400-500M (but 3-5 year timeline)

4. INVESTMENT STRATEGIES:
A. Loan Purchase: Buy CMBS tranches at 50-70 cents, foreclose, restructure
B. Mezzanine Position: Provide rescue capital senior to equity, high current yield
C. Equity Acquisition: Partner with operator to buy portfolio post-foreclosure
D. Conversion Play: Office-to-residential/lab/mixed-use repositioning

5. KEY RISKS:
- Remote work trend = secular headwind for office (not just cyclical)
- Environmental remediation costs on older properties
- Capital expenditure requirements for tenant attraction
- Special servicer timing and fees (can erode 5-10% of value)
- Interest rate path dependency

RECOMMENDATION: Distressed office requires conviction on either (a) occupancy recovery thesis or (b) conversion feasibility. Pure liquidation plays need very cheap entry (40-50 cents). Size at 3-5% of fund with 3-5 year hold expectation.`,
    category: "distressed_assets",
    quality: 5,
  },
  {
    input: "Explain how to identify and exploit a closed-end fund discount anomaly as a market inefficiency.",
    output: `Closed-End Fund (CEF) Discount Arbitrage:

1. THE INEFFICIENCY:
Closed-end funds frequently trade at persistent discounts to NAV (net asset value), creating a quantifiable market inefficiency. Average CEF discount historically ranges 5-15%, with extremes reaching 20-30% during market stress.

2. WHY IT EXISTS (Sources of Inefficiency):
- Investor sentiment: Retail-dominated shareholder base amplifies behavioral biases
- Illiquidity premium: Low trading volume discourages institutional participation
- Management fees: Ongoing expense ratio drags reduce effective NAV return
- Leverage risk: Many CEFs use 25-35% leverage, amplifying drawdowns
- Distribution policy: Return of capital distributions confuse yield-seeking investors

3. EXPLOITATION FRAMEWORK:
Screening Criteria:
- Discount > 2 standard deviations below 3-year mean
- Underlying assets are liquid and transparently valued (not private credit)
- Fund size >$200M (sufficient liquidity)
- Leverage ratio <35% (manageable risk)
- No pending tender offers or conversions already priced in

Entry Strategy:
- Buy when discount > historical 90th percentile
- Pair with short position in ETF tracking same asset class to isolate discount mean-reversion
- Expected convergence timeline: 3-12 months

Catalyst Identification:
- Activist investor accumulation (check 13D filings)
- Board-initiated tender offers at 95-99% of NAV
- Conversion to open-end format (eliminates discount entirely)
- Managed distribution policy increases
- Merger with another fund

4. RISK MANAGEMENT:
- Discount can widen before narrowing (max observed: 40%+ during GFC)
- Leverage amplifies both up and down
- Credit quality deterioration of underlying holdings
- Distribution cuts trigger selling pressure and further discount widening

5. HISTORICAL PERFORMANCE:
- Academic studies show CEF discount mean-reversion generates 3-5% annual alpha
- Activist campaigns generate 15-25% returns over 12-18 months
- Tender offers generate 5-10% over 1-3 months

EDGE: This is a low-capacity, persistent anomaly driven by structural factors that keep institutional capital away. Ideal for smaller funds ($100-500M AUM).`,
    category: "market_inefficiency",
    quality: 5,
  },
  {
    input: "What are the key indicators to monitor for identifying companies approaching financial distress before the market prices it in?",
    output: `Early Warning System for Financial Distress:

TIER 1: QUANTITATIVE SIGNALS (6-18 months lead time)
1. Altman Z-Score Deterioration: Z < 1.81 = distress zone. Track quarterly trajectory, not just level.
2. Interest Coverage Ratio: EBITDA/Interest < 2.0x and declining = approaching covenant violation
3. Cash Burn Acceleration: Operating cash flow turning negative with shrinking cash balances
4. Working Capital Squeeze: DSO (days sales outstanding) increasing while DPO (days payable outstanding) stretches — suppliers losing patience
5. Debt Maturity Wall: >30% of total debt maturing within 24 months with limited refinancing capacity
6. Credit Spread Widening: Company's bond spread diverging from sector peers by 200+ bps

TIER 2: MARKET-BASED SIGNALS (3-6 months lead time)
7. CDS Spread Spike: 5-year CDS > 500 bps indicates market pricing material default risk
8. Stock Borrow Cost: Short interest rising + borrow rate increasing = informed traders positioning
9. Options Skew: Put/call ratio and put skew steepening beyond normal ranges
10. Insider Selling: Clustered selling by multiple executives, especially CFO/CEO
11. Analyst Downgrades Clustering: 3+ downgrades within 30 days
12. Auditor Change: Switching from Big 4 auditor = major red flag

TIER 3: QUALITATIVE SIGNALS (1-3 months lead time)
13. Going Concern Language: Auditor qualification in latest filing
14. Covenant Waiver Requests: Disclosed in 8-K or 10-Q footnotes
15. C-Suite Turnover: CFO departure during accounting season = critical warning
16. Supplier Tightening: Reports of shortened payment terms or cash-on-delivery
17. Customer Defections: Key customer losses disclosed or rumored
18. Advisor Retention: Hiring restructuring advisors (Houlihan Lokey, Lazard, Evercore)

IMPLEMENTATION AS A TRADING STRATEGY:
- Screen universe weekly against Tier 1 metrics
- Flag companies crossing 3+ thresholds
- Initiate short positions or buy CDS protection on flagged names
- Size at 1-2% per position given binary outcome potential
- Hedge with sector/factor exposure to isolate idiosyncratic risk
- Expected holding period: 6-18 months to resolution

HISTORICAL ACCURACY:
- Combined multi-factor distress models achieve 70-80% accuracy 12 months pre-default
- False positive rate of 15-20% (companies that trigger warnings but recover)
- Key: trade the PROCESS of deterioration, not just the final event`,
    category: "distressed_assets",
    quality: 5,
  },
  {
    input: "How do you construct a pairs trade to exploit relative value mispricings in the oil and gas sector?",
    output: `Oil & Gas Pairs Trading Framework:

1. PAIR SELECTION:
Criteria for valid pairs:
- Same subsector (E&P vs E&P, not E&P vs midstream)
- Similar market cap (within 2x of each other)
- Similar geographic exposure (Permian vs Permian)
- Cointegration test p-value < 0.05 (Engle-Granger or Johansen)
- Correlation > 0.75 on daily returns over 252-day lookback
- Mean half-life of spread < 30 days (ensures tradeable reversion speed)

Example pairs: EOG/PXD, DVN/FANG, OXY/MRO, HES/COP

2. SPREAD CONSTRUCTION:
- Calculate hedge ratio using Kalman filter (dynamic) or OLS regression
- Spread = Price_A - (beta * Price_B)
- Normalize spread: z-score = (spread - mean) / std_dev
- Entry: |z-score| > 2.0
- Exit: z-score crosses 0 (mean reversion complete)
- Stop-loss: |z-score| > 3.5 (regime change possible)

3. POSITION SIZING:
- Dollar-neutral: equal dollar exposure long and short
- Beta-neutral: adjust for individual stock betas to market
- Volatility-targeted: scale notional to achieve 10-15% annualized vol on spread
- Max pair size: 5% of portfolio

4. RISK MANAGEMENT:
- Sector exposure: net long/short oil exposure should be near zero
- Factor exposure: check for unintended value/growth or large/small cap tilts
- Earnings risk: reduce/close pairs ahead of earnings dates
- Corporate action risk: M&A can blow out a pair permanently
- Liquidity gates: ensure both legs have adequate daily volume (>$10M ADV)

5. EDGE SOURCES IN OIL & GAS:
- Basin quality differentials not reflected in price (acreage value)
- Hedging book differences (company A hedged at $70, company B unhedged)
- Balance sheet quality divergence (company A de-levering, company B levering up)
- Capital allocation efficiency (returns on invested capital divergence)
- Management quality and track record differences

6. EXPECTED PERFORMANCE:
- Win rate: 55-65% of trades profitable
- Average win: 3-5% over 2-4 weeks
- Average loss: 2-3% (asymmetric due to stop-losses)
- Sharpe ratio (standalone): 1.2-2.0 for well-constructed pairs
- Annualized return: 15-25% gross, 10-18% net

IMPLEMENTATION: Run 8-15 pairs simultaneously for diversification. Rebalance hedge ratios weekly. Re-test cointegration monthly. Discard pairs that fail reintegration tests.`,
    category: "arbitrage",
    quality: 5,
  },
  {
    input: "Analyze the risk/reward of buying a company's term loan at 65 cents on the dollar when the company has filed for Chapter 11 protection.",
    output: `Chapter 11 Term Loan Analysis at 65 Cents:

1. RECOVERY ANALYSIS:
A term loan at 65 cents implies the market expects ~65% recovery. Key question: is recovery likely higher or lower?

Step 1 - Enterprise Value Estimation:
- Reorganization EV = Forward EBITDA x Comparable exit multiple
- Distressed comparable multiples typically 4-6x for industrials, 2-4x for retail
- Must use POST-RESTRUCTURING EBITDA (exclude one-time costs, add back operational improvements)
- Apply 15-25% discount for execution risk vs going-concern comparable

Step 2 - Debt Waterfall:
Priority: DIP facility > Admin claims > Secured term loan > Unsecured bonds > Equity
- DIP facility (new $-in from post-petition lending) is SENIOR to everything
- If EV = $800M, DIP = $200M, Term loan = $500M at par:
  Recovery = ($800M - $200M admin claims) / $500M = $600M/$500M = 120 cents
  At 65 cents entry: return = (100 - 65) / 65 = 54% return

Step 3 - Sensitivity Analysis:
                   EV = $400M    EV = $600M    EV = $800M    EV = $1B
Term Loan Recovery   40 cents     80 cents      100+ cents    100+ cents
Return at 65 entry   -38%         +23%          +54%          +54%

2. PROCESS RISKS:
- Time to emergence: average 12-18 months (time value of money drag)
- Equitization: term loan may convert to reorganized equity (illiquid initially)
- Subordination risk: court may recharacterize secured claims
- Professional fees: attorneys, advisors consume 5-10% of estate value
- Competing plans: equity committee or other creditors may propose alternative plan

3. TRADE MANAGEMENT:
Position Sizing:
- Max 3-5% of fund at cost
- Reserve additional 2% for averaging opportunities
- Account for illiquidity: bid-ask spreads 3-5 points on distressed claims

Active vs Passive:
- If position >5% of class: join creditor committee, influence plan
- If smaller: trade the claim based on plan developments
- Committee participation provides information advantage but restricts trading

Exit Strategy:
- Sell claims pre-confirmation at 80-90 cents if market rallies
- Hold through reorganization for equity conversion
- Post-emergence equity typically illiquid for 6-12 months; factor in lockup discount

4. DUE DILIGENCE CHECKLIST:
[ ] First day declarations and DIP motion
[ ] Schedules and Statement of Financial Affairs
[ ] Cash collateral budget (monthly cash flow visibility)
[ ] Lien perfection analysis (is your security interest valid?)
[ ] Inter-creditor agreement terms
[ ] Exclusivity period and plan milestones
[ ] Key employee retention plan (KERP)
[ ] Section 363 sale potential (asset sales outside plan)

VERDICT: At 65 cents, this is a reasonable entry IF reorganization EV supports 80+ cent recovery. Key is confidence in post-restructuring EBITDA and multiple. Position for 20-50% return over 12-18 months with 25-35% downside risk in worst case.`,
    category: "distressed_assets",
    quality: 5,
  },
  {
    input: "What are the most persistent market inefficiencies that hedge funds can systematically exploit?",
    output: `Systematic Market Inefficiencies (Ranked by Persistence & Evidence):

1. VALUE/MOMENTUM FACTOR PREMIA (Most Persistent)
Evidence: Fama-French (1992), Jegadeesh & Titman (1993), 100+ years of data
- Value: Buy cheap (low P/B, P/E), short expensive. Long-term premium ~4-5% annually
- Momentum: Buy recent winners, short losers (12-1 month lookback). Premium ~6-8% annually
- Why it persists: Behavioral biases (anchoring, herding, disposition effect) are hardwired
- Capacity: Very large ($10B+), but crowding reduces returns during factor rotations
- Key risk: Momentum crashes (2009) and value traps can cause 30%+ drawdowns

2. POST-EARNINGS ANNOUNCEMENT DRIFT (PEAD)
Evidence: Ball & Brown (1968), still present 55+ years later
- Stocks with positive earnings surprises continue drifting up for 60-90 days
- Magnitude: 2-4% excess return for large surprises
- Why it persists: Analyst and investor underreaction to new information
- Capacity: Moderate ($1-5B), works best in small/mid-cap
- Key risk: Pre-announcement positioning by informed traders narrowing the window

3. CLOSED-END FUND DISCOUNTS
Evidence: Lee, Shleifer & Thaler (1991)
- CEF discounts widen and narrow predictably around mean
- Catalyzed returns via activist intervention: 15-25% annual
- Why it persists: Structural barriers to arbitrage (no creation/redemption mechanism)
- Capacity: Small ($100-500M)
- Key risk: Discount widening during market stress

4. ILLIQUIDITY PREMIUM
Evidence: Amihud (2002), Pastor & Stambaugh (2003)
- Illiquid assets command 3-6% annual return premium over liquid alternatives
- Applies to: small-cap stocks, private credit, real estate, distressed debt
- Why it persists: Most capital is managed by institutions with liquidity requirements
- Capacity: Depends on lockup willingness
- Key risk: Liquidity spirals during crises (2008, 2020)

5. DISTRESSED DEBT PREMIUM
Evidence: Altman & Hotchkiss (2006), multiple practitioner studies
- Distressed bonds purchased during restructuring yield 15-25% annually on average
- DIP loans earn 10-15% with first-lien seniority
- Why it persists: Forced selling (ratings downgrades, fund mandate restrictions)
- Capacity: Moderate ($2-10B depending on credit cycle)
- Key risk: Binary outcomes, concentration risk

6. MERGER ARBITRAGE SPREAD
Evidence: Mitchell & Pulvino (2001)
- Announced deal spreads offer 4-8% annualized excess returns
- Enhanced by deal selection (regulatory risk assessment)
- Why it persists: Deal break risk, capital commitment during uncertainty
- Capacity: Large ($20B+), well-understood by market
- Key risk: Deal breaks cause 20-40% losses on individual positions

7. INDEX REBALANCING EFFECTS
Evidence: Shleifer (1986), Harris & Gurel (1986)
- Stocks added to indices experience 3-7% price increase before inclusion date
- Deletions experience similar decline. Both partially reverse over following months
- Why it persists: Passive fund buying/selling is mechanical and predictable
- Capacity: Moderate, increasingly front-run

8. OVERNIGHT RETURN ANOMALY
Evidence: Kelly & Clark (2011)
- Equity returns are overwhelmingly generated overnight vs intraday
- SPY overnight return accounts for ~100%+ of total return (intraday return ~0%)
- Why it persists: Not fully explained, related to risk transfer from market makers
- Capacity: Large but declining as more traders discover it

PRIORITY RANKING FOR FUND LAUNCH:
Tier 1 (Foundation): Value/Momentum + PEAD → systematic, scalable
Tier 2 (Alpha): Distressed Debt + Special Situations → high alpha, lower capacity
Tier 3 (Satellite): CEF Discounts + Index Effects → niche, diversifying`,
    category: "market_inefficiency",
    quality: 5,
  },
  {
    input: "How should we structure a distressed debt fund's investment process from sourcing to exit?",
    output: `Distressed Debt Fund Investment Process:

PHASE 1: SOURCING & SCREENING (Ongoing)
Primary Sources:
- TRACE bond data: Monitor for securities trading below 80 cents
- Bankruptcy court dockets (PACER): New filings, DIP motions, plan filings
- Leveraged loan syndication desks: Distressed new issues and secondary market flow
- Rating agency downgrade alerts: Track fallen angels (IG to HY transition)
- News screening: Going concern warnings, covenant violations, management changes
- Network: Restructuring advisors, bankruptcy attorneys, other distressed investors

Screening Criteria:
- Enterprise value covers secured debt at >80% recovery
- Identifiable path to value creation (operational turnaround, asset sales, financial restructuring)
- Adequate liquidity to fund operations through restructuring (12+ months)
- Manageable legal complexity (avoid asbestos, environmental, regulatory overhang)
- Position size of $20-50M achievable without moving market

PHASE 2: DEEP DIVE ANALYSIS (2-4 weeks per situation)
Financial Analysis:
1. Normalized EBITDA (strip out one-time items, adjust for secular trends)
2. Free cash flow projections under base/bull/bear scenarios
3. Comparable company and transaction multiples
4. Liquidation analysis (floor value)
5. Debt capacity analysis (sustainable leverage)

Legal Analysis:
1. Security interest review (lien perfection, priority, intercreditor)
2. Fraudulent transfer risk assessment
3. Substantive consolidation risk (multi-entity borrowers)
4. Executory contract analysis (valuable leases, contracts at risk)
5. Governance rights analysis (voting, consent requirements)

PHASE 3: INVESTMENT COMMITTEE APPROVAL
Memo Structure:
- Investment thesis (2-3 sentences: why this, why now, what's mispriced)
- Capital structure and claim analysis
- Recovery analysis with sensitivity tables
- Risk factors and mitigants
- Position sizing and entry strategy
- Exit scenarios and timeline
- Required vote: 75% of IC members

PHASE 4: EXECUTION & POSITION BUILDING
- Build position over 2-4 weeks to minimize market impact
- Use multiple broker-dealers for anonymity
- Bid through intermediaries if needed
- Target 2-4% of fund at cost per position
- Document insider/restricted status if joining creditor committee

PHASE 5: ACTIVE MANAGEMENT
Passive Positions (small holders):
- Monitor court dockets weekly
- Track plan negotiations via legal counsel
- Vote claims in restructuring

Active Positions (creditor committee or ad hoc group):
- Participate in plan negotiations
- Influence DIP terms, professional retention
- Propose or support management changes
- Drive Section 363 sales if liquidation maximizes value
- Negotiate new board composition for reorganized entity

PHASE 6: EXIT STRATEGIES
1. Claim Trading: Sell at higher price pre-confirmation (3-12 months)
2. Reorganized Equity: Hold through emergence, sell equity post-lockup (12-24 months)
3. Litigation Recovery: Pursue avoidance actions or claims (12-36 months)
4. Asset Distribution: Receive asset distributions from estate

Target returns by strategy:
- Claim trading: 20-40% over 6-12 months
- Reorganized equity: 30-100%+ over 12-24 months
- DIP lending: 10-15% current yield with first-lien protection
- Control positions: 25-50% IRR over 2-4 years

FUND STRUCTURE:
- 3-year lockup minimum (distressed cycles are long)
- Side pockets for illiquid positions
- Quarterly NAV with independent valuation
- Targeted gross return: 15-25% net IRR through cycle`,
    category: "distressed_assets",
    quality: 5,
  },
  {
    input: "Explain the concept of a liquidity premium and how it creates exploitable market inefficiencies.",
    output: `Liquidity Premium as a Market Inefficiency:

DEFINITION:
The liquidity premium is the excess return investors earn for holding assets that are difficult or costly to trade. It's one of the most robust and persistent market inefficiencies because it's rooted in structural constraints, not behavioral biases.

QUANTIFYING THE PREMIUM:
Academic evidence shows liquidity premiums of:
- Small-cap stocks vs large-cap: 2-4% annually (Amihud 2002)
- Corporate bonds vs Treasuries (liquidity component): 1-2% (Dick-Nielsen et al. 2012)
- Private equity vs public equity: 3-5% (Franzoni et al. 2012)
- Distressed debt vs performing HY: 5-10% (Altman 2006)
- Real estate vs REITs: 2-4% (Andonov et al. 2014)

WHY IT PERSISTS (Structural Reasons):
1. Regulatory Constraints: Banks and insurance companies face capital charges on illiquid assets, forcing selling regardless of value
2. Benchmark Pressure: Open-end mutual funds must maintain daily liquidity, excluding them from illiquid opportunities
3. Career Risk: Portfolio managers at institutional funds cannot explain 3-year lockups to investment committees
4. Mark-to-Market Volatility: Illiquid assets appear less volatile (smoothed NAVs) but carry true volatility that must be compensated
5. Information Asymmetry: Less analyst coverage, fewer data points, wider confidence intervals

EXPLOITATION STRATEGIES:

Strategy 1 - Small-Cap Value with Holding Power:
- Buy cheap, illiquid small-caps that institutions can't own
- Hold for 12-24 months until catalysts drive rerating
- The premium compensates for higher transaction costs and information costs
- Sharpe improvement: 0.3-0.5 above large-cap value

Strategy 2 - Private Credit / Direct Lending:
- Originate or buy loans to middle-market companies
- Yield premium: 200-400 bps over broadly syndicated loans
- Illiquidity allows patient underwriting vs pressured bank sales
- Default rates historically lower due to better covenant protection

Strategy 3 - Off-the-Run Securities:
- Buy older bond issues trading at discount to on-the-run equivalents
- Same credit risk, 20-50 bps yield pickup for illiquidity
- Particularly effective in Treasury and agency markets
- Low risk, consistent alpha source for fixed income portfolios

Strategy 4 - Distressed & Special Situations:
- Maximum liquidity premium: assets that most investors CANNOT hold
- Forced selling by downgrades (fallen angels), index deletions, fund redemptions
- Buy what others must sell, earn premium for absorbing supply shock
- Counter-cyclical: best opportunities emerge during market stress

IMPLEMENTATION FRAMEWORK:
1. Fund Structure: Closed-end or long lockup (minimum 2 years)
2. Portfolio Construction: Ladder maturities/liquidity across positions
3. Cash Management: Maintain 10-15% liquid reserve for opportunistic deployment
4. Leverage: Conservative (0.5-0.7x) given illiquidity of underlying
5. Reporting: Transparent NAV methodology with independent valuation

KEY INSIGHT:
The liquidity premium is an inefficiency that CANNOT be arbitraged away because it's driven by institutional constraints, not irrational behavior. As long as regulations require banks to hold liquid assets and mutual funds to offer daily redemptions, patient capital with structural advantages will earn this premium.`,
    category: "market_inefficiency",
    quality: 5,
  },
];

router.post("/hedge-training/synthetic-generate", async (_req, res) => {
  let totalSamples = 0;

  for (const scenario of DISTRESSED_ASSET_SCENARIOS) {
    try {
      const existing = await db
        .select({ id: trainingDataTable.id })
        .from(trainingDataTable)
        .where(and(
          eq(trainingDataTable.source, "hf_synthetic"),
          eq(trainingDataTable.inputText, scenario.input)
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(trainingDataTable).values({
          inputText: scenario.input,
          outputText: scenario.output,
          systemPrompt: HEDGE_FUND_SYSTEM_PROMPT,
          category: scenario.category,
          quality: scenario.quality,
          source: "hf_synthetic",
        });
        totalSamples++;
      }
    } catch (e: any) {
      console.error(`[hf-synthetic] Error:`, e.message);
    }
  }

  hfStats.syntheticSamples += totalSamples;
  hfStats.totalSamples += totalSamples;
  hfStats.lastRunAt = new Date().toISOString();

  res.json({
    message: "Hedge fund synthetic training data generated",
    samplesAdded: totalSamples,
    totalScenarios: DISTRESSED_ASSET_SCENARIOS.length,
  });
});

router.post("/hedge-training/fred-macro-collect", async (_req, res) => {
  const macroSeries = [
    { id: "BAMLH0A0HYM2", name: "ICE BofA US High Yield Index Option-Adjusted Spread", category: "credit_markets" },
    { id: "TEDRATE", name: "TED Spread (3-Month LIBOR - T-Bill)", category: "market_microstructure" },
    { id: "T10Y2Y", name: "10-Year Treasury Minus 2-Year (Yield Curve)", category: "macro_strategy" },
    { id: "VIXCLS", name: "CBOE Volatility Index (VIX)", category: "volatility" },
    { id: "DCOILWTICO", name: "WTI Crude Oil Price", category: "commodities" },
    { id: "BAMLH0A3HYC", name: "ICE BofA CCC & Lower US High Yield Index OAS", category: "distressed_assets" },
    { id: "DGS10", name: "10-Year Treasury Constant Maturity Rate", category: "macro_strategy" },
    { id: "UNRATE", name: "Civilian Unemployment Rate", category: "macro_strategy" },
    { id: "CPIAUCSL", name: "Consumer Price Index for All Urban Consumers", category: "macro_strategy" },
    { id: "FEDFUNDS", name: "Effective Federal Funds Rate", category: "macro_strategy" },
    { id: "MORTGAGE30US", name: "30-Year Fixed Rate Mortgage Average", category: "real_estate" },
    { id: "WILL5000IND", name: "Wilshire 5000 Total Market Index", category: "general_finance" },
    { id: "SP500", name: "S&P 500", category: "general_finance" },
    { id: "NASDAQCOM", name: "NASDAQ Composite Index", category: "general_finance" },
    { id: "GOLDAMGBD228NLBM", name: "Gold Fixing Price London", category: "commodities" },
  ];

  let totalSamples = 0;

  for (const series of macroSeries) {
    const input = `As a macro strategist at a hedge fund, explain the significance of the ${series.name} (FRED: ${series.id}) for identifying market inefficiencies and distressed asset opportunities.`;

    const output = `Macro Indicator Analysis: ${series.name}

FRED Series: ${series.id}
Category: ${series.category.replace(/_/g, " ")}

Strategic Significance:
${series.category === "credit_markets" ? `The ${series.name} is a critical barometer for credit stress and distressed asset opportunities. When this spread widens beyond 500 bps, it historically signals:\n- Increased default expectations in the high-yield universe\n- Forced selling by constrained investors (insurance companies, CLOs hitting OC triggers)\n- Entry opportunities for distressed debt investors\n- Widening creates a "spread compression trade" — buy distressed credits trading at discounts that overestimate default probability\n- Historically, buying HY at 800+ bps OAS generates 15-20% annualized returns over subsequent 3 years` : series.category === "macro_strategy" ? `The ${series.name} provides critical context for macro hedge fund positioning:\n- Used to gauge business cycle stage (early/mid/late/recession)\n- Helps time factor rotation (value outperforms in early recovery, momentum in mid-cycle)\n- Signals regime changes that invalidate existing trading strategies\n- Combined with other macro indicators, forms the basis for top-down asset allocation\n- Divergences between this and market pricing create exploitable mispricings` : series.category === "volatility" ? `The ${series.name} is essential for volatility-based hedge fund strategies:\n- Mean-reverting nature creates systematic trading opportunities\n- VIX term structure (contango/backwardation) signals market stress regimes\n- Spikes above 30 indicate fear and potential buying opportunities in risk assets\n- Sustained low VIX (<15) often precedes volatility expansion — time for tail hedges\n- VIX futures roll yield creates structural alpha for short vol strategies (with careful risk management)` : series.category === "distressed_assets" ? `The ${series.name} directly tracks the distressed opportunity set:\n- Rising values indicate growing stress in lowest-rated credits\n- When CCC spreads exceed 1500 bps, broad-based distressed opportunities emerge\n- Spread between CCC and BB indicates market differentiation (wider = more selective distress)\n- Leads default rates by 6-12 months — early warning for cycle positioning\n- Optimal distressed fund deployment: buy when spreads are peaking, not when they're widening` : series.category === "commodities" ? `The ${series.name} impacts multiple hedge fund strategies:\n- Commodity prices drive sector rotation and relative value trades\n- Energy price dislocations create distressed opportunities in E&P companies\n- Inflation hedge: commodities provide portfolio diversification in inflationary regimes\n- Contango/backwardation in futures curves creates roll yield alpha\n- Supply/demand imbalances in physical markets create informed speculation opportunities` : `The ${series.name} is monitored for cross-asset signals:\n- Rate changes ripple through all asset classes via discount rate and credit channels\n- Real estate stress, mortgage defaults, and housing market dislocations correlate with this metric\n- Provides context for relative value decisions across fixed income, equity, and alternatives`}

Trading Applications:
1. Regime detection: trend changes signal strategy allocation shifts
2. Mean reversion: extreme readings revert over 3-12 months
3. Cross-asset signals: divergences between related indicators create pair trades
4. Risk management: use as portfolio stress indicator for position sizing`;

    try {
      const existing = await db
        .select({ id: trainingDataTable.id })
        .from(trainingDataTable)
        .where(and(
          eq(trainingDataTable.source, "fred_macro"),
          eq(trainingDataTable.inputText, input)
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(trainingDataTable).values({
          inputText: input,
          outputText: output,
          systemPrompt: HEDGE_FUND_SYSTEM_PROMPT,
          category: series.category,
          quality: 4,
          source: "fred_macro",
        });
        totalSamples++;
      }
    } catch (e: any) {
      console.error(`[fred] Error for ${series.id}:`, e.message);
    }
  }

  hfStats.fredSeries += totalSamples;
  hfStats.totalSamples += totalSamples;
  hfStats.lastRunAt = new Date().toISOString();

  res.json({
    message: "FRED macro training data generated",
    samplesAdded: totalSamples,
    seriesProcessed: macroSeries.length,
  });
});

router.post("/hedge-training/inject-to-model", async (req, res) => {
  const { model = "deepseek-r1:8b", category, limit = 50 } = req.body || {};

  try {
    const vpsIp = process.env.VPS_IP || "72.60.167.64";
    const serverUrl = process.env.OLLAMA_BASE_URL || `http://${vpsIp}:11434`;

    const clampedLimit = Math.min(Math.max(10, limit), 200);

    const financeCategories = [
      "distressed_assets", "market_inefficiency", "arbitrage", "special_situations",
      "quantitative_strategies", "credit_markets", "volatility", "market_microstructure",
      "hedge_fund_strategies", "risk_management", "private_equity", "real_estate",
      "commodities", "behavioral_finance", "ai_quant", "macro_strategy", "crypto", "general_finance",
    ];

    const financeSources = ["openalex_finance", "sec_edgar", "hf_synthetic", "fred_macro"];

    const conditions: any[] = [sql`${trainingDataTable.quality} >= 3`];

    if (category) {
      conditions.push(eq(trainingDataTable.category, category));
    } else {
      conditions.push(
        sql`(${trainingDataTable.source} = ANY(ARRAY[${sql.join(financeSources.map(s => sql`${s}`), sql`, `)}]) OR ${trainingDataTable.category} = ANY(ARRAY[${sql.join(financeCategories.map(c => sql`${c}`), sql`, `)}]))`
      );
    }

    const samples = await db
      .select()
      .from(trainingDataTable)
      .where(and(...conditions))
      .orderBy(desc(trainingDataTable.quality))
      .limit(clampedLimit);

    if (samples.length === 0) {
      return res.status(404).json({ error: "No hedge fund training samples found" });
    }

    const modelfileName = `${model.replace(/[:.]/g, "-")}-hf-trained`;

    const messages = samples.slice(0, 20).flatMap(s => [
      { role: "user" as const, content: s.inputText },
      { role: "assistant" as const, content: s.outputText },
    ]);

    const createRes = await fetch(`${serverUrl}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelfileName,
        from: model,
        system: HEDGE_FUND_SYSTEM_PROMPT,
        parameters: {
          temperature: 0.4,
          top_p: 0.9,
          top_k: 40,
          repeat_penalty: 1.1,
        },
        messages,
        stream: false,
      }),
      dispatcher: ollamaAgent,
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      return res.status(500).json({ error: `Ollama create failed: ${createRes.status}`, details: errorText });
    }

    res.json({
      success: true,
      modelName: modelfileName,
      baseModel: model,
      samplesUsed: samples.length,
      messagesInjected: Math.min(20, samples.length),
      category: category || "all_finance",
    });

    console.log(`[hf-inject] Created model ${modelfileName} from ${model} with ${samples.length} samples`);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/hedge-training/collect-all", async (_req, res) => {
  res.json({ message: "Full hedge fund training pipeline started (OpenAlex + SEC + FRED + Synthetic)" });

  const runEndpoint = async (path: string, body: any = {}) => {
    try {
      await fetch(`http://localhost:${process.env.PORT || 8080}/api/hedge-training/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      console.error(`[hf-pipeline] Error running ${path}:`, e.message);
    }
  };

  await runEndpoint("synthetic-generate");
  await runEndpoint("fred-macro-collect");
  await runEndpoint("openalex-collect", { maxPerQuery: 15 });
  await runEndpoint("sec-distressed-collect", { maxResults: 20 });

  console.log("[hf-pipeline] Full collection pipeline complete");
});

router.get("/hedge-training/stats", async (_req, res) => {
  try {
    const financeCategories = [
      "distressed_assets", "market_inefficiency", "arbitrage", "special_situations",
      "quantitative_strategies", "credit_markets", "volatility", "market_microstructure",
      "hedge_fund_strategies", "risk_management", "private_equity", "real_estate",
      "commodities", "behavioral_finance", "ai_quant", "macro_strategy", "crypto", "general_finance",
    ];
    const financeSources = ["openalex_finance", "sec_edgar", "hf_synthetic", "fred_macro"];

    const sourceStats = await db
      .select({
        source: trainingDataTable.source,
        count: sql<number>`count(*)::int`,
        avgQuality: sql<number>`avg(quality)::numeric(3,1)`,
      })
      .from(trainingDataTable)
      .where(
        sql`${trainingDataTable.source} = ANY(ARRAY[${sql.join(financeSources.map(s => sql`${s}`), sql`, `)}])`
      )
      .groupBy(trainingDataTable.source);

    const categoryStats = await db
      .select({
        category: trainingDataTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingDataTable)
      .where(
        sql`${trainingDataTable.source} = ANY(ARRAY[${sql.join(financeSources.map(s => sql`${s}`), sql`, `)}])`
      )
      .groupBy(trainingDataTable.category);

    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingDataTable)
      .where(
        sql`${trainingDataTable.source} = ANY(ARRAY[${sql.join(financeSources.map(s => sql`${s}`), sql`, `)}])`
      );

    res.json({
      totalSamples: total[0]?.count || 0,
      bySource: Object.fromEntries(sourceStats.map(s => [s.source, { count: s.count, avgQuality: s.avgQuality }])),
      byCategory: Object.fromEntries(categoryStats.map(c => [c.category, c.count])),
      pipeline: hfStats,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
export { HEDGE_FUND_SYSTEM_PROMPT };
