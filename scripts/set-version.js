#!/usr/bin/env node
'use strict';
/**
 * Versiya boshqaruvi: barcha komponentlarni bitta semver bilan sinxron yangilaydi.
 *
 *   node scripts/set-version.js 1.2.0     # yangilash
 *   node scripts/set-version.js --check   # VERSION fayli bilan barcha komponentlar mosligini tekshirish
 *   node scripts/set-version.js --check v1.2.0   # + git tag bilan solishtirish (CI release)
 *
 * versionCode = MAJOR*10000 + MINOR*100 + PATCH  (1.1.0 -> 10100). Minor/patch 99 dan oshmasligi kerak.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const file = (...p) => path.join(root, ...p);
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function codeOf(version) {
  const [, M, m, p] = SEMVER.exec(version);
  if (Number(m) > 99 || Number(p) > 99) throw new Error('minor/patch 99 dan oshmasligi kerak');
  return Number(M) * 10000 + Number(m) * 100 + Number(p);
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');

function state() {
  const gp = fs.readFileSync(file('android', 'gradle.properties'), 'utf8');
  const app = readJson(file('client', 'app.json')).expo;
  return {
    VERSION: fs.readFileSync(file('VERSION'), 'utf8').trim(),
    'server/package.json': readJson(file('server', 'package.json')).version,
    'client/package.json': readJson(file('client', 'package.json')).version,
    'client/app.json (version)': app.version,
    'client/app.json (android.versionCode)': String(app.android.versionCode),
    'client/app.json (ios.buildNumber)': String(app.ios.buildNumber),
    'android VERSION_NAME': (/^VERSION_NAME=(.*)$/m.exec(gp) || [])[1],
    'android VERSION_CODE': (/^VERSION_CODE=(.*)$/m.exec(gp) || [])[1],
  };
}

function check(tag) {
  const s = state();
  const version = s.VERSION;
  if (!SEMVER.test(version)) throw new Error(`VERSION noto‘g‘ri: ${version}`);
  const code = String(codeOf(version));
  const expected = {
    'server/package.json': version,
    'client/package.json': version,
    'client/app.json (version)': version,
    'client/app.json (android.versionCode)': code,
    'client/app.json (ios.buildNumber)': code,
    'android VERSION_NAME': version,
    'android VERSION_CODE': code,
  };
  let bad = 0;
  for (const [k, v] of Object.entries(expected)) {
    if (s[k] !== v) { bad += 1; console.error(`MOS EMAS: ${k} = ${s[k]} (kutilgan: ${v})`); }
  }
  if (tag && tag.replace(/^v/, '') !== version) {
    bad += 1;
    console.error(`Git tag (${tag}) VERSION (${version}) bilan mos emas`);
  }
  if (bad) process.exit(1);
  console.log(`Versiyalar mos: ${version} (versionCode ${code})`);
}

function set(version) {
  if (!SEMVER.test(version)) throw new Error('Format: MAJOR.MINOR.PATCH (masalan 1.2.0)');
  const code = codeOf(version);
  fs.writeFileSync(file('VERSION'), version + '\n');
  for (const f of [file('server', 'package.json'), file('client', 'package.json')]) {
    const d = readJson(f); d.version = version; writeJson(f, d);
  }
  const appF = file('client', 'app.json');
  const app = readJson(appF);
  app.expo.version = version;
  app.expo.android.versionCode = code;
  app.expo.ios.buildNumber = String(code);
  writeJson(appF, app);
  const gpF = file('android', 'gradle.properties');
  let gp = fs.readFileSync(gpF, 'utf8');
  gp = gp.replace(/^VERSION_NAME=.*$/m, `VERSION_NAME=${version}`).replace(/^VERSION_CODE=.*$/m, `VERSION_CODE=${code}`);
  fs.writeFileSync(gpF, gp);
  console.log(`Versiya ${version} (versionCode ${code}) barcha komponentlarda o‘rnatildi.`);
}

const [arg, extra] = process.argv.slice(2);
try {
  if (arg === '--check') check(extra);
  else if (arg) set(arg.replace(/^v/, ''));
  else { console.error('Foydalanish: node scripts/set-version.js <versiya> | --check [tag]'); process.exit(2); }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
