# Move Reminder (POC)

A small React Native (Expo) Android app that **tells you out loud** when you've been
sitting too long and need to get up and move.

## What it does

- **Sitting timer.** Choose an interval (15, 30, 45, 60 or 90 min, plus a 1-minute test mode).
  A countdown shows when the next reminder is due.
- **Loud spoken alert.** When time is up and the app is open, it speaks the reminder at full
  volume using text-to-speech, vibrates hard and turns the screen red. It repeats every
  minute until you move.
- **Background alerts.** A reminder plus follow-up nags (+2, +5, +10 and +20 min) are scheduled
  as local notifications. They fire even if the app is in the background or closed. They use
  a max-importance Android channel whose sound plays on the **alarm** audio stream, so they're
  loud even when media volume is low.
- **"I moved!" button.** Resets the timer and reschedules the reminders.
- **Auto-reset on walking.** With the step counter enabled, about 30 steps counts as moving
  and resets the timer.
- Settings and timer state are saved, so the schedule comes back after the app restarts.

## Run it

Requires Node 20+ and an Android phone, or an emulator.

```bash
npm install
npx expo start        # then press "a", or scan the QR code with Expo Go
```

**Expo Go** is enough to try the timer, the spoken alert and local notifications. To get
everything (custom notification channel, step counter permissions, exact alarms), make a
development build:

```bash
npx expo run:android                                 # local build (needs the Android SDK)
# or a cloud build of an installable APK:
npx eas-cli@latest build -p android --profile preview
```

To test quickly, pick **1 min (test)**, turn on **Reminders enabled** and wait. Or tap
**Test the loud alert**.

## Project layout

| File | Purpose |
| --- | --- |
| `App.tsx` | UI, timer loop, foreground alert, step detection |
| `src/reminder.ts` | Notification channel, scheduling, text-to-speech and vibration |
| `src/storage.ts` | Saved settings (AsyncStorage) |
| `app.json` | Expo config: Android package and permissions |
| `eas.json` | EAS build profiles (`preview` builds an APK) |

## Known POC limitations / next steps

- **Speech only plays while the app is open.** In the background you get the loud
  notification sound and vibration, not the spoken sentence. Making it speak in the
  background would need a native foreground service (e.g. Notifee or a custom module)
  that runs text-to-speech when the alarm fires.
- **Steps are only counted while the app is open.** Background step tracking would need
  `getStepCountAsync` polling (iOS) or a foreground service (Android).
- Some Android phone makers (Xiaomi, Samsung, Oppo…) delay or kill scheduled alarms to save
  battery. Excluding the app from battery optimization helps.
- Android locks a notification channel's settings once it's created. If you change the
  channel in `src/reminder.ts`, uninstall and reinstall the app.
- Possible ideas: quiet hours / working hours only, custom alarm sound, your own voice
  recordings, daily stats, a home-screen widget.
