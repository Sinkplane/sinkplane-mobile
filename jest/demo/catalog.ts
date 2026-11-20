/**
 * What the demo world (./world.ts) contains: made-up creators, channels, videos, comments and watch
 * history for store screenshots. Nothing here is real Floatplane content. Every `slug` names an
 * image under store/demo/media (thumbs/<video>.jpg, icons/<creator>.png, live/<creator>.jpg),
 * rendered by store/demo/make-media.sh from store/demo/art/.
 */

export interface DemoVideoSpec {
  slug: string;
  title: string;
  /** Length as `minutes:seconds`. */
  length: string;
  likes: number;
  /** Released this many hours before "now". */
  hoursAgo: number;
  description: string;
}

export interface DemoChannelSpec {
  slug: string;
  title: string;
  videos: DemoVideoSpec[];
}

interface DemoLiveSpec {
  title: string;
  description: string;
  /** Broadcasting now (else the Live tab shows its offline card). */
  live: boolean;
  offlineTitle: string;
}

export interface DemoCreatorSpec {
  slug: string;
  title: string;
  category: string;
  about: string;
  plan: string;
  subscribers: string;
  channels: [DemoChannelSpec, ...DemoChannelSpec[]];
  live?: DemoLiveSpec;
}

const video = (
  slug: string,
  title: string,
  [length, likes, hoursAgo, description]: [string, number, number, string],
): DemoVideoSpec => ({ slug, title, length, likes, hoursAgo, description });

const benchNotes: DemoCreatorSpec = {
  slug: 'bench-notes',
  title: 'Bench Notes',
  category: 'Electronics',
  about: 'Repairs, restorations and teardowns from a small garage workbench.',
  plan: 'Bench Supporter',
  subscribers: '48K',
  channels: [
    {
      slug: 'bench-notes-main',
      title: 'Bench Notes',
      videos: [
        video('synth-rebuild', 'I rebuilt a 1984 synthesizer with $40 of parts', [
          '24:18',
          4812,
          5,
          'A dead polysynth from a flea market, a bag of capacitors and one very stubborn filter chip.',
        ]),
        video('usb-chargers', 'Testing 9 cheap USB-C chargers (3 failed badly)', [
          '18:42',
          3920,
          50,
          'Load tests, thermal camera and a teardown of the worst one.',
        ]),
        video('tv-capacitor', 'Why every old TV dies the same way', [
          '15:07',
          2710,
          122,
          'The one capacitor that takes out most CRTs, and how to swap it safely.',
        ]),
        video('quiet-pc', 'Building the quietest PC I could', [
          '31:55',
          5230,
          194,
          'Passive cooling, a lot of foam and a sound meter.',
        ]),
        video('worst-solder', "Fixing the worst soldering job I've ever seen", [
          '21:10',
          3380,
          290,
          'A viewer sent in their first kit build. We fixed it together.',
        ]),
        video('thrift-amp', 'This $12 thrift-store amp was worth saving', [
          '26:33',
          2150,
          386,
          'Recapping, cleaning pots and a first listen.',
        ]),
      ],
    },
    {
      slug: 'bench-notes-teardowns',
      title: 'Teardowns',
      videos: [
        video('smart-lock', "Teardown: a smart lock that isn't very smart", [
          '12:41',
          1840,
          74,
          'What is inside, and why it opens with a magnet.',
        ]),
        video('pager', 'Inside a 30-year-old pager', [
          '9:58',
          1290,
          242,
          'Tiny radios from the nineties, up close.',
        ]),
        video('speaker', "What's inside a $3 Bluetooth speaker?", [
          '8:12',
          2460,
          338,
          'Less than you would hope.',
        ]),
      ],
    },
  ],
  live: {
    title: 'Friday Night Repair Stream',
    description: 'Fixing your broken gadgets live. Bring questions.',
    live: false,
    offlineTitle: 'Back Friday at 7pm',
  },
};

const slowKitchen: DemoCreatorSpec = {
  slug: 'slow-kitchen',
  title: 'Slow Kitchen',
  category: 'Food',
  about: 'Weeknight cooking without the rush.',
  plan: 'Kitchen Regular',
  subscribers: '31K',
  channels: [
    {
      slug: 'slow-kitchen-main',
      title: 'Slow Kitchen',
      videos: [
        video('cast-iron', 'Cast iron myths, tested', [
          '17:20',
          3010,
          26,
          'Soap, metal spatulas and acidic sauces: what actually matters.',
        ]),
        video('ramen', '20-minute weeknight ramen', [
          '11:45',
          2640,
          98,
          'A rich broth without the all-day simmer.',
        ]),
        video('sourdough', 'Sourdough without the stress', [
          '22:03',
          1980,
          218,
          'A forgiving schedule that fits around a workday.',
        ]),
        video('sheet-pan', 'One sheet pan, five dinners', [
          '14:30',
          1750,
          314,
          'Prep once on Sunday, eat well all week.',
        ]),
      ],
    },
  ],
  live: {
    title: 'Sunday cook-along',
    description: 'Cooking dinner together, live.',
    live: false,
    offlineTitle: 'Cook-along Sundays at noon',
  },
};

const nightSignal: DemoCreatorSpec = {
  slug: 'night-signal',
  title: 'Night Signal',
  category: 'Music',
  about: 'Synths, tape machines and late-night jams.',
  plan: 'Signal Boost',
  subscribers: '22K',
  channels: [
    {
      slug: 'night-signal-main',
      title: 'Night Signal',
      videos: [
        video('field-track', 'I made a track from one field recording', [
          '16:44',
          2890,
          50,
          'Rain on a tin roof, chopped into a whole song.',
        ]),
        video('modular-basics', 'Modular synth basics in 15 minutes', [
          '15:02',
          3340,
          146,
          'Oscillators, filters and envelopes with no jargon.',
        ]),
        video('tape-loops', 'Tape loops on a $20 cassette deck', [
          '13:27',
          1560,
          266,
          'Scissors, tape and a lot of hiss.',
        ]),
      ],
    },
  ],
  live: {
    title: 'Late-night synth jam: taking requests',
    description: 'Building a track from scratch with chat.',
    live: true,
    offlineTitle: 'Live most nights at 10pm',
  },
};

const trailLog: DemoCreatorSpec = {
  slug: 'trail-log',
  title: 'Trail Log',
  category: 'Outdoors',
  about: 'Long walks, light packs and camp cooking.',
  plan: 'Trail Crew',
  subscribers: '17K',
  channels: [
    {
      slug: 'trail-log-main',
      title: 'Trail Log',
      videos: [
        video('coast-trail', 'Three days on the coast trail', [
          '27:51',
          2210,
          74,
          'Fog, sea stacks and one very wet tent.',
        ]),
        video('ultralight', 'Ultralight kit for under $300', [
          '19:36',
          1870,
          170,
          'Everything I carry, and what I left behind.',
        ]),
        video('altitude-cooking', 'Cooking at 3,000 meters', [
          '12:18',
          1430,
          362,
          'Why pasta takes forever up there.',
        ]),
      ],
    },
  ],
  live: {
    title: 'Trail Q&A from camp',
    description: 'Answering your questions from the trail.',
    live: false,
    offlineTitle: 'Next Q&A after the trip',
  },
};

export const DEMO_CREATORS: DemoCreatorSpec[] = [benchNotes, slowKitchen, nightSignal, trailLog];

/** The signed-in demo user, and the credentials the demo sign-in screen accepts. */
export const DEMO_USER = {
  id: 'demo-user',
  username: 'alexkim',
  displayName: 'Alex Kim',
  email: 'alex@example.com',
  password: 'demo',
};

/** Watch history: video slug, fraction watched, hours since it was watched (newest first). */
export const DEMO_HISTORY: [string, number, number][] = [
  ['synth-rebuild', 0.62, 1],
  ['field-track', 0.35, 20],
  ['cast-iron', 1, 30],
  ['smart-lock', 0.8, 52],
  ['coast-trail', 0.45, 75],
  ['modular-basics', 1, 100],
  ['ramen', 0.3, 120],
  ['tv-capacitor', 1, 150],
  ['thrift-amp', 0.55, 190],
  ['tape-loops', 0.9, 230],
  ['ultralight', 0.2, 260],
  ['sourdough', 0.7, 300],
];

/**
 * username, comment, likes, replies (each commenter has an avatar at icons/<username>.png). The
 * first video gets all of them; others get a few.
 */
export const DEMO_COMMENTS: [string, string, number, number][] = [
  [
    'maya_builds',
    'The moment the filter came back to life gave me chills. Great restoration.',
    412,
    6,
  ],
  ['ohm_sweet_ohm', 'Love that you showed the failed attempt too. More of that please!', 238, 2],
  [
    'retrowire',
    'I have the same synth in my closet with a dead key bed. Guess what my weekend project is.',
    187,
    0,
  ],
  ['lowpass', 'That $4 chip swap at 14:20 is genius.', 96, 1],
  ['kj.solders', 'The audio demo at the end was worth the wait.', 74, 0],
  ['dana.fixes', 'Subscribed for the calm narration, stayed for the oscilloscope shots.', 51, 0],
];
