// @ts-check

import { assert, details as X } from '@agoric/assert';
import { Far } from '@agoric/marshal';
import { E } from '@agoric/eventual-send';

/**
 * @param {ChargeFee} chargeFee
 * @param {Amount} fee
 * @returns {{
 *   install: Install,
 *   unwrapInstallation: UnwrapInstallation
 * }}
 */
export const makeInstallationStorage = (chargeFee, fee) => {
  /** @type {WeakSet<Installation>} */
  const installations = new WeakSet();

  /**
   * Create an installation by permanently storing the bundle. It will be
   * evaluated each time it is used to make a new instance of a contract.
   */
  /** @type {Install} */
  const install = async (chargeAccountP, bundle) => {
    await chargeFee(chargeAccountP, fee);
    assert.typeof(bundle, 'object', X`a bundle must be provided`);
    /** @type {Installation} */
    const installation = Far('Installation', {
      getBundle: () => bundle,
    });
    installations.add(installation);
    return installation;
  };

  const assertInstallation = installation =>
    assert(
      installations.has(installation),
      X`${installation} was not a valid installation`,
    );

  /** @type {UnwrapInstallation} */
  const unwrapInstallation = installationP => {
    return E.when(installationP, installation => {
      assertInstallation(installation);
      const bundle = installation.getBundle();
      return { bundle, installation };
    });
  };

  return harden({
    install,
    unwrapInstallation,
  });
};
