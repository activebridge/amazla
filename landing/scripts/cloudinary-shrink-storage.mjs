#!/usr/bin/env node

import crypto from "node:crypto";

const REQUIRED_ENV = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const prefix = process.env.CLOUDINARY_PREFIX || "";
const maxImages = Number(process.env.MAX_IMAGES || 50);
const maxDimension = Number(process.env.MAX_DIMENSION || 2000);
const quality = process.env.QUALITY || "auto:eco";
const dryRun = (process.env.DRY_RUN || "true").toLowerCase() !== "false";
const sleepMs = Number(process.env.SLEEP_MS || 250);

function signParams(params) {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

function transformedUrl(originalSecureUrl) {
  // q_auto + c_limit keeps visuals reasonable and reduces stored bytes.
  return originalSecureUrl.replace(
    "/upload/",
    `/upload/q_${quality},c_limit,w_${maxDimension},h_${maxDimension}/`
  );
}

async function listResources() {
  const search = new URLSearchParams({
    max_results: String(Math.min(maxImages, 500)),
  });
  if (prefix) search.set("prefix", prefix);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${search.toString()}`;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const response = await fetch(endpoint, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`List resources failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.resources || [];
}

async function overwriteCompressed(resource) {
  const ts = Math.floor(Date.now() / 1000);
  const paramsToSign = {
    invalidate: "true",
    overwrite: "true",
    public_id: resource.public_id,
    timestamp: String(ts),
  };
  const signature = signParams(paramsToSign);

  const form = new FormData();
  form.set("file", transformedUrl(resource.secure_url));
  form.set("public_id", resource.public_id);
  form.set("overwrite", "true");
  form.set("invalidate", "true");
  form.set("timestamp", String(ts));
  form.set("api_key", apiKey);
  form.set("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const response = await fetch(endpoint, { method: "POST", body: form });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Overwrite failed for ${resource.public_id}: ${text}`);
  }

  return response.json();
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Cloudinary shrink job started");
  console.log(
    JSON.stringify({ prefix, maxImages, maxDimension, quality, dryRun, sleepMs }, null, 2)
  );

  const resources = await listResources();
  if (!resources.length) {
    console.log("No images found for current filter.");
    return;
  }

  let updated = 0;
  for (const resource of resources) {
    const nextUrl = transformedUrl(resource.secure_url);
    console.log(`\n[${resource.public_id}]`);
    console.log(`current: ${resource.bytes} bytes`);
    console.log(`source : ${resource.secure_url}`);
    console.log(`target : ${nextUrl}`);

    if (dryRun) continue;

    try {
      const result = await overwriteCompressed(resource);
      updated += 1;
      console.log(`updated: ${result.bytes} bytes`);
    } catch (error) {
      console.error(String(error));
    }

    if (sleepMs > 0) await sleep(sleepMs);
  }

  console.log(`\nDone. Updated ${updated}/${resources.length} images.`);
  if (dryRun) {
    console.log("Dry run mode was enabled. Set DRY_RUN=false to actually overwrite files.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
