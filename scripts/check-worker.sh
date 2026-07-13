#!/bin/bash
set -e
cd /home/claude/aurora-repo

echo "=== esbuild syntax check (each worker file individually) ==="
for f in supabase/functions/aurora-worker/*.ts; do
  npx esbuild "$f" --outfile=/tmp/esbuild-check.js --target=es2022 --format=esm >/dev/null
done
echo "OK"

echo "=== real type-check of all worker files together (Deno-shim) ==="
rm -rf /tmp/wcheck && mkdir -p /tmp/wcheck/worker
for f in supabase/functions/aurora-worker/*.ts; do
  cp "$f" /tmp/wcheck/worker/
done
cp src/shared/aurora-shared.ts /tmp/wcheck/worker/_shared.ts 2>/dev/null || true
cat > /tmp/wcheck/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": false, "noEmit": true, "skipLibCheck": true,
    "allowImportingTsExtensions": true, "lib": ["ES2022", "DOM"]
  },
  "include": ["*.ts", "worker/*.ts"]
}
EOF
cat > /tmp/wcheck/deno-shim.d.ts << 'EOF'
declare namespace Deno {
  function serve(handler: (req: Request) => Promise<Response> | Response): void;
  namespace env { function get(key: string): string | undefined; }
}
declare module "https://esm.sh/@supabase/supabase-js@2.108.1" {
  export function createClient(url: string, key: string, opts?: any): any;
}
EOF
npx tsc --project /tmp/wcheck/tsconfig.json 2>&1 | grep -v "manage-setup" || echo "no new errors"
