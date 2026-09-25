/**
 * clean — remove the built bundle from wherever the build writes it (the dev
 * vault's plugin folder, or dist/). Its settings and modules stay.
 */
import { rmSync } from 'fs';
import { resolve } from 'path';
import { outputDir } from './paths.mjs';

for (const f of ['main.js', 'styles.css']) rmSync(resolve(outputDir, f), { force: true });
