import { useTranslation, Trans } from 'react-i18next'
import PremiumFeaturesLink from '../../premium-features-link'
import { PriceExceptions } from '../../../shared/price-exceptions'
import { useSubscriptionDashboardContext } from '../../../../context/subscription-dashboard-context'
import { Subscription } from '../../../../../../../../types/subscription/dashboard/subscription'
import { CancelSubscriptionButton } from './cancel-subscription-button'
import { CancelSubscription } from './cancel-subscription'
import { PendingPlanChange } from './pending-plan-change'
import { TrialEnding } from './trial-ending'
import { ChangePlan } from './change-plan'

export function ActiveSubscription({
  subscription,
}: {
  subscription: Subscription
}) {
  const { t } = useTranslation()
  const { recurlyLoadError, setShowChangePersonalPlan, showCancellation } =
    useSubscriptionDashboardContext()

  if (showCancellation) return <CancelSubscription />

  return (
    <>
      <p>
        <Trans
          i18nKey="currently_subscribed_to_plan"
          values={{
            planName: subscription.plan.name,
          }}
          components={[
            // eslint-disable-next-line react/jsx-key
            <strong />,
          ]}
        />
        {subscription.pendingPlan && (
          <PendingPlanChange subscription={subscription} />
        )}
        {!subscription.pendingPlan &&
          subscription.recurly.additionalLicenses > 0 && (
            <>
              {' '}
              <Trans
                i18nKey="additional_licenses"
                values={{
                  additionalLicenses: subscription.recurly.additionalLicenses,
                  totalLicenses: subscription.recurly.totalLicenses,
                }}
                components={[
                  // eslint-disable-next-line react/jsx-key
                  <strong />,
                  // eslint-disable-next-line react/jsx-key
                  <strong />,
                ]}
              />
            </>
          )}{' '}
        {!recurlyLoadError &&
          !subscription.groupPlan &&
          subscription.recurly.account.has_past_due_invoice._ !== 'true' && (
            <button
              className="btn-inline-link"
              onClick={() => setShowChangePersonalPlan(true)}
            >
              {t('change_plan')}
            </button>
          )}
      </p>
      {/* && personalSubscription.pendingPlan.name != personalSubscription.plan.name */}
      {subscription.pendingPlan &&
        subscription.pendingPlan.name !== subscription.plan.name && (
          <p>{t('want_change_to_apply_before_plan_end')}</p>
        )}
      {/* TODO: groupPlan */}
      {subscription.recurly.trial_ends_at &&
        subscription.recurly.trialEndsAtFormatted && (
          <TrialEnding
            trialEndsAt={subscription.recurly.trial_ends_at}
            trialEndsAtFormatted={subscription.recurly.trialEndsAtFormatted}
          />
        )}

      <p>
        <Trans
          i18nKey="next_payment_of_x_collectected_on_y"
          values={{
            paymentAmmount: subscription.recurly.displayPrice,
            collectionDate: subscription.recurly.nextPaymentDueAt,
          }}
          components={[
            // eslint-disable-next-line react/jsx-key
            <strong />,
            // eslint-disable-next-line react/jsx-key
            <strong />,
          ]}
        />
      </p>
      <PremiumFeaturesLink />
      <PriceExceptions />
      <p>
        <a
          href={subscription.recurly.billingDetailsLink}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-secondary-info btn-secondary"
        >
          {t('update_your_billing_details')}
        </a>{' '}
        <a
          href={subscription.recurly.accountManagementLink}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-secondary-info btn-secondary"
        >
          {t('view_your_invoices')}
        </a>
      </p>

      {!recurlyLoadError && (
        <CancelSubscriptionButton subscription={subscription} />
      )}

      <ChangePlan />
    </>
  )
}
