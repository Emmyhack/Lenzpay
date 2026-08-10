import { registerHooks } from 'node:module';

import { resolve } from './alias-loader.mjs';

// `registerHooks` runs in-thread (unlike the deprecated `register`), which is
// what the synchronous existsSync probing in the resolver wants anyway.
registerHooks({ resolve });
