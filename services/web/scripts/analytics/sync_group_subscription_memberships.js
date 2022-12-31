const GoogleBigQueryHelper = require('./helpers/GoogleBigQueryHelper')
const { Subscription } = require('../../app/src/models/Subscription')
const { waitForDb } = require('../../app/src/infrastructure/mongodb')
const AnalyticsManager = require('../../app/src/Features/Analytics/AnalyticsManager')
const {
  DeletedSubscription,
} = require('../../app/src/models/DeletedSubscription')
const minimist = require('minimist')
const _ = require('lodash')

let FETCH_LIMIT, COMMIT, VERBOSE

async function main() {
  await waitForDb()

  console.log('## Syncing group subscription memberships...')

  const subscriptionsCount = await Subscription.count({ groupPlan: true })
  const deletedSubscriptionsCount = await DeletedSubscription.count({
    'subscription.groupPlan': true,
  })

  console.log(
    `## Going to synchronize ${subscriptionsCount} subscriptions and ${deletedSubscriptionsCount} deleted subscriptions`
  )

  await checkActiveSubscriptions()
  await checkDeletedSubscriptions()
}

async function checkActiveSubscriptions() {
  let totalSubscriptionsChecked = 0
  let subscriptions
  do {
    subscriptions = await Subscription.find(
      { groupPlan: true },
      { recurlySubscription_id: 1, member_ids: 1 }
    )
      .sort('_id')
      .skip(totalSubscriptionsChecked)
      .limit(FETCH_LIMIT)
      .lean()

    if (subscriptions.length) {
      const groupIds = subscriptions.map(sub => sub._id)
      const bigQueryGroupMemberships = await fetchBigQueryMembershipStatuses(
        groupIds
      )
      const membershipsByGroupId = _.groupBy(
        bigQueryGroupMemberships,
        'group_id'
      )

      for (const subscription of subscriptions) {
        checkSubscriptionMemberships(
          subscription,
          membershipsByGroupId[subscription._id.toString()]
        )
      }
      totalSubscriptionsChecked += subscriptions.length
    }
  } while (subscriptions.length > 0)
}

async function checkDeletedSubscriptions() {
  let totalDeletedSubscriptionsChecked = 0
  let deletedSubscriptions
  do {
    deletedSubscriptions = (
      await DeletedSubscription.find(
        { 'subscription.groupPlan': true },
        { subscription: 1 }
      )
        .sort('deletedAt')
        .skip(totalDeletedSubscriptionsChecked)
        .limit(FETCH_LIMIT)
    ).map(sub => sub.toObject().subscription)

    if (deletedSubscriptions.length) {
      const groupIds = deletedSubscriptions.map(sub => sub._id.toString())
      const bigQueryGroupMemberships = await fetchBigQueryMembershipStatuses(
        groupIds
      )

      for (const deletedSubscription of deletedSubscriptions) {
        checkDeletedSubscriptionMemberships(
          deletedSubscription,
          _.filter(bigQueryGroupMemberships, {
            group_id: deletedSubscription._id.toString(),
          })
        )
      }
      totalDeletedSubscriptionsChecked += deletedSubscriptions.length
    }
  } while (deletedSubscriptions.length > 0)
}

function checkSubscriptionMemberships(subscription, membershipStatuses) {
  if (VERBOSE) {
    console.log(
      '\n###########################################################################################',
      '\n# Subscription (mongo): ',
      '\n# _id: \t\t\t\t',
      subscription._id.toString(),
      '\n# member_ids: \t\t\t',
      subscription.member_ids,
      '\n# recurlySubscription_id: \t',
      subscription.recurlySubscription_id
    )
    console.log('#\n# Membership statuses found in BigQuery: ')
    console.table(membershipStatuses)
  }
  // create missing `joined` events when membership status is missing
  for (const memberId of subscription.member_ids) {
    if (
      !_.find(membershipStatuses, {
        user_id: memberId.toString(),
        is_member: true,
      })
    ) {
      sendCorrectiveEvent(memberId, 'group-subscription-joined', subscription)
    }
  }
  // create missing `left` events if user is not a member of the group anymore
  for (const { user_id: userId, is_member: isMember } of membershipStatuses) {
    if (
      isMember &&
      !subscription.member_ids.some(sub => sub.id.toString() === userId)
    ) {
      sendCorrectiveEvent(userId, 'group-subscription-left', subscription)
    }
  }
}

function checkDeletedSubscriptionMemberships(subscription, membershipStatuses) {
  if (VERBOSE) {
    console.log(
      '\n###########################################################################################',
      '\n# Deleted subscription (mongo): ',
      '\n# _id: \t\t\t\t',
      subscription._id.toString(),
      '\n# member_ids: \t\t\t',
      subscription.member_ids,
      '\n# recurlySubscription_id: \t',
      subscription.recurlySubscription_id
    )
    console.log('#\n# Membership statuses found in BigQuery: ')
    console.table(membershipStatuses)
  }

  const updatedUserIds = new Set()
  // create missing `left` events if user was a member of the group in BQ and status is not up-to-date
  for (const memberId of subscription.member_ids.map(id => id.toString())) {
    if (
      _.find(membershipStatuses, {
        user_id: memberId,
        is_member: true,
      })
    ) {
      sendCorrectiveEvent(memberId, 'group-subscription-left', subscription)
      updatedUserIds.add(memberId)
    }
  }
  // for cases where the user has been removed from the subscription before it was deleted and status is not up-to-date
  for (const { user_id: userId, is_member: isMember } of membershipStatuses) {
    if (isMember && !updatedUserIds.has(userId)) {
      sendCorrectiveEvent(userId, 'group-subscription-left', subscription)
      updatedUserIds.add(userId)
    }
  }
}

function sendCorrectiveEvent(userId, event, subscription) {
  const segmentation = {
    groupId: subscription._id.toString(),
    subscriptionId: subscription.recurlySubscription_id,
    source: 'sync',
  }
  if (COMMIT) {
    console.log(
      `Sending event '${event}' for user ${userId} with segmentation: ${JSON.stringify(
        segmentation
      )}`
    )
    AnalyticsManager.recordEventForUser(userId, event, segmentation)
  } else {
    console.log(
      `Dry run - would send event '${event}' for user ${userId} with segmentation: ${JSON.stringify(
        segmentation
      )}`
    )
  }
}

async function fetchBigQueryMembershipStatuses(groupIds) {
  const joinedGroupIds = groupIds.map(id => `"${id}"`).join(',')
  const query = `\
    WITH memberships AS (
      SELECT
        user_id, group_id, is_member, created_at,
        ROW_NUMBER() OVER(PARTITION BY group_id, user_id ORDER BY created_at DESC) AS row_number
      FROM analytics.user_group_memberships
      WHERE group_id IN (${joinedGroupIds})
    )

    SELECT
      group_id,
      COALESCE(user_aliases.user_id, memberships.user_id) AS user_id,
      is_member,
      memberships.created_at
    FROM memberships
    LEFT JOIN analytics.user_aliases ON memberships.user_id = user_aliases.analytics_id
    WHERE row_number = 1;
  `

  return GoogleBigQueryHelper.query(query)
}

const setup = () => {
  const argv = minimist(process.argv.slice(2))
  FETCH_LIMIT = argv.fetch ? argv.fetch : 100
  COMMIT = argv.commit !== undefined
  VERBOSE = argv.debug !== undefined
  if (!COMMIT) {
    console.warn('Doing dry run without --commit')
  }
  if (VERBOSE) {
    console.log('Running in verbose mode')
  }
}

setup()
main()
  .then(() => {
    console.error('Done.')
    process.exit(0)
  })
  .catch(error => {
    console.error({ error })
    process.exit(1)
  })
