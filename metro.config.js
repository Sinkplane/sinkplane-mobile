/* global __dirname */
// Learn more https://docs.expo.io/guides/customizing-metro
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// @sinkplane/shared installs from GitHub Packages (see .npmrc). For local
// development, `npm run link:shared` points node_modules/@sinkplane/shared/dist
// at the sibling clone's dist/ build output. Metro resolves that symlink to
// its real path outside this project root, so the clone must be watched
// explicitly, and its bare imports (react, react-native, …) must resolve from
// this project's node_modules — Node-style walk-up from the sibling dir would
// otherwise reach the TV repo's node_modules (via the clone's symlinked
// node_modules) and mix module instances. The clone is optional, so only
// watch it when present.
const sharedDir = path.resolve(__dirname, '../sinkplane-shared');
if (fs.existsSync(sharedDir)) {
  config.watchFolders = [...config.watchFolders, sharedDir];
}
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config;
