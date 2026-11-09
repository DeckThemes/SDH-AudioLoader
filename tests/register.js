// Lets the tests load the plugin's TypeScript files directly (no extra tools needed:
// it uses the "typescript" package that the build already installs).
const ts = require("typescript");
const fs = require("fs");

require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  });
  module._compile(out.outputText, filename);
};
