// Every piece of wording the app says to the user lives here, in the "past you" voice (SPEC §2 Voice and tone).
// DRAFT: capture, inbox and sync wording awaiting the user's review.
export const messages = {
  appName: 'My Brain',
  home: {
    tagline: 'Past you set this place up. Present you gets to fill it.',
  },
  signIn: {
    heading: 'Welcome back',
    body: 'Past you left some things here for you. Sign in to see them.',
    button: 'Sign in with Google',
    error: "Past you couldn't get signed in just now. Want to try again?",
  },
  signOut: {
    button: 'Sign out',
  },
  capture: {
    openButton: 'Capture',
    placeholder: "What's on your mind?",
    micStart: 'Speak it',
    micListening: 'Listening…',
    micError: "Past you's microphone didn't catch that. Want to try again, or type it?",
    whereHeading: 'Where should this go?',
    destinations: {
      task: 'Task',
      vault: 'The Vault',
      quest: 'Quest',
      later: 'Decide later',
    },
    taskDateLabel: 'When? (optional)',
    taskDateHint: 'Leave it blank and it waits in Undated.',
    bucketLabel: 'Which bucket?',
    newBucket: 'New bucket',
    saved: {
      task: 'Saved. Future you will find it waiting in Tasks.',
      taskUndated: 'Saved. Future you will find it in Undated.',
      vault: (bucket: string) => `Saved to ${bucket}. Future you will be glad you did.`,
      quest: 'Added to your quests. Future you has something for a bored day.',
      later: "Saved to your inbox. Future you can sort it when there's time.",
    },
    savedOffline: "Saved on this device. It'll sync when you're back online.",
    emptyError: 'Nothing to save yet. What did past you want to remember?',
  },
  inbox: {
    heading: 'Inbox',
    itemPrompt: 'Past you jotted this down. Where should it go?',
    empty: "Past you hasn't left anything to sort. Nice.",
  },
  sync: {
    online: 'Synced',
    offline: 'Offline',
    syncing: 'Syncing…',
    pending: (n: number) => `${n} waiting to sync`,
  },
} as const
