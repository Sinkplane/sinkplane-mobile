import 'expo-router/entry';

import { defineNewPostsTask } from './src/notifications/background-check';

// The background task body has to be defined at module scope on every launch — including when the
// OS starts the JS runtime headless just to run it — so it's defined in the entry, not a route.
defineNewPostsTask();
