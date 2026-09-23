# Privacy

[← Documentation](../../README.md) · **English** · [Русский](../ru/privacy.md)

The Dashboard weather widget resolves your location either from an explicit **city**
(Settings → Weather) via Open-Meteo geocoding, or — when no city is set — from your
approximate location via a request to `ipapi.co`, falling back to the browser's geolocation
prompt. Weather data comes from Open-Meteo. No API keys are required and results are cached
locally.

Prayer times, in calendar mode, come from `api.aladhan.com`: it receives the location
rounded to about a kilometre, the calculation settings and the device's time zone — once a
year per place and method. In calculated mode prayer times make no requests.

The content library makes no requests of its own. A cover given as a link is loaded from
that address whenever it is shown, like any image in a note.
