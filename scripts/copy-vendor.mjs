import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const publicWasm = resolve(root, 'public', 'wasm');

mkdirSync(resolve(publicWasm, 'pdfjs'), { recursive: true });
mkdirSync(resolve(publicWasm, 'tesseract', 'core'), { recursive: true });
mkdirSync(resolve(publicWasm, 'opencv'), { recursive: true });

const copyIfExists = (src, dest) => {
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  } else {
    console.warn(`[copy-vendor] Missing optional asset: ${src}`);
  }
};

// PDF.js worker and standard fonts / cmaps for offline/local-first rendering
copyIfExists(
  resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  resolve(publicWasm, 'pdfjs/pdf.worker.min.mjs'),
);
copyIfExists(
  resolve(root, 'node_modules/pdfjs-dist/cmaps'),
  resolve(publicWasm, 'pdfjs/cmaps'),
);
copyIfExists(
  resolve(root, 'node_modules/pdfjs-dist/standard_fonts'),
  resolve(publicWasm, 'pdfjs/standard_fonts'),
);

// Tesseract.js worker and wasm cores
copyIfExists(
  resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'),
  resolve(publicWasm, 'tesseract/worker.min.js'),
);
const tesseractCoreDir = resolve(root, 'node_modules/tesseract.js-core');
if (existsSync(tesseractCoreDir)) {
  for (const file of readdirSync(tesseractCoreDir)) {
    if (file.startsWith('tesseract-core') && (file.endsWith('.wasm') || file.endsWith('.wasm.js'))) {
      copyIfExists(
        resolve(tesseractCoreDir, file),
        resolve(publicWasm, 'tesseract/core', file),
      );
    }
  }
}

// OpenCV.js
copyIfExists(
  resolve(root, 'node_modules/@techstark/opencv-js/dist/opencv.js'),
  resolve(publicWasm, 'opencv/opencv.js'),
);

console.log('[copy-vendor] Local WASM/worker assets synchronized to public/wasm/');
