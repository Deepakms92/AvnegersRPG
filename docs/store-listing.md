# WellPing store listing (draft)

Copy-paste text for Google Play Console and App Store Connect. Character limits are in brackets.

## App name

- **Google Play title** [30]: `WellPing: Move Break Reminder` (29)
- **App Store name** [30]: `WellPing: Move Break Reminder` (29)
- **App Store subtitle** [30]: `Sit less. Level up by moving.` (29)

## Short description (Google Play) [80]

`Sitting too long? WellPing tells you out loud to move, and makes it a game.` (75)

## Full description (both stores) [4000]

```
Sitting for hours is easy to do and hard to notice. WellPing notices for you.

Set how long you want to sit (15, 30, 45, 60 or 90 minutes). When time's up, WellPing tells you OUT LOUD to get up and move, and keeps nudging you until you do.

TURN MOVING INTO A GAME
• Meet Pip, your buddy. Pip gets stiff while you sit, turns into a zombie if you sit too long, and evolves as you level up.
• Challenge cards: every reminder deals a card, from "Shoulder Rolls" to the Legendary "Stairway Hero". Collect all 25!
• Voice personalities: be nagged by a Drill Sergeant, Grandma, a Sarcastic Robot, a Pirate and more.
• XP and levels: rise from Couch Potato to Legend of Motion.
• Daily quest and streaks, 10 badges and hats for Pip.

REMINDERS THAT ACTUALLY WORK
• Spoken alerts when the app is open, so you can't miss them.
• Reminders keep coming even when the app is closed, until you move.
• Tap "I moved!" or "Snooze 5 min" right from the notification.
• Work hours: reminders only when you want them. Weekends off don't break your streak.
• Walk around and WellPing notices: about 30 steps resets your timer automatically.

PRIVATE BY DESIGN
• No account, no ads, no tracking.
• Your progress and step data never leave your phone.

Stand up, stretch, walk to the kitchen, refill your water. Small breaks add up. Let WellPing ping you.
```

## Keywords (App Store only) [100]

`sitting,stand up,break,reminder,posture,desk,office,move,walk,stretch,habit,health,timer,sedentary` (98)

## Category

- **Google Play:** Health & Fitness
- **App Store:** Health & Fitness (primary), Productivity (secondary)

## Content rating

Answer "No" to all violence, sexual content, gambling, user interaction and data sharing
questions. Expected result: **Everyone** (Google Play) / **4+** (App Store).

## Privacy

- **Privacy policy URL:** host `docs/privacy/index.html` and paste its address.
  Replace `CONTACT_EMAIL` in that file first.
- **Google Play, Data safety:**
  - Does your app collect or share any of the required user data types? **No.**
    (Step counts are processed on the device only and never transmitted, which Google
    doesn't count as "collected".)
  - Is all of the user data collected by your app encrypted in transit? Not applicable.
  - Do you provide a way for users to request that their data is deleted? Not applicable (no
    data collected). Uninstalling removes everything.
- **App Store, App Privacy:** **Data Not Collected.**

## Permissions, with reasons for reviewers

| Permission | Platform | Why WellPing needs it |
| --- | --- | --- |
| Notifications | Both | To remind you to move when you've been sitting too long. |
| Physical activity / Motion & Fitness | Both | To count steps on the device so walking resets the timer. Optional. |
| Run at startup (`RECEIVE_BOOT_COMPLETED`) | Android | To restore scheduled reminders after the phone restarts. |
| Vibrate | Android | Reminder alerts vibrate. |

WellPing doesn't use exact alarms, so no exact-alarm declaration is needed on Google Play.
Reminders may arrive up to a few minutes late on some phones in battery-saving mode.

## Screenshots

Generated in `docs/screenshots/`:

- `play/` for Google Play: 1080 × 1920 phone screenshots (2 to 8 needed).
- `appstore/` for the App Store: 1290 × 2796 (6.9" iPhone display size).

## Before you submit (checklist)

- [ ] Replace `CONTACT_EMAIL` in `docs/privacy/index.html` and host it.
- [ ] Google Play: create the app, run a **closed test with 12+ testers for 14 days**
      (required for new personal developer accounts), then apply for production.
- [ ] Build the store versions: `npx eas-cli@latest build -p android --profile production`
      (makes an `.aab`) and `npx eas-cli@latest build -p ios --profile production`.
- [ ] Upload: `npx eas-cli@latest submit -p android` / `npx eas-cli@latest submit -p ios`.
- [ ] Increase `version` / `versionCode` / `buildNumber` in `app.json` for every new upload.
