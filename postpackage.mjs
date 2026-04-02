#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const backupPath = path.join(process.cwd(), 'README.md.bak');
const readmePath = path.join(process.cwd(), 'README.md');

// 恢复 README.md
if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, readmePath);
    fs.unlinkSync(backupPath);
    console.log('README.md restored');
}
