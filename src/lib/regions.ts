// Region availability. The status itself lives in the database (Region.status, edited in Admin → Settings);
// these helpers are the only place that interprets it, on the server and in the browser alike.
// Launching USA or Europe = switching its status to ACTIVE. No component needs to change.

export type RegionStatus = 'ACTIVE' | 'COMING_SOON';
type RegionLike = { enabled: boolean; status: RegionStatus | string };

/** Customers can order from it and staff can quote it. */
export const isOrderable = (r: RegionLike | null | undefined) => !!r && r.enabled && r.status === 'ACTIVE';

/** Announced on the site, but closed for orders. */
export const isComingSoon = (r: RegionLike | null | undefined) => !!r && r.enabled && r.status === 'COMING_SOON';

/** Regions that are shown on the public site at all (active or announced). */
export const isPublic = (r: RegionLike) => r.enabled;
