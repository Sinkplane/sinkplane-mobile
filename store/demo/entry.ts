/**
 * Metro entry in demo mode: metro.config.js serves this instead of index.ts when SINKPLANE_DEMO=1
 * (`SINKPLANE_DEMO=1 pnpm start`). Installs the demo world, then starts the app as usual.
 */
import './install';
import '../../index';
