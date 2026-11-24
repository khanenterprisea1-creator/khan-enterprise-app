import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGES = 6;
const MAX_BASE64_LENGTH = 4_800_000;
const MAX_TEXT_LENGTH = 12_000;

interface IncomingChalanImage {
  mimeType: string;
  data: string;
  role?: 'current' | 'previous';
  label?: string;
}

let cachedAiClient: GoogleGenAI | null = null;
let cachedApiKey = '';

function getAiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedAiClient || cachedApiKey !== apiKey) {
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedApiKey = apiKey;
  }
  return cachedAiClient;
}

function stripDataUrlPrefix(rawData: string): { cleanBase64: string; detectedMime?: string } {
  const trimmed = rawData.trim();
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(trimmed);
  if (match) {
    return {
      detectedMime: match[1].toLowerCase(),
      cleanBase64: match[2].replace(/\s+/g, ''),
    };
  }
  return { cleanBase64: trimmed.replace(/\s+/g, '') };
}

function isValidBase64(value: string): boolean {
  if (!value || value.length > MAX_BASE64_LENGTH) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value);
}

const CHALAN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    header: {
      type: Type.OBJECT,
      properties: {
        companyOrSupplier: { type: Type.STRING },
        invoiceOrChalanNo: { type: Type.STRING },
        invoiceDate: { type: Type.STRING },
        dueNumbers: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        summaryNote: { type: Type.STRING },
      },
      required: ['companyOrSupplier', 'invoiceOrChalanNo', 'invoiceDate', 'dueNumbers', 'summaryNote'],
    },
    paidItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dueNumber: { type: Type.STRING },
          productName: { type: Type.STRING },
          quantityText: { type: Type.STRING },
          numericQty: { type: Type.NUMBER },
          unitType: { type: Type.STRING },
          printedRate: { type: Type.NUMBER },
          totalAmount: { type: Type.NUMBER },
          calculatedRate: { type: Type.NUMBER },
          rateStatus: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: [
          'dueNumber',
          'productName',
          'quantityText',
          'numericQty',
          'unitType',
          'printedRate',
          'totalAmount',
          'calculatedRate',
          'rateStatus',
          'note',
        ],
      },
    },
    freeItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dueNumber: { type: Type.STRING },
          productName: { type: Type.STRING },
          quantityText: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ['dueNumber', 'productName', 'quantityText', 'note'],
      },
    },
    missingFreeAlerts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING },
          dueNumber: { type: Type.STRING },
          reason: { type: Type.STRING },
          severity: { type: Type.STRING },
        },
        required: ['productName', 'dueNumber', 'reason', 'severity'],
      },
    },
    dueComparisons: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dueNumber: { type: Type.STRING },
          status: { type: Type.STRING },
          currentUndeliveryOrDeliveryNo: { type: Type.STRING },
          previousUndeliveryOrDeliveryNo: { type: Type.STRING },
          lastDigitWarning: { type: Type.STRING },
          details: { type: Type.STRING },
        },
        required: [
          'dueNumber',
          'status',
          'currentUndeliveryOrDeliveryNo',
          'previousUndeliveryOrDeliveryNo',
          'lastDigitWarning',
          'details',
        ],
      },
    },
    uncertainOrBlurryWarnings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fieldOrLine: { type: Type.STRING },
          rawSnippet: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['fieldOrLine', 'rawSnippet', 'reason'],
      },
    },
    quickSummaryBn: { type: Type.STRING },
  },
  required: [
    'header',
    'paidItems',
    'freeItems',
    'missingFreeAlerts',
    'dueComparisons',
    'uncertainOrBlurryWarnings',
    'quickSummaryBn',
  ],
};

const SYSTEM_INSTRUCTION = `You are a meticulous Bangladeshi distribution chalan & invoice auditor assisting Khan Enterprise.
Your output MUST strictly follow the JSON schema and use clear, natural Bengali (with exact English/numeric codes preserved where printed on the chalan).

STRICT RULES:
1. NEVER GUESS OR FABRICATE BLURRY/UNCLEAR DATA:
   - If any digit, Due number, Undelivery/Delivery number, product name, quantity, rate, or total amount is blurry, cut off, smudged, overwritten by pen, or ambiguous, DO NOT guess!
   - Put 0 for unknown numeric fields if unreadable, mark rateStatus/status as "unclear", and add a clear warning entry in "uncertainOrBlurryWarnings" describing the exact line/field and why it is doubtful.
2. PAID PRODUCTS & RATE CALCULATION:
   - Extract every paid line item into "paidItems".
   - Identify unit conventions common in Bangladeshi distributor chalans (e.g. "k" = কার্টন/কটন, "ps" / "pcs" = পিস, "dz" = ডজন, "box" = বক্স) and preserve original quantityText (e.g., "10k 5ps" or "12 k").
   - Calculate unit rate = Total Amount / Numeric Quantity (round to 2 decimals; if quantity is 0 or unclear, set calculatedRate to 0 and mark rateStatus "unclear").
   - Compare calculatedRate against printedRate (if a unit rate is printed on the invoice). Set rateStatus to "match", "mismatch", or "unclear". Explain any difference concisely in Bengali in "note".
3. FREE ITEMS & MISSING FREE CHECK:
   - Any item marked 0, Free, Promo, Bonus, or 0.00 value MUST go into "freeItems" (separate from "paidItems").
   - Check whether any paid promotional/scheme product appears to be missing an accompanying Free line (or if a baseline/comparison chalan had a Free item that is missing in the current chalan, or if invoice notes mention a free scheme missing from the list). Add concise Bengali alerts to "missingFreeAlerts" with severity "warning" or "info".
4. DUE NUMBER & UNDELIVERY/DELIVERY COMPARISON (ESPECIALLY LAST DIGITS):
   - Extract all Due Numbers (e.g. "DH 2304678" or similar) into header.dueNumbers and per-item dueNumber.
   - If previous/comparison chalan images or comparison text are provided, compare every Due Number, Undelivery No, Delivery No, product quantity, and total amount between CURRENT and PREVIOUS/COMPARISON chalans.
   - Pay EXTRA attention to the last 1-3 digits of Undelivery vs Delivery numbers (or Due numbers) where digits look similar (like 3/8, 5/6, 1/7, 4/9) or changed between copies. Highlight any discrepancy in "lastDigitWarning" and set status to one of: "matched", "missing_in_current", "missing_in_previous", "last_digit_alert", "qty_or_amount_diff", "unclear".
   - Even if only one chalan is uploaded, populate "dueComparisons" for each detected Due Number / Delivery-Undelivery reference so the user can see exact reference numbers and any last-digit clarity alerts.
5. QUICK SUMMARY:
   - Write "quickSummaryBn" as a clean, concise Bengali summary (bulleted plain text lines) covering total paid items, free items, rate/total issues, Due/Undelivery warnings, and uncertain spots so the user can save or copy it as a note.`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      chalanVerifyReady: Boolean(getAiClient()),
    });
  });

  app.post('/api/chalan-verify', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'সার্ভারে Gemini API কী কনফিগার করা নেই। Settings > Secrets প্যানেলে GEMINI_API_KEY সেট করুন।',
        });
        return;
      }

      const body = req.body as Record<string, unknown> | null;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'অনুরোধের তথ্য সঠিক নয়।' });
        return;
      }

      const rawImages = Array.isArray(body.images) ? body.images : [];
      if (rawImages.length > MAX_IMAGES) {
        res.status(400).json({ error: `একসাথে সর্বোচ্চ ${MAX_IMAGES}টি ছবি যাচাই করা যাবে।` });
        return;
      }

      const chalanText =
        typeof body.chalanText === 'string' ? body.chalanText.trim().slice(0, MAX_TEXT_LENGTH) : '';
      const comparisonText =
        typeof body.comparisonText === 'string'
          ? body.comparisonText.trim().slice(0, MAX_TEXT_LENGTH)
          : '';
      const extraNote =
        typeof body.extraNote === 'string' ? body.extraNote.trim().slice(0, 2000) : '';

      const validatedImages: Array<{
        mimeType: string;
        data: string;
        role: 'current' | 'previous';
        label: string;
      }> = [];

      for (let i = 0; i < rawImages.length; i += 1) {
        const item = rawImages[i] as Partial<IncomingChalanImage> | null;
        if (!item || typeof item.data !== 'string' || typeof item.mimeType !== 'string') {
          res.status(400).json({ error: 'আপলোড করা ছবির ফরম্যাট সঠিক নয়।' });
          return;
        }
        const { cleanBase64, detectedMime } = stripDataUrlPrefix(item.data);
        const finalMime = (detectedMime || item.mimeType).toLowerCase();
        if (!ALLOWED_IMAGE_MIMES.has(finalMime)) {
          res.status(400).json({
            error: 'শুধুমাত্র JPG, PNG অথবা WEBP ফরম্যাটের চালানের ছবি আপলোড করা যাবে।',
          });
          return;
        }
        if (!isValidBase64(cleanBase64)) {
          res.status(400).json({
            error: 'ছবির আকার অনেক বড় বা ডেটা অসম্পূর্ণ। অনুগ্রহ করে আবার চেষ্টা করুন।',
          });
          return;
        }
        validatedImages.push({
          mimeType: finalMime,
          data: cleanBase64,
          role: item.role === 'previous' ? 'previous' : 'current',
          label:
            typeof item.label === 'string' && item.label.trim()
              ? item.label.trim().slice(0, 80)
              : `Image ${i + 1}`,
        });
      }

      if (validatedImages.length === 0 && !chalanText) {
        res.status(400).json({
          error: 'যাচাই করার জন্য কমপক্ষে একটি চালানের ছবি অথবা চালানের টেক্সট দিন।',
        });
        return;
      }

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      const currentImgs = validatedImages.filter((img) => img.role === 'current');
      const previousImgs = validatedImages.filter((img) => img.role === 'previous');

      let promptText = 'নিচের বর্তমান চালান (Current Chalan) ভালোভাবে যাচাই করে রেট, ফ্রি প্রোডাক্ট, মিসিং ফ্রি সতর্কতা, Due নম্বর, Undelivery/Delivery নম্বর ও অস্পষ্ট তথ্যের পূর্ণ বিশ্লেষণ দিন।\n';
      if (chalanText) {
        promptText += `\n[বর্তমান চালানের টেক্সট / নোট]:\n${chalanText}\n`;
      }
      if (comparisonText) {
        promptText += `\n[তুলনার জন্য আগের/রেফারেন্স চালানের তথ্য]:\n${comparisonText}\n`;
      }
      if (extraNote) {
        promptText += `\n[ব্যবহারকারীর বিশেষ নির্দেশনা]:\n${extraNote}\n`;
      }
      parts.push({ text: promptText });

      currentImgs.forEach((img, idx) => {
        parts.push({ text: `[বর্তমান চালানের ছবি #${idx + 1}: ${img.label}]` });
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      });

      previousImgs.forEach((img, idx) => {
        parts.push({
          text: `[তুলনার জন্য আগের / Undelivery / রেফারেন্স চালানের ছবি #${idx + 1}: ${img.label}]`,
        });
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: CHALAN_RESPONSE_SCHEMA,
        },
      });

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        res.status(502).json({
          error: 'AI থেকে বিশ্লেষণ ফলাফল পাওয়া যায়নি। ছবি আরও পরিষ্কার করে আবার চেষ্টা করুন।',
        });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        res.status(502).json({
          error: 'চালান বিশ্লেষণের ডেটা প্রক্রিয়াকরণে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
        });
        return;
      }

      res.json({ result: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const statusMatch = /\b(400|403|404|429|500|503)\b/.exec(message);
      const statusCode = statusMatch ? Number(statusMatch[1]) : 500;

      if (statusCode === 403 || /PERMISSION_DENIED|API_KEY_INVALID/i.test(message)) {
        res.status(statusCode === 403 ? 403 : 400).json({
          error:
            'Gemini API কী সঠিক নয় বা অনুমতি পাওয়া যায়নি। Settings > Secrets প্যানেল থেকে কী যাচাই করুন।',
        });
        return;
      }
      if (statusCode === 429 || /RESOURCE_EXHAUSTED/i.test(message)) {
        res.status(429).json({
          error: 'API কোটা সীমা সাময়িকভাবে পূর্ণ হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
        });
        return;
      }

      res.status(500).json({
        error: 'চালান যাচাই করতে সার্ভার সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
      });
    }
  });

  // Return clean JSON errors for oversized payloads or malformed JSON bodies
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      res.status(413).json({
        error: 'আপলোড করা ছবির মোট আকার ১৫ MB-এর বেশি। অনুগ্রহ করে কম বা ছোট ছবি দিন।',
      });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'অনুরোধের JSON ফরম্যাট সঠিক নয়।' });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(DIST_DIR));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(DIST_DIR, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
