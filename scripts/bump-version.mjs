#!/usr/bin/env node
/**
 * bump-version.mjs
 *
 * Usage: node scripts/bump-version.mjs <newVersion> [pathToApk]
 * Example: node scripts/bump-version.mjs 1.0.3 dist/app-debug.apk
 *
 * Updates in one shot:
 *   - public/version.json (version + sha256 + preserves minSupportedVersion)
 *   - src/lib/version.ts (APP_VERSION fallback if any)
 *   - android/app/build.gradle (versionCode + versionName)
 *
 * SHA-256 is computed only when an APK path is provided. Otherwise sha256 is
 * left untouched (or set to null on first bump).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const [, , newVersion, apkPath] = process.argv;

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('Usage: node scripts/bump-version.mjs <X.Y.Z> [pathToApk]');
  process.exit(1);
}

const root = process.cwd();
const versionJsonPath = resolve(root, 'public/version.json');
const buildGradlePath = resolve(root, 'android/app/build.gradle');

// 1. version.json
const manifest = JSON.parse(readFileSync(versionJsonPath, 'utf8'));
manifest.version = newVersion;
manifest.minSupportedVersion ??= '0.0.0';

if (apkPath) {
  const apkAbs = resolve(root, apkPath);
  if (!existsSync(apkAbs)) {
    console.error(`APK not found at ${apkAbs}`);
    process.exit(1);
  }
  const buf = readFileSync(apkAbs);
  manifest.sha256 = createHash('sha256').update(buf).digest('hex');
  console.log(`✓ SHA-256 (${apkPath}): ${manifest.sha256}`);
} else {
  manifest.sha256 ??= null;
  console.log('ℹ No APK provided — sha256 left as-is. Pass APK path to compute hash.');
}

manifest.apkUrl ??= null;
writeFileSync(versionJsonPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ public/version.json -> ${newVersion}`);

// 2. android/app/build.gradle
let gradle = readFileSync(buildGradlePath, 'utf8');
const codeMatch = gradle.match(/versionCode\s+(\d+)/);
const oldCode = codeMatch ? parseInt(codeMatch[1], 10) : 1;
const newCode = oldCode + 1;
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${newCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
writeFileSync(buildGradlePath, gradle);
console.log(`✓ android/app/build.gradle -> versionName ${newVersion}, versionCode ${newCode}`);

console.log('\nNext steps:');
console.log('  1. npm run build');
console.log('  2. cd android && ./gradlew assembleDebug');
console.log(`  3. node scripts/bump-version.mjs ${newVersion} android/app/build/outputs/apk/debug/app-debug.apk`);
console.log('  4. Upload APK via Admin → APK Manager');
