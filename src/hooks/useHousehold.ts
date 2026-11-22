import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasSavedProfile, loadProfile, sampleProfile, saveProfile } from '../lib/profile';
import type { Place, Profile } from '../lib/types';

/**
 * The household the plan is built for. Until the person edits it, the plan says it is built on a sample one, and
 * nothing is stored. The sample household fits the country: an LPG cylinder in Delhi, piped gas in Los Angeles.
 */
export function useHousehold(country: Place['country']) {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [sample, setSample] = useState(() => !hasSavedProfile());
  const editProfile = useCallback((p: Profile): void => {
    setSample(false);
    setProfile(p);
  }, []);

  useEffect(() => {
    if (!sample) saveProfile(profile);
  }, [profile, sample]);

  const household = useMemo(() => (sample ? sampleProfile(country) : profile), [sample, country, profile]);
  return { household, sample, editProfile };
}
