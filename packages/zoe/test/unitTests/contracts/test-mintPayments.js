/* global __dirname */
// @ts-check
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava';

import bundleSource from '@agoric/bundle-source';
import { E } from '@agoric/eventual-send';
import { makeIssuerKit, AmountMath } from '@agoric/ertp';
import fakeVatAdmin from '../../../tools/fakeVatAdmin';

// noinspection ES6PreferShortImport
import { makeZoe } from '../../../src/zoeService/zoe';

const mintPaymentsRoot = `${__dirname}/../../../src/contracts/mintPayments`;

test('zoe - mint payments', async t => {
  t.plan(2);
  const zoe = makeZoe(fakeVatAdmin);

  const makeAlice = () => {
    return {
      installCode: async () => {
        // pack the contract
        const bundle = await bundleSource(mintPaymentsRoot);
        // install the contract
        const installationP = E(zoe).install(bundle);
        return installationP;
      },
      startInstance: async installation => {
        const adminP = zoe.startInstance(installation);
        return adminP;
      },
    };
  };

  const makeBob = installation => {
    return {
      offer: async untrustedInvitation => {
        const invitationIssuer = E(zoe).getInvitationIssuer();
        const invitation = E(invitationIssuer).claim(untrustedInvitation);

        const {
          value: [invitationValue],
        } = await E(invitationIssuer).getAmountOf(invitation);

        t.is(
          invitationValue.installation,
          installation,
          'installation is mintPayment',
        );

        const { instance } = invitationValue;

        const seat = await E(zoe).offer(
          invitation,
          undefined,
          undefined,
          harden({
            value: 4000n,
          }),
        );

        const paymentP = E(seat).getPayout('Token');

        // Let's get the tokenIssuer from the contract so we can evaluate
        // what we get as our payout
        const publicFacet = await E(zoe).getPublicFacet(instance);
        const tokenIssuer = await E(publicFacet).getTokenIssuer();
        const tokenBrand = await E(tokenIssuer).getBrand();

        const tokens4000 = await AmountMath.make(4000n, tokenBrand);
        const tokenPayoutAmount = await E(tokenIssuer).getAmountOf(paymentP);

        // Bob got 4000 tokens
        t.deepEqual(tokenPayoutAmount, tokens4000);
      },
    };
  };

  // Setup Alice
  const alice = await makeAlice();
  const installation = await alice.installCode();
  const { creatorFacet } = await E(alice).startInstance(installation);
  const invitation = E(creatorFacet).makeInvitation();

  // Setup Bob
  const bob = makeBob(installation);
  await bob.offer(invitation);
});

test('zoe - mint payments with unrelated give and want', async t => {
  t.plan(3);
  const zoe = makeZoe(fakeVatAdmin);
  const moolaKit = makeIssuerKit('moola');
  const simoleanKit = makeIssuerKit('simolean');

  const makeAlice = () => {
    return {
      installCode: async () => {
        // pack the contract
        const bundle = await bundleSource(mintPaymentsRoot);
        // install the contract
        const installationP = E(zoe).install(bundle);
        return installationP;
      },
      startInstance: async installation => {
        const issuerKeywordRecord = harden({
          Asset: moolaKit.issuer,
          Price: simoleanKit.issuer,
        });
        const adminP = await E(zoe).startInstance(
          installation,
          issuerKeywordRecord,
        );
        return adminP;
      },
    };
  };

  const makeBob = (installation, moolaPayment) => {
    return {
      offer: async untrustedInvitation => {
        const invitationIssuer = E(zoe).getInvitationIssuer();
        const invitation = E(invitationIssuer).claim(untrustedInvitation);

        const {
          value: [invitationValue],
        } = await E(invitationIssuer).getAmountOf(invitation);

        t.is(
          invitationValue.installation,
          installation,
          'installation is mintPayment',
        );

        const { instance } = invitationValue;

        const proposal = harden({
          give: { Asset: AmountMath.make(10n, moolaKit.brand) },
          want: { Price: AmountMath.make(100n, simoleanKit.brand) },
        });
        const paymentKeywordRecord = harden({
          Asset: moolaPayment,
        });
        const seat = await E(zoe).offer(
          invitation,
          proposal,
          paymentKeywordRecord,
          harden({ value: 2000n }),
        );

        const tokenPaymentP = E(seat).getPayout('Token');
        const moolaRefundP = E(seat).getPayout('Asset');

        // Let's get the tokenIssuer from the contract so we can evaluate
        // what we get as our payout
        const publicFacet = await E(zoe).getPublicFacet(instance);
        const tokenIssuer = await E(publicFacet).getTokenIssuer();
        const tokenBrand = await E(tokenIssuer).getBrand();

        const tokens2000 = await AmountMath.make(2000n, tokenBrand);
        const tokenPayoutAmount = await E(tokenIssuer).getAmountOf(
          tokenPaymentP,
        );

        // Bob got 2000 tokens
        t.deepEqual(tokenPayoutAmount, tokens2000);

        // Got refunded all the moola given
        t.deepEqual(
          await E(moolaKit.issuer).getAmountOf(moolaRefundP),
          AmountMath.make(10n, moolaKit.brand),
        );
      },
    };
  };

  // Setup Alice
  const alice = await makeAlice();
  const installation = await alice.installCode();
  const { creatorFacet } = await E(alice).startInstance(installation);
  const invitation = E(creatorFacet).makeInvitation();

  // Setup Bob
  const bob = makeBob(
    installation,
    moolaKit.mint.mintPayment(AmountMath.make(10n, moolaKit.brand)),
  );
  await bob.offer(invitation);
});
