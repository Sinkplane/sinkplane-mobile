/* global __dirname */
// Learn more https://docs.expo.io/guides/customizing-metro
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// @sinkplane/shared installs from GitHub Packages (see .npmrc). For local
// development, `npm run link:shared` points node_modules/@sinkplane/shared/dist
// at the sibling clone's dist/ build output, so Metro must watch the clone.
const sharedDir = path.resolve(__dirname, '../sinkplane-shared');
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
      return context.resolveRequest({ ...context, originModulePath: appOrigin }, moduleName, platform);
    }
    return previousResolveRequest
      ? previousResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
