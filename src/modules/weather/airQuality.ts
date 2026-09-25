/**
 * Air quality, from Open-Meteo's separate air-quality endpoint.
 *
 * Same provider, same terms, still no API key — but a distinct host and a
 * distinct request, so it is only fired when the user has switched the section
 * on. A weather widget shouldn't spend a second round-trip on data nobody is
 * looking at.
 *
 * Everything here degrades to null rather than throwing: air quality is a
 * bonus panel, and losing it must never cost the forecast.
 */

import { requestUrl } from 'obsidian';
import type { AirQuality, PollenCounts } from './weatherTypes';

/** Read a numeric field, mapping anything non-finite to null. */
function num(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const CURRENT_VARS = [
    'european_aqi',
    'us_aqi',
    'pm10',
    'pm2_5',
    'carbon_monoxide',
    'nitrogen_dioxide',
    'sulphur_dioxide',
    'ozone',
    // CAMS pollen — populated inside Europe, null elsewhere.
    'alder_pollen',
    'birch_pollen',
    'grass_pollen',
    'mugwort_pollen',
    'olive_pollen',
    'ragweed_pollen',
].join(',');

/**
 * Pollen counts, or null when the location sits outside the CAMS Europe domain
 * and every species came back empty. Distinguishing "no coverage" from "zero
 * grains" matters: the first should hide the section, the second is real news
 * to an allergy sufferer.
 */
function parsePollen(c: Record<string, unknown>): PollenCounts | null {
    const pollen: PollenCounts = {
        alder: num(c.alder_pollen),
        birch: num(c.birch_pollen),
        grass: num(c.grass_pollen),
        mugwort: num(c.mugwort_pollen),
        olive: num(c.olive_pollen),
        ragweed: num(c.ragweed_pollen),
    };
    return Object.values(pollen).some((v) => v !== null) ? pollen : null;
}

export async function fetchAirQuality(lat: number, lon: number): Promise<AirQuality | null> {
    try {
        const res = await requestUrl({
            url:
                `https://air-quality-api.open-meteo.com/v1/air-quality` +
                `?latitude=${lat}&longitude=${lon}&current=${CURRENT_VARS}&timezone=auto`,
        });
        const c = (res.json as { current?: Record<string, unknown> } | undefined)?.current;
        if (!c) return null;

        return {
            europeanAqi: num(c.european_aqi),
            usAqi: num(c.us_aqi),
            pm2_5: num(c.pm2_5),
            pm10: num(c.pm10),
            ozone: num(c.ozone),
            nitrogenDioxide: num(c.nitrogen_dioxide),
            sulphurDioxide: num(c.sulphur_dioxide),
            carbonMonoxide: num(c.carbon_monoxide),
            pollen: parsePollen(c),
            fetchedAt: Date.now(),
        };
    } catch {
        return null;
    }
}
