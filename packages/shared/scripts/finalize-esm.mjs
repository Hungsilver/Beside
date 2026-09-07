// Gói này khai báo "type": "commonjs" ở gốc, nên Node sẽ hiểu mọi file .js là CJS.
// Bản build ESM nằm ở dist/esm cần một package.json riêng đánh dấu là module,
// nếu không Node sẽ nạp nhầm và báo "Cannot use import statement outside a module".
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esmDir = join(root, 'dist', 'esm');

if (!existsSync(esmDir)) {
  console.error('Không tìm thấy dist/esm — chạy `tsc -p tsconfig.esm.json` trước.');
  process.exit(1);
}

writeFileSync(
  join(esmDir, 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
);
console.log('Đã ghi dist/esm/package.json ({"type":"module"})');
