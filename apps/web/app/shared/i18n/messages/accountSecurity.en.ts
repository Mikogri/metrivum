// Sign-in and security: the overview in settings, the page for each change, and the second step at sign-in.
export const accountSecurityEn = {
  back: "Sign-in and security",
  enabled: "Enabled",
  disabled: "Disabled",
  notAvailable: "Not available yet",
  hub: {
    title: "Sign-in and security",
    body: "How you sign in and how you can get back into your account. Each change opens its own page.",
    email: "Email address",
    emailBody:
      "You sign in with this address. Password links and security alerts go here.",
    emailPending: (email: string) =>
      `Change to ${email} is waiting for confirmation`,
    changeEmail: "Change email",
    password: "Password",
    passwordBody: "Changed through a link sent to your email address.",
    noPasswordBody: "Not set. You sign in with codes sent to your email.",
    changePassword: "Change password",
    setPassword: "Set password",
    twoFactor: "Two-factor authentication",
    twoFactorOn: (count: number) =>
      `${count} authenticator ${count === 1 ? "app" : "apps"}. Sign-in asks for a code after your password.`,
    twoFactorOff: "Adds a code from an authenticator app after your password.",
    manage: "Manage",
    recovery: "Recovery methods",
    recoveryBody: (count: number) =>
      `${count} ${count === 1 ? "way" : "ways"} back into your account if you lose your password, email or phone.`,
    view: "View",
    recommendTitle: "Turn on two-factor authentication",
    recommendCoach:
      "You manage client accounts and payments. A code from your phone keeps them safe even if your password leaks.",
    recommendClient:
      "A code from your phone keeps your account safe even if your password leaks.",
    recommendAction: "Set it up",
  },
  password: {
    title: "Change password",
    setTitle: "Set a password",
    description:
      "A new password is always set through a link sent to your email address, the same way as when you forget it.",
    steps: [
      "Send a link to your email",
      "Open the link in this browser",
      "Choose a new password",
    ],
    sendTo: "We send the link to",
    noPassword:
      "This account has no password yet. The link lets you set one; you can still sign in with email codes.",
    send: "Send password reset link",
    sentTitle: "Check your inbox",
    sent: (email: string) =>
      `We sent a link to ${email}. It works once and expires after an hour.`,
    sameBrowser:
      "Open it in this browser. A link opened on another device or browser won't work.",
    resend: "Send again",
    resendIn: (seconds: number) => `Send again in ${seconds} s`,
    spam: "Nothing after a few minutes? Check spam or other folders, then send again.",
    signedOutNote:
      "After you save the new password, your other devices are signed out.",
  },
  email: {
    title: "Change email",
    description:
      "Your email changes only after you confirm the change from both your current and your new address.",
    steps: [
      "Enter the new address",
      "Confirm it's you",
      "Open both confirmation links",
    ],
    current: "Current email",
    newEmail: "New email",
    sameEmail: "This is already your email.",
    next: "Continue",
    verifyTitle: "Confirm it's you",
    verifyBody: (email: string) =>
      `Before we send the links for ${email}, confirm it's you.`,
    password: "Current password",
    wrongPassword: "The password is incorrect.",
    noPasswordNote:
      "Your account has no password. The link sent to your current address confirms it's you.",
    submit: "Send confirmation links",
    change: "Change address",
    pendingTitle: "Waiting for confirmation",
    pendingBody: (current: string, next: string) =>
      `We sent a link to ${current} and another to ${next}. Open both. Until then you keep signing in with ${current}.`,
    resend: "Resend links",
    resent: "Links sent again",
    startOver: "Use a different address",
    expiredHint:
      "Links expire after a while. If yours don't work, resend them or start again with a different address.",
    lostAccess: "Can't open your current inbox?",
    lostAccessLink: "See recovery methods",
  },
  twoFactor: {
    title: "Two-factor authentication",
    description:
      "After your password, sign-in asks for a 6-digit code from an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.",
    status: "Status",
    factors: "Authenticator apps",
    factorsBody:
      "Each one can give the sign-in code. Remove one you no longer use.",
    added: (date: string) => `Added ${date}`,
    remove: "Remove",
    enable: "Enable two-factor authentication",
    addAnother: "Add another authenticator",
    backupTip:
      "Add a second authenticator, for example on a tablet or in a password manager, so losing one phone doesn't lock you out.",
    setupTitle: "Set up an authenticator",
    steps: ["Name it", "Scan the QR code", "Enter the code"],
    name: "Name",
    nameHint:
      "Helps you tell devices apart, for example “Phone” or “1Password”.",
    defaultName: "Authenticator",
    continue: "Continue",
    scan: "Open your authenticator app, add an account and scan this code.",
    qrAlt: "QR code for your authenticator app",
    cantScan: "Can't scan it? Enter this key in the app instead:",
    copy: "Copy key",
    copied: "Key copied",
    code: "6-digit code",
    codeHint:
      "The code the app shows for Metrivum. It changes every 30 seconds.",
    turnOn: "Turn on",
    cancel: "Cancel",
    enabledToast: "Two-factor authentication is on",
    addedToast: "Authenticator added",
    enabledNote:
      "Your other devices were signed out. Next time they sign in, they ask for a code.",
    removeTitle: (name: string) => `Remove ${name}?`,
    removeBody: "Confirm with a current code from any of your authenticators.",
    removeLast:
      "This is your only authenticator: two-factor authentication turns off.",
    removePassword: "Current password",
    confirmRemove: "Remove authenticator",
    removed: "Authenticator removed",
    turnedOff: "Two-factor authentication is off",
  },
  challenge: {
    title: "Two-factor authentication",
    subtitle: "Enter the 6-digit code from your authenticator app.",
    stepUpTitle: "Confirm with your authenticator",
    stepUpBody:
      "Your account uses two-factor authentication. Enter a current code to continue.",
    factor: "Authenticator",
    code: "Code",
    verify: "Verify",
    signOut: "Sign out",
    lost: "Lost your authenticator? Use another one you added. If you have none, contact support.",
    signedInAs: (email: string) => `Signed in as ${email}`,
  },
  recovery: {
    title: "Recovery methods",
    description:
      "Ways back into your account if you lose your password, your email or your phone.",
    methods: "Your methods",
    emailMethod: "Verified email",
    emailMethodBody: (email: string) =>
      `Password links and sign-in codes go to ${email}.`,
    authenticators: "Authenticator apps",
    authenticatorsBody: (count: number) =>
      count
        ? `${count} set up. Any of them can give the sign-in code.`
        : "None yet. Without one, your email is the only way back in.",
    backupCodes: "Backup codes",
    backupCodesBody: "One-time codes to print or store. Coming later.",
    phone: "Phone number",
    phoneBody: "Optional backup for codes by text message. Coming later.",
    setUp: "Set up",
    scenarios: "If you lose access",
    forgotTitle: "You forgot your password",
    forgotBody:
      "Choose “Forgot password?” on the sign-in page. A link goes to your email.",
    phoneTitle: "You lost your authenticator",
    phoneBody2:
      "Sign in with another authenticator you added. If you have none, contact support.",
    emailTitle: "You can't open your email",
    emailBody:
      "While you can still open the old inbox, change your email: confirmation goes to both addresses. Without the old inbox, contact support. The address is then changed only after a manual identity check, which takes time and can be refused.",
    bothTitle: "You lost your email and your authenticator",
    bothBody:
      "Contact support. We restore an account only when we can reliably confirm it's yours; a password, a statement or profile details alone are not enough, and otherwise we have to refuse.",
    support: "Contact support",
    supportBody:
      "Write from any address. Never send your password or codes: support will never ask for them.",
  },
  errors: {
    wrongCode:
      "That code didn't work. Check that your phone's time is set automatically and enter the newest code.",
    codeExpired: "The code timed out. Enter the newest one from your app.",
    codeFormat: "Enter the 6 digits from your authenticator app.",
    tooManyFactors:
      "You have the maximum number of authenticators. Remove one first.",
    nameTaken: "You already have an authenticator with this name.",
    needsSecondFactor: "Confirm with your authenticator first.",
    notEnabled: "Two-factor authentication isn't available right now.",
  },
};
