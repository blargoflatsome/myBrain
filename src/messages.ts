// Every piece of wording the app says to the user lives here, in the "past you" voice (SPEC §2 Voice and tone).
// Draft wording: show the user before finalizing.
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
} as const
