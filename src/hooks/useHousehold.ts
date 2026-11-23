import { useCallback, useEffect, useMemo, useState } from 'react';

import { sampleProfile } from '../../core/profile.js';
import type { Place, Profile } from '../../core/types.js';
import { hasSavedProfile, loadProfile, saveProfile } from '../lib/storage.js';

interface Household {
  household: Profile;
  sample: boolean;
  editProfile: (p: Profile) => void;
}

/**
 * Until the person edits it, the plan says it is built on a sample household, and nothing is stored. The sample fits
 * the country: an LPG cylinder in Delhi, piped gas in Los Angeles.
 */
export function useHousehold(country: Place['country']): Household {
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
