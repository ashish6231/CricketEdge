// ODI matches select the team with the lower frozen pre-match provider total.
import { createProviderTotalMatchProfile } from '../providerTotalMatchPredictor.mjs';

export default createProviderTotalMatchProfile(
  'One Day Internationals',
  'match-one-day-internationals-independent-lower-v2',
  { selection: 'lower', scope: 'international' },
);
