import React, { useState } from 'react';
import { Check, Code2, Copy, Globe, Layers, Webhook } from 'lucide-react';
import { usePayVerify } from '../lib/store';

type CodeLang = 'curl' | 'js' | 'php';

export const ApiDocsView: React.FC = () => {
  const { platformConfig, selectedStore } = usePayVerify();
  const [mode, setMode] = useState<'hosted' | 'embedded'>('hosted');
  const [lang, setLang] = useState<CodeLang>('curl');
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  const workerUrl = platformConfig.workerBaseUrl || 'https://YOUR-WORKER.workers.dev';
  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://payverify.your-domain.com';
  const storeIdExample = selectedStore?.id || 'YOUR_STORE_ID';

  // SECURITY: Never print the store's real key — always use a placeholder!
  const PLACEHOLDER_KEY = 'YOUR_STORE_KEY_HERE';

  const createExamples: Record<CodeLang, string> = {
    curl: `curl -X POST "${workerUrl}/session/create" \\
  -H "Content-Type: application/json" \\
  -H "x-store-key: ${PLACEHOLDER_KEY}" \\
  -d '{
    "storeId": "${storeIdExample}",
    "orderId": "ORD-1001",
    "amountPaisa": 125000,
    "method": "bkash",
    "successUrl": "https://your-site.com/order/ORD-1001/success",
    "failUrl": "https://your-site.com/order/ORD-1001/failed"
  }'`,
    js: `const res = await fetch("${workerUrl}/session/create", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-store-key": process.env.PAYVERIFY_STORE_KEY // ${PLACEHOLDER_KEY}
  },
  body: JSON.stringify({
    storeId: "${storeIdExample}",
    orderId: "ORD-1001",
    amountPaisa: 125000, // ৳1,250.00 (টাকা × 100)
    method: "bkash",
    successUrl: "https://your-site.com/order/ORD-1001/success",
    failUrl: "https://your-site.com/order/ORD-1001/failed"
  })
});
const data = await res.json();
// data = { sessionId, payablePaisa, number, expiresAt }`,
    php: `<?php
$ch = curl_init("${workerUrl}/session/create");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Content-Type: application/json",
    "x-store-key: " . getenv("PAYVERIFY_STORE_KEY"), // ${PLACEHOLDER_KEY}
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "storeId" => "${storeIdExample}",
    "orderId" => "ORD-1001",
    "amountPaisa" => 125000,
    "method" => "bkash",
    "successUrl" => "https://your-site.com/order/ORD-1001/success",
    "failUrl" => "https://your-site.com/order/ORD-1001/failed",
  ]),
]);
$response = json_decode(curl_exec($ch), true);`,
  };

  const createResponseExample = `{
  "sessionId": "ps_9f3a2c8e1b4d",
  "payablePaisa": 125037,
  "number": "01711223344",
  "expiresAt": 1764000900000
}`;

  const statusCheckExample = `GET ${workerUrl}/session/{sessionId}/status

// Response:
{
  "status": "waiting" | "paid" | "expired" | "cancelled",
  "method": "bkash",
  "number": "01711223344",
  "numberType": "personal" | "agent",
  "actionType": "send_money" | "cash_in" | "cash_out" | "payment",
  "customInstruction": "",
  "payablePaisa": 125037,
  "expiresAt": 1764000900000,
  "trxId": "BK99887766",
  "storeName": "${selectedStore?.name || 'Your Store'}",
  "logoUrl": "https://your-site.com/logo.png",
  "accentColor": "#0F766E",
  "methodNumbers": {
    "bkash": {
      "number": "01711223344",
      "type": "personal",
      "actionType": "send_money",
      "customInstruction": ""
    }
  },
  "successUrl": "https://your-site.com/order/ORD-1001/success",
  "failUrl": "https://your-site.com/order/ORD-1001/failed"
}`;

  const webhookVerifyExample = `// Webhook POST Payload (Header: x-payverify-signature = HMAC-SHA256 hex)
{
  "event": "payment.confirmed",
  "storeId": "${storeIdExample}",
  "sessionId": "ps_9f3a2c8e1b4d",
  "orderId": "ORD-1001",
  "method": "bkash",
  "amountPaisa": 125000,
  "payablePaisa": 125037,
  "trxId": "BK99887766",
  "sender": "01812345678",
  "paidAt": 1764000123000
}

// Node.js সিগনেচার যাচাই:
import crypto from "node:crypto";
const expected = crypto
  .createHmac("sha256", process.env.PAYVERIFY_WEBHOOK_SECRET)
  .update(rawRequestBody)
  .digest("hex");
const isValid = crypto.timingSafeEqual(
  Buffer.from(expected),
  Buffer.from(req.headers["x-payverify-signature"] || "")
);`;

  const copyCode = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBlock(id);
      window.setTimeout(() => setCopiedBlock((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">API ডকুমেন্ট</h1>
        {selectedStore && (
          <span className="px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-slate-700">
            Store ID: {selectedStore.id}
          </span>
        )}
      </div>

      {/* Base URL Box */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Globe className="w-4 h-4 text-teal-700" />
          Worker Base URL
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-900 overflow-x-auto">
            {workerUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyCode('base', workerUrl)}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shrink-0"
          >
            {copiedBlock === 'base' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedBlock === 'base' ? 'কপি হয়েছে' : 'কপি'}
          </button>
        </div>
      </div>

      {/* Integration Modes Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">ইন্টিগ্রেশন মোড</h2>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('hosted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'hosted' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              হোস্টেড মোড (Hosted)
            </button>
            <button
              type="button"
              onClick={() => setMode('embedded')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'embedded' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              এমবেডেড মোড (Embedded)
            </button>
          </div>
        </div>

        {mode === 'hosted' ? (
          <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
            <li>
              আপনার সার্ভার থেকে <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">POST /session/create</code> কল করে একটি <code className="font-mono text-xs">sessionId</code> তৈরি করুন (সাথে <code className="font-mono text-xs">successUrl</code> ও <code className="font-mono text-xs">failUrl</code> দিন)।
            </li>
            <li>
              কাস্টমারকে রিডাইরেক্ট করুন:{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded break-all">
                {appOrigin}/pay/{'{sessionId}'}?worker={encodeURIComponent(workerUrl)}
              </code>
            </li>
            <li>
              পেমেন্ট নিশ্চিত হলে পেজটি নিজেই কাস্টমারকে আপনার <code className="font-mono text-xs">successUrl</code>-এ ফিরিয়ে দেবে (আর ব্যর্থ/মেয়াদোত্তীর্ণ হলে <code className="font-mono text-xs">failUrl</code>-এ), এবং আপনার সার্ভারে ওয়েববুক পৌঁছে যাবে।
            </li>
          </ol>
        ) : (
          <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
            <li>
              আপনার ব্যাকএন্ড থেকে <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">POST /session/create</code> কল করে <code className="font-mono text-xs">number</code>, <code className="font-mono text-xs">payablePaisa</code>, <code className="font-mono text-xs">expiresAt</code> ও <code className="font-mono text-xs">sessionId</code> নিন।
            </li>
            <li>
              কাস্টমারকে আপনার নিজের চেকআউট পেজের ভেতরেই রিসিভিং নম্বর ও সঠিক টাকার পরিমাণ দেখান।
            </li>
            <li>
              আপনার পেজ থেকে প্রতি ৩ সেকেন্ড পরপর <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">GET /session/{'{sessionId}'}/status</code> পোল করুন যতক্ষণ না <code className="font-mono text-xs">status === &quot;paid&quot;</code> হয়।
            </li>
          </ol>
        )}
      </div>

      {/* Create Session Endpoint & Code Samples */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">১. সেশন তৈরি (POST /session/create)</h2>
          </div>

          <div className="flex items-center gap-1.5">
            {(['curl', 'js', 'php'] as CodeLang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                  lang === l
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {l === 'curl' ? 'cURL' : l === 'js' ? 'JavaScript' : 'PHP'}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
          সব টাকার মান পূর্ণসংখ্যার <strong>পয়সায়</strong> (amountPaisa = টাকা × 100) পাঠাতে হবে। উদাহরণে <code className="font-mono">{PLACEHOLDER_KEY}</code>-এর জায়গায় আপনার স্টোরের আসল Store Key শুধুমাত্র আপনার সার্ভার এনভায়রনমেন্টে ব্যবহার করুন।
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => void copyCode('create', createExamples[lang])}
            className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-medium hover:bg-slate-700"
          >
            {copiedBlock === 'create' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedBlock === 'create' ? 'কপি হয়েছে' : 'কপি'}
          </button>
          <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
            {createExamples[lang]}
          </pre>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-600">রেসপন্স উদাহরণ:</div>
          <pre className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 overflow-x-auto">
            {createResponseExample}
          </pre>
        </div>
      </div>

      {/* Session Status Check */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
        <h2 className="text-base font-bold text-slate-900">
          ২. সেশন স্ট্যাটাস চেক (GET /session/{'{sessionId}'}/status)
        </h2>
        <div className="relative">
          <button
            type="button"
            onClick={() => void copyCode('status', statusCheckExample)}
            className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-medium hover:bg-slate-700"
          >
            {copiedBlock === 'status' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedBlock === 'status' ? 'কপি হয়েছে' : 'কপি'}
          </button>
          <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
            {statusCheckExample}
          </pre>
        </div>
      </div>

      {/* Webhook Payload & Signature Verification */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Webhook className="w-4 h-4 text-indigo-700" />
          <h2 className="text-base font-bold text-slate-900">৩. ওয়েববুক পেলোড ও সিগনেচার যাচাই</h2>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => void copyCode('webhook', webhookVerifyExample)}
            className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-medium hover:bg-slate-700"
          >
            {copiedBlock === 'webhook' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedBlock === 'webhook' ? 'কপি হয়েছে' : 'কপি'}
          </button>
          <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
            {webhookVerifyExample}
          </pre>
        </div>
      </div>
    </div>
  );
};
