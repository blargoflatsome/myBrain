import type { TestInfo } from '@playwright/test'

/** The phone test profiles (Android on Chrome, iPhone on Safari's engine). */
export const isPhone = (info: TestInfo) => info.project.name === 'android-phone' || info.project.name === 'iphone'
/** Safari (WebKit) doesn't move focus to a button when it's clicked, so "focus goes back to the button" can't apply. */
export const isSafari = (info: TestInfo) => info.project.name === 'iphone'
