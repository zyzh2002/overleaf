type SubscriptionBase = {
  featuresPageURL: string
}

export type FreePlanSubscription = {
  type: 'free'
} & SubscriptionBase

type FreeSubscription = FreePlanSubscription

type PaidSubscriptionBase = {
  plan: {
    name: string
  }
  subscription: {
    teamName?: string
    name: string
  }
} & SubscriptionBase

export type IndividualPlanSubscription = {
  type: 'individual'
  remainingTrialDays: number
} & PaidSubscriptionBase

export type GroupPlanSubscription = {
  type: 'group'
  remainingTrialDays: number
} & PaidSubscriptionBase

export type CommonsPlanSubscription = {
  type: 'commons'
} & PaidSubscriptionBase

type PaidSubscription =
  | IndividualPlanSubscription
  | GroupPlanSubscription
  | CommonsPlanSubscription

export type Subscription = FreeSubscription | PaidSubscription
