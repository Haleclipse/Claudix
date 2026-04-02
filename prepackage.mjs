#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// 备份 README.md
const readmePath = path.join(process.cwd(), 'README.md');
const backupPath = path.join(process.cwd(), 'README.md.bak');

if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
}
fs.copyFileSync(readmePath, backupPath);

// 替换 README 中的 SVG 链接为 PNG
let content = fs.readFileSync(readmePath, 'utf8');
content = content.replaceAll('https://awesome.re/mentioned-badge.svg', 'assets/mentioned-badge.png');
fs.writeFileSync(readmePath, content);

console.log('README.md prepared for packaging');
