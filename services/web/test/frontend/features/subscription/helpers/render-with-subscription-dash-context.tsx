import { render } from '@testing-library/react'
import _ from 'lodash'
import { SubscriptionDashboardProvider } from '../../../../../frontend/js/features/subscription/context/subscription-dashboard-context'
import { groupPriceByUsageTypeAndSize, plans } from '../fixtures/plans'
import fetchMock from 'fetch-mock'

export function renderWithSubscriptionDashContext(
  component: React.ReactElement,
  options?: {
    metaTags?: {
      name: string
      value: string | object | Array<object> | boolean
    }[]
    recurlyNotLoaded?: boolean
    queryingRecurly?: boolean
    currencyCode?: string
  }
) {
  const SubscriptionDashboardProviderWrapper = ({
    children,
  }: {
    children: React.ReactNode
  }) => (
    <SubscriptionDashboardProvider>{children}</SubscriptionDashboardProvider>
  )

  window.metaAttributesCache = new Map()
  options?.metaTags?.forEach(tag =>
    window.metaAttributesCache.set(tag.name, tag.value)
  )

  if (!options?.recurlyNotLoaded) {
    // @ts-ignore
    global.recurly = {
      configure: () => {},
      Pricing: {
        Subscription: () => {
          return {
            plan: (planCode: string) => {
              let plan
              const isGroupPlan = planCode.includes('group')
              if (isGroupPlan) {
                const [, planType, size, usage] = planCode.split('_')
                const currencyCode = options?.currencyCode || 'USD'
                plan = _.get(groupPriceByUsageTypeAndSize, [
                  usage,
                  planType,
                  currencyCode,
                  size,
                ])
              } else {
                plan = plans.find(p => p.planCode === planCode)
              }

              const response = {
                next: {
                  total: plan?.price_in_cents
                    ? plan.price_in_cents / 100
                    : undefined,
                },
              }
              return {
                currency: () => {
                  return {
                    catch: () => {
                      return {
                        done: (callback: (response: object) => void) => {
                          if (!options?.queryingRecurly) {
                            return callback(response)
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
      },
    }
  }

  return render(component, {
    wrapper: SubscriptionDashboardProviderWrapper,
  })
}

export function cleanUpContext() {
  // @ts-ignore
  delete global.recurly
  window.metaAttributesCache = new Map()
  fetchMock.reset()
}
