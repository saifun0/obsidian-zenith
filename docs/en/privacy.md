# Privacy

[← Documentation](../../README.md) · **English** · [Русский](../ru/privacy.md)

The weather widget finds your place from a **city** you type (looked up with Open-Meteo's
geocoding), or from the device's own location, which `api.bigdatacloud.net` then names. A
guess from your IP address, sent to `ipapi.co`, happens only if you switch it on. Forecasts,
and air quality when it is shown, come from Open-Meteo, which receives the coordinates. No API
keys are required and results are cached locally.

Prayer times, in calendar mode, come from `api.aladhan.com`: it receives the location
rounded to about a kilometre, the calculation settings and the device's time zone — once a
year per place and method. In calculated mode prayer times make no requests.

The content library makes no requests of its own. A cover given as a link is loaded from
that address whenever it is shown, like any image in a note.
