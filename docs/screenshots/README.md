# Screenshots

The public welcome and sample lesson were captured from a local production build with Auth0 unconfigured. The saved library, generated lessons and lesson tools use browser-test fixtures with an isolated backend.

| View          | Desktop                                                | Mobile                             |
| ------------- | ------------------------------------------------------ | ---------------------------------- |
| Public sample | [Welcome](desktop-public-welcome.png)                  | [Lesson](mobile-public-lesson.png) |
| Saved library | [Library](desktop-saved-library.png)                   |                                    |
| Lesson tools  | [Hinglish, audio and videos](desktop-enhancements.png) |                                    |

See the [course outline](desktop-generated-course.png) and a [lesson with code and quiz feedback](desktop-generated-lesson.png).

`npm run test:e2e` writes new captures under `artifacts/screenshots/`. `npm run inspect:production` captures the normal production build. These images illustrate local behavior; live providers and hosting still need separate verification.
