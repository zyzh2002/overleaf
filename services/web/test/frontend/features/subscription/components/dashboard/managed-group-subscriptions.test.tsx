import { expect } from 'chai'
import { render, screen } from '@testing-library/react'
import ManagedGroupSubscriptions, {
  ManagedGroupSubscription,
} from '../../../../../../frontend/js/features/subscription/components/dashboard/managed-group-subscriptions'
import {
  groupActiveSubscription,
  groupActiveSubscriptionWithPendingLicenseChange,
} from '../../fixtures/subscriptions'

const managedGroupSubscriptions: ManagedGroupSubscription[] = [
  {
    ...groupActiveSubscription,
    userIsGroupMember: true,
    planLevelName: 'Professional',
    admin_id: {
      id: 'abc123abc123',
      email: 'you@example.com',
    },
  },
  {
    ...groupActiveSubscriptionWithPendingLicenseChange,
    userIsGroupMember: false,
    planLevelName: 'Collaborator',
    admin_id: {
      id: 'bcd456bcd456',
      email: 'someone@example.com',
    },
  },
]

describe('<ManagedGroupSubscriptions />', function () {
  beforeEach(function () {
    window.metaAttributesCache = new Map()
  })

  afterEach(function () {
    window.metaAttributesCache = new Map()
  })

  it('renders all managed group subscriptions', function () {
    render(
      <ManagedGroupSubscriptions subscriptions={managedGroupSubscriptions} />
    )

    const elements = screen.getAllByText('You are a', {
      exact: false,
    })
    expect(elements.length).to.equal(2)
    expect(elements[0].textContent).to.equal(
      'You are a manager and member of the Professional group subscription GAS administered by you@example.com'
    )
    expect(elements[1].textContent).to.equal(
      'You are a manager of the Collaborator group subscription GASWPLC administered by someone@example.com'
    )

    const manageMembersLinks = screen.getAllByText('Manage members')
    expect(manageMembersLinks.length).to.equal(2)
    expect(manageMembersLinks[0].getAttribute('href')).to.equal(
      '/manage/groups/bcd567/members'
    )
    expect(manageMembersLinks[1].getAttribute('href')).to.equal(
      '/manage/groups/def456/members'
    )

    const manageGroupManagersLinks = screen.getAllByText(
      'Manage group managers'
    )
    expect(manageGroupManagersLinks.length).to.equal(2)
    expect(manageGroupManagersLinks[0].getAttribute('href')).to.equal(
      '/manage/groups/bcd567/managers'
    )
    expect(manageGroupManagersLinks[1].getAttribute('href')).to.equal(
      '/manage/groups/def456/managers'
    )

    const viewMetricsLinks = screen.getAllByText('View metrics')
    expect(viewMetricsLinks.length).to.equal(2)
    expect(viewMetricsLinks[0].getAttribute('href')).to.equal(
      '/metrics/groups/bcd567'
    )
    expect(viewMetricsLinks[1].getAttribute('href')).to.equal(
      '/metrics/groups/def456'
    )
  })

  it('renders nothing when there are no group memberships', function () {
    render(<ManagedGroupSubscriptions subscriptions={undefined} />)
    const elements = screen.queryAllByText('You are a', {
      exact: false,
    })
    expect(elements.length).to.equal(0)
  })
})
