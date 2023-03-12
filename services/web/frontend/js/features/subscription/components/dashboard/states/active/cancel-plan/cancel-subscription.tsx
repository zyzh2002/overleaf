import { Trans, useTranslation } from 'react-i18next'
import { Plan } from '../../../../../../../../../types/subscription/plan'
import { postJSON } from '../../../../../../../infrastructure/fetch-json'
import LoadingSpinner from '../../../../../../../shared/components/loading-spinner'
import useAsync from '../../../../../../../shared/hooks/use-async'
import { useSubscriptionDashboardContext } from '../../../../../context/subscription-dashboard-context'
import {
  cancelSubscriptionUrl,
  redirectAfterCancelSubscriptionUrl,
} from '../../../../../data/subscription-url'
import canExtendTrial from '../../../../../util/can-extend-trial'
import showDowngradeOption from '../../../../../util/show-downgrade-option'
import ActionButtonText from '../../../action-button-text'
import GenericErrorAlert from '../../../generic-error-alert'
import DowngradePlanButton from './downgrade-plan-button'
import ExtendTrialButton from './extend-trial-button'

const planCodeToDowngradeTo = 'paid-personal'

function ConfirmCancelSubscriptionButton({
  buttonClass,
  buttonText,
  handleCancelSubscription,
  isLoadingCancel,
  isSuccessCancel,
  isButtonDisabled,
}: {
  buttonClass: string
  buttonText: string
  handleCancelSubscription: () => void
  isLoadingCancel: boolean
  isSuccessCancel: boolean
  isButtonDisabled: boolean
}) {
  return (
    <button
      className={`btn ${buttonClass}`}
      onClick={handleCancelSubscription}
      disabled={isButtonDisabled}
    >
      <ActionButtonText
        inflight={isSuccessCancel || isLoadingCancel}
        buttonText={buttonText}
      />
    </button>
  )
}

function NotCancelOption({
  isButtonDisabled,
  isLoadingSecondaryAction,
  isSuccessSecondaryAction,
  planToDowngradeTo,
  showExtendFreeTrial,
  showDowngrade,
  runAsyncSecondaryAction,
}: {
  isButtonDisabled: boolean
  isLoadingSecondaryAction: boolean
  isSuccessSecondaryAction: boolean
  planToDowngradeTo?: Plan
  showExtendFreeTrial: boolean
  showDowngrade: boolean
  runAsyncSecondaryAction: (promise: Promise<unknown>) => Promise<unknown>
}) {
  const { t } = useTranslation()

  const { setShowCancellation } = useSubscriptionDashboardContext()

  if (showExtendFreeTrial) {
    return (
      <>
        <p>
          <Trans
            i18nKey="have_more_days_to_try"
            values={{
              days: 14,
            }}
            components={[
              // eslint-disable-next-line react/jsx-key
              <strong />,
            ]}
          />
        </p>
        <p>
          <ExtendTrialButton
            isButtonDisabled={isButtonDisabled}
            isLoadingSecondaryAction={isLoadingSecondaryAction}
            isSuccessSecondaryAction={isSuccessSecondaryAction}
            runAsyncSecondaryAction={runAsyncSecondaryAction}
          />
        </p>
      </>
    )
  }

  if (showDowngrade && planToDowngradeTo) {
    return (
      <>
        <p>
          <Trans
            i18nKey="interested_in_cheaper_personal_plan"
            values={{
              price: planToDowngradeTo.displayPrice,
            }}
            components={[
              // eslint-disable-next-line react/jsx-key
              <strong />,
            ]}
          />
        </p>
        <p>
          <DowngradePlanButton
            isButtonDisabled={isButtonDisabled}
            isLoadingSecondaryAction={isLoadingSecondaryAction}
            isSuccessSecondaryAction={isSuccessSecondaryAction}
            planToDowngradeTo={planToDowngradeTo}
            runAsyncSecondaryAction={runAsyncSecondaryAction}
          />
        </p>
      </>
    )
  }

  function handleKeepPlan() {
    setShowCancellation(false)
  }

  return (
    <p>
      <button
        className="btn btn-secondary-info btn-secondary"
        onClick={handleKeepPlan}
      >
        {t('i_want_to_stay')}
      </button>
    </p>
  )
}

export function CancelSubscription() {
  const { t } = useTranslation()
  const { personalSubscription, plans } = useSubscriptionDashboardContext()
  const {
    isLoading: isLoadingCancel,
    isError: isErrorCancel,
    isSuccess: isSuccessCancel,
    runAsync: runAsyncCancel,
  } = useAsync()
  const {
    isLoading: isLoadingSecondaryAction,
    isError: isErrorSecondaryAction,
    isSuccess: isSuccessSecondaryAction,
    runAsync: runAsyncSecondaryAction,
  } = useAsync()
  const isButtonDisabled =
    isLoadingCancel ||
    isLoadingSecondaryAction ||
    isSuccessSecondaryAction ||
    isSuccessCancel

  if (!personalSubscription || !('recurly' in personalSubscription)) return null

  const showDowngrade = showDowngradeOption(
    personalSubscription.plan.planCode,
    personalSubscription.plan.groupPlan,
    personalSubscription.recurly.trial_ends_at
  )
  const planToDowngradeTo = plans.find(
    plan => plan.planCode === planCodeToDowngradeTo
  )
  if (showDowngrade && !planToDowngradeTo) {
    return <LoadingSpinner />
  }

  async function handleCancelSubscription() {
    try {
      await runAsyncCancel(postJSON(cancelSubscriptionUrl))
      window.location.assign(redirectAfterCancelSubscriptionUrl)
    } catch (e) {
      console.error(e)
    }
  }

  const showExtendFreeTrial = canExtendTrial(
    personalSubscription.plan.planCode,
    personalSubscription.plan.groupPlan,
    personalSubscription.recurly.trial_ends_at
  )

  let confirmCancelButtonText = t('cancel_my_account')
  let confirmCancelButtonClass = 'btn-primary'
  if (showExtendFreeTrial || showDowngrade) {
    confirmCancelButtonText = t('no_thanks_cancel_now')
    confirmCancelButtonClass = 'btn-inline-link'
  }

  return (
    <div className="text-center">
      <p>
        <strong>{t('wed_love_you_to_stay')}</strong>
      </p>

      {(isErrorCancel || isErrorSecondaryAction) && <GenericErrorAlert />}

      <NotCancelOption
        showExtendFreeTrial={showExtendFreeTrial}
        showDowngrade={showDowngrade}
        isButtonDisabled={isButtonDisabled}
        isLoadingSecondaryAction={isLoadingSecondaryAction}
        isSuccessSecondaryAction={isSuccessSecondaryAction}
        planToDowngradeTo={planToDowngradeTo}
        runAsyncSecondaryAction={runAsyncSecondaryAction}
      />

      <ConfirmCancelSubscriptionButton
        buttonClass={confirmCancelButtonClass}
        buttonText={confirmCancelButtonText}
        isButtonDisabled={isButtonDisabled}
        handleCancelSubscription={handleCancelSubscription}
        isSuccessCancel={isSuccessCancel}
        isLoadingCancel={isLoadingCancel}
      />
    </div>
  )
}
