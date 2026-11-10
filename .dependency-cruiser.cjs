// Gate config, adapted from the node-nest-ts starter. Protected: see .gates-protected.
//
// Layers, top to bottom. A layer may import its own folder and anything below it, never above:
//   src/app (Expo Router routes)  →  src/components  →  src/hooks  →  src/notifications, src/utils
//   →  src/shared.ts (the only door to @sinkplane/shared)
const TEST = '(\\.test\\.tsx?$|^__tests__/|^jest/)';
// Metro picks Foo.ios.tsx / Foo.android.tsx / Foo.web.tsx for `./Foo`; dependency-cruiser resolves
// only the plain file, so platform variants look like orphans.
const PLATFORM_VARIANT = '\\.(ios|android|web|native)\\.tsx?$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles make modules impossible to understand or change in isolation.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Nothing imports this file. Delete it or wire it in.',
      from: {
        orphan: true,
        pathNot: [
          TEST,
          PLATFORM_VARIANT,
          // Entry points: the app entry, routes (discovered by Expo Router), scripts, configs.
          '^index\\.ts$',
          '^src/app/',
          '^scripts/',
          '\\.d\\.ts$',
          '^[^/]+\\.(c|m)?js$',
        ],
      },
      to: {},
    },
    {
      name: 'routes-are-entry-points',
      severity: 'error',
      comment:
        'Only Expo Router loads src/app. Move shared screen code into src/components or src/hooks.',
      from: { path: '^src/', pathNot: ['^src/app/', TEST] },
      to: { path: '^src/app/' },
    },
    {
      name: 'components-not-to-routes',
      severity: 'error',
      comment: 'Components are reusable; they never import a route module.',
      from: { path: '^src/components/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'hooks-not-to-components',
      severity: 'error',
      comment:
        'Hooks hold data and behavior, components render. A hook needing a component-owned store means the store belongs next to the hook (or the hook next to the component).',
      from: { path: '^src/hooks/', pathNot: TEST },
      to: { path: '^src/(components|app)/' },
    },
    {
      name: 'services-below-ui',
      severity: 'error',
      comment:
        'src/notifications and src/utils sit below hooks and components: they may not import them.',
      from: { path: '^src/(notifications|utils)/', pathNot: TEST },
      to: { path: '^src/(hooks|components|app)/' },
    },
    {
      name: 'shared-package-through-barrel',
      severity: 'error',
      comment:
        'Import @sinkplane/shared only in src/shared.ts (the mobile-safe re-export). Its own barrel pulls in TV-only native modules and breaks the Metro bundle.',
      from: { pathNot: '^src/shared\\.ts$' },
      to: { path: '(^|/)node_modules/@sinkplane/shared/' },
    },
    {
      name: 'no-shared-connection',
      severity: 'error',
      comment:
        '@sinkplane/shared connection/* is the TV connection server (tcp-socket, zeroconf, cookie-manager): not in this app.',
      from: {},
      to: { path: '@sinkplane/shared/(dist/)?connection' },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: 'Production code must not import test files or test helpers.',
      from: { pathNot: TEST },
      to: { path: TEST },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Production code must not depend on devDependencies.',
      from: { path: '^(src|modules)/', pathNot: TEST },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'This import does not resolve. Fix the path or add the package.',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['^modules/[^/]+/(android|ios)/', '\\.expo/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['react-native', 'import', 'require', 'node', 'default', 'types'],
      mainFields: ['react-native', 'module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.d.ts'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
