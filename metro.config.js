// Learn more https://docs.expo.io/guides/customizing-metro
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// @sinkplane/shared installs from GitHub Packages (see .npmrc). For local
// development, `pnpm link:shared` points node_modules/@sinkplane/shared/dist
// at the sibling clone's dist/ build output, so Metro must watch the clone.
const sharedDir = path.resolve(__dirname, '../shared');
const hasSharedClone = fs.existsSync(sharedDir);
if (hasSharedClone) {
  config.watchFolders = [...config.watchFolders, sharedDir];
}
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, 'node_modules'),
];

// The shared clone has no node_modules of its own — its `node_modules` is a
// symlink into ../sinkplane-tv (that's how the TV monorepo shares installs).
// When dist/ is linked here, Metro's walk-up resolution from the clone would
// resolve `react`, `react-compiler-runtime`, … from the TV app's copies,
// silently pulling a SECOND React instance into the bundle (surfaces as
// "Invalid hook call" at runtime). Force bare imports from the clone to
// resolve from this app's node_modules instead.
if (hasSharedClone) {
  const appOrigin = path.join(__dirname, 'package.json');
  const previousResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const fromSharedClone = context.originModulePath?.startsWith(`${sharedDir}${path.sep}`);
    const isBareSpecifier = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
    if (fromSharedClone && isBareSpecifier) {
      return context.resolveRequest(
        { ...context, originModulePath: appOrigin },
        moduleName,
        platform,
      );
    }
    return previousResolveRequest
      ? previousResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

// Demo mode (store screenshots, see store/README.md): with SINKPLANE_DEMO=1 the dev server bundles
// store/demo/entry.ts instead of index.ts, so the app runs against the E2E suite's in-memory
// Floatplane API filled with made-up creators. Builds never set it, so they never include it.
if (process.env.SINKPLANE_DEMO === '1') {
  const rewriteRequestUrl = config.server.rewriteRequestUrl;
  config.server.rewriteRequestUrl = (url) => {
    const rewritten = rewriteRequestUrl ? rewriteRequestUrl(url) : url;
    return rewritten.replace(/\/index\.(bundle|map)\?/, '/store/demo/entry.$1?');
  };
  // Expo keeps __tests__ out of bundles; the demo reuses the E2E mock API from there.
  const blockList = [config.resolver.blockList].flat();
  config.resolver.blockList = blockList.map((pattern) =>
    pattern.source.includes('__tests__')
      ? new RegExp(pattern.source.replace('|\\/__tests__\\/.*', ''), pattern.flags)
      : pattern,
  );
}

module.exports = config;
