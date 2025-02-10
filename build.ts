import { execSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("🏗️  Starting build process...");

  // Check if WASM needs to be built
  const wasmPath = "llhttp/build/wasm/llhttp.wasm";
  if (!await fileExists(wasmPath)) {
    console.log("📦 Building WASM...");
    process.chdir("llhttp");
    execSync("bun i", { stdio: "inherit" });
    execSync("bun run build-wasm", { stdio: "inherit" });
    process.chdir("..");
    console.log("✅ WASM build complete");
  } else {
    console.log("ℹ️  WASM file already exists, skipping build");
  }

  // Run TypeScript compiler
  console.log("📦 Running TypeScript compiler...");
  execSync("bun tsc", { stdio: "inherit" });
  console.log("✅ TypeScript compilation complete");

  // Read and encode WASM file
  console.log("📦 Injecting WASM...");
  const base64Wasm = await readFile(wasmPath, "base64");
  // Read the compiled JS file and replace the placeholder
  let mainJs = await readFile("out/index.js", "utf8");
  mainJs = mainJs.replace("BASE64_WASM_INJECTED_AT_BUILD", base64Wasm);
  
  // Write back the modified file
  await writeFile("out/index.js", mainJs);
  console.log("✅ WASM injection complete");

  console.log("🎉 Build process completed successfully!");
}

main().catch(error => {
  console.error("❌ Build failed:", error);
  process.exit(1);
});
